from machine import Pin, ADC, I2C, I2S
from utime import sleep
import math
import struct
import time
import ssd1306

# =========================================================================
# HARDWARE INITIALIZATION
# =========================================================================

# I2C bus shared by the OLED display and the MPU6050 accelerometer/gyro.
oled_accel = I2C(1, scl=Pin(15), sda=Pin(14))
display = ssd1306.SSD1306_I2C(128, 64, oled_accel)


# Fret buttons, one per note. List (not dict) since accessed by position --
# frets[i] lines up with NOTE_FREQS[i] and NOTE_BUFFERS[i]. Pull-up wiring:
# HIGH = not pressed, LOW = pressed.
frets = [
    ("Fret 1", Pin(2, Pin.IN, Pin.PULL_UP)),
    ("Fret 2", Pin(3, Pin.IN, Pin.PULL_UP)),
    ("Fret 3", Pin(4, Pin.IN, Pin.PULL_UP)),
    ("Fret 4", Pin(5, Pin.IN, Pin.PULL_UP)),
    ("Fret 5", Pin(6, Pin.IN, Pin.PULL_UP)),
    ("Fret 6", Pin(7, Pin.IN, Pin.PULL_UP)),
    ("Fret 7", Pin(8, Pin.IN, Pin.PULL_UP)),
    ("Fret 8", Pin(9, Pin.IN, Pin.PULL_UP)),
]

# Potentiometers, keyed by name (dict, not list) so each read_*() function
# looks up by name rather than a fragile numeric index.
analog_adjustments = {
    "Volume": ADC(Pin(28, Pin.IN)),
    "Arpeggiator": ADC(Pin(27, Pin.IN)),
    "Sustain": ADC(Pin(26, Pin.IN)),
}

# Effect toggles, keyed by name for the same reason. Pull-up switches read
# LOW when on; Tremolo's pressure-sensor divider reads HIGH when active.
effect_toggles = {
    "Arpeggiator": Pin(10, Pin.IN, Pin.PULL_UP),
    "Sustain": Pin(11, Pin.IN, Pin.PULL_UP),
    "Tremolo": Pin(12, Pin.IN),
}

# I2S audio output -> MAX98357A amp -> speaker.
audio_out = I2S(
    0,
    sck=Pin(17),            # BCLK
    ws=Pin(18),             # LRC
    sd=Pin(16),             # DIN
    mode=I2S.TX,
    bits=16,
    format=I2S.MONO,
    rate=8000,
    ibuf=2000
)


# =========================================================================
# AUDIO GENERATION SETUP
# =========================================================================

SAMPLE_RATE = 8000
CHUNK_DURATION_S = 0.03   # short chunks = near-instant stop on fret release


def make_tone_buffer(frequency, sample_rate, target_duration_s=CHUNK_DURATION_S, amplitude=10000):
    """
    Builds a fixed-amplitude sine tone buffer for ARPEGGIATOR MODE.
    Buffer length is rounded to a whole number of cycles closest to the
    target duration -- keeps pitch accurate and avoids clicks when the
    buffer loops back to its start.
    """
    cycles = max(1, round(target_duration_s * frequency))
    num_samples = round(cycles * sample_rate / frequency)

    buf = bytearray(num_samples * 2)
    phase = 0.0
    phase_increment = frequency / sample_rate
    for i in range(num_samples):
        sample = int(amplitude * math.sin(2 * math.pi * phase))
        struct.pack_into("<h", buf, i * 2, sample)
        phase += phase_increment
        if phase >= 1.0:
            phase -= 1.0
    return buf


def apply_volume(buf, volume_scale):
    """
    Returns a copy of `buf` with every sample scaled by volume_scale
    (0.0-1.0). NOTE_BUFFERS are precomputed at a fixed amplitude, so
    arpeggiator mode needs this to make the Volume pot actually work --
    chord mode applies volume differently, directly while mixing.
    """
    out = bytearray(len(buf))
    for i in range(0, len(buf), 2):
        sample = struct.unpack_from("<h", buf, i)[0]
        scaled = int(sample * volume_scale)
        if scaled > 32767:
            scaled = 32767
        elif scaled < -32768:
            scaled = -32768
        struct.pack_into("<h", out, i, scaled)
    return out


# One octave of C major, an octave up for clarity on a small speaker.
# List of (name, freq) tuples -- accessed by position to match frets[].
NOTE_FREQS = [
    ("C5", 523.25),
    ("D5", 587.33),
    ("E5", 659.25),
    ("F5", 698.46),
    ("G5", 783.99),
    ("A5", 880.00),
    ("B5", 987.77),
    ("C6", 1046.50),
]

# Precomputed once at boot -- no trig math during playback.
NOTE_BUFFERS = [make_tone_buffer(f, SAMPLE_RATE) for _, f in NOTE_FREQS]


# ---------- CHORD MODE: shared wavetable + per-fret phase tracking ----------
# I2S is one mono stream, so simultaneous notes require summing (mixing)
# samples into one buffer. Instead of a separate waveform per note, all
# notes share one 256-sample sine wavetable and each is walked through it
# at its own speed (a phase accumulator) -- easier to mix arbitrary note
# combinations each chunk.
WAVETABLE_SIZE = 256
WAVETABLE = [int(10000 * math.sin(2 * math.pi * i / WAVETABLE_SIZE))
             for i in range(WAVETABLE_SIZE)]

NUM_FRETS = len(frets)

# Per-fret phase, persists across chunks so sustained notes stay click-free
# (each new chunk continues from where the last left off).
chord_phase = [0.0] * NUM_FRETS
chord_phase_increment = [f * WAVETABLE_SIZE /
                         SAMPLE_RATE for _, f in NOTE_FREQS]

# ---------- TREMOLO: second, slightly-detuned phase layer ----------
# Summing two sine waves at a small fixed frequency offset produces
# "beating" -- the combined amplitude pulses at a rate equal to the
# frequency difference. That's tremolo, not a "wider" chorus tone (real
# chorus needs a modulated delay line instead).
TREMOLO_DETUNE_RATIO = 1.006  # ~10 cents sharp: a gentle pulse, not a
# separate out-of-tune note
tremolo_phase = [0.0] * NUM_FRETS
tremolo_phase_increment = [
    inc * TREMOLO_DETUNE_RATIO for inc in chord_phase_increment]

CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION_S)


def generate_mixed_chunk(pressed_frets, volume_scale=1.0, tremolo=False):
    """
    Builds one chord-mode audio chunk by summing the current wavetable
    sample of every held fret (true polyphony). volume_scale applies to
    both the Volume pot and the sustain fade-out tail. tremolo=True adds a
    second detuned voice per note (see TREMOLO comment above).
    """
    buf = bytearray(CHUNK_SAMPLES * 2)
    n = len(pressed_frets)
    if n == 0:
        return buf

    # Tremolo doubles voices per note, so divide by double to keep loudness
    # consistent whether it's on or off.
    voices_per_note = 2 if tremolo else 1
    divisor = n * voices_per_note

    for i in range(CHUNK_SAMPLES):
        total = 0
        for idx in pressed_frets:
            table_idx = int(chord_phase[idx]) % WAVETABLE_SIZE
            total += WAVETABLE[table_idx]
            chord_phase[idx] += chord_phase_increment[idx]

            if tremolo:
                tremolo_table_idx = int(tremolo_phase[idx]) % WAVETABLE_SIZE
                total += WAVETABLE[tremolo_table_idx]
                tremolo_phase[idx] += tremolo_phase_increment[idx]

        sample = int((total // divisor) * volume_scale)
        if sample > 32767:
            sample = 32767
        elif sample < -32768:
            sample = -32768
        struct.pack_into("<h", buf, i * 2, sample)
    return buf


# =========================================================================
# CONTROL INPUT READERS
# =========================================================================

def read_volume():
    """Volume pot -> 0.0-1.0 fraction."""
    raw = analog_adjustments["Volume"].read_u16()
    return raw / 65535


def read_arp_delay_ms():
    """
    Arpeggiator pot -> delay between notes when 2+ frets are held.
    Pot at 0 -> SLOW_DELAY_MS (slow, distinct arpeggio).
    Pot at max -> FAST_DELAY_MS (fast stutter/trill).
    """
    raw = analog_adjustments["Arpeggiator"].read_u16()
    fraction = raw / 65535
    SLOW_DELAY_MS = 300
    FAST_DELAY_MS = 5
    return SLOW_DELAY_MS - fraction * (SLOW_DELAY_MS - FAST_DELAY_MS)


def read_sustain_ms():
    """
    Sustain pot -> fade-out tail length (ms) after all frets release.
    Only used when the Sustain toggle is ON.
    """
    raw = analog_adjustments["Sustain"].read_u16()
    fraction = raw / 65535
    MIN_SUSTAIN_MS = 0
    MAX_SUSTAIN_MS = 1000
    return MIN_SUSTAIN_MS + fraction * (MAX_SUSTAIN_MS - MIN_SUSTAIN_MS)


def is_arpeggiator_mode():
    return effect_toggles["Arpeggiator"].value() == 0


def is_sustain_mode():
    return effect_toggles["Sustain"].value() == 0


def is_tremolo_mode():
    return effect_toggles["Tremolo"].value() == 1


# =========================================================================
# MAIN LOOP
# =========================================================================

# Sustain fade-out state (chord mode only): remembers the last held notes
# and ramps a volume multiplier down to 0 after release.
last_pressed_frets = []
fade_level = 1.0
is_fading = False

# OLED updates are throttled -- redrawing every loop iteration is slow
# enough over I2C to cause audible gaps in the audio.
DISPLAY_UPDATE_INTERVAL_MS = 150
last_display_update = 0


def draw_bar(display, x, y, width, height, fraction):
    """Draws an outlined bar filled to `fraction` (0.0-1.0)."""
    display.rect(x, y, width, height, 1)
    fill_width = int(width * fraction)
    if fill_width > 0:
        display.fill_rect(x, y, fill_width, height, 1)


while True:
    # ---- Read fret state ----
    pressed_frets = []
    pressed_notes = []
    for index, (_, fret_pin) in enumerate(frets):
        if fret_pin.value() == 0:
            pressed_frets.append(index)
            pressed_notes.append(NOTE_FREQS[index][0])

    volume = read_volume()
    arp_delay_ms = read_arp_delay_ms()
    sustain_ms = read_sustain_ms()

    if is_arpeggiator_mode():
        # One note at a time. Multiple held frets cycle at a pot-controlled
        # speed; a single held fret plays continuously (no gaps) so it
        # sounds like a steady tone instead of stuttering.
        if len(pressed_frets) > 1:
            for index in pressed_frets:
                audio_out.write(apply_volume(NOTE_BUFFERS[index], volume))
                time.sleep_ms(int(arp_delay_ms))
        else:
            for index in pressed_frets:
                audio_out.write(apply_volume(NOTE_BUFFERS[index], volume))

        # Not used in this mode -- keep state clean in case of a mode switch.
        last_pressed_frets = pressed_frets
        fade_level = 1.0
        is_fading = False

    else:
        # All held frets play simultaneously via generate_mixed_chunk().
        tremolo = is_tremolo_mode()

        if pressed_frets:
            chunk = generate_mixed_chunk(
                pressed_frets, volume_scale=volume, tremolo=tremolo)
            audio_out.write(chunk)
            last_pressed_frets = pressed_frets
            fade_level = 1.0
            is_fading = False

        elif is_sustain_mode() and last_pressed_frets and (is_fading or fade_level >= 1.0):
            # Just released, sustain is on: keep playing the last chord
            # while fading volume_scale toward 0 over the pot-set duration.
            fade_steps = max(1, int(sustain_ms / (CHUNK_DURATION_S * 1000)))
            is_fading = True
            chunk = generate_mixed_chunk(
                last_pressed_frets, volume_scale=volume * fade_level, tremolo=tremolo)
            audio_out.write(chunk)
            fade_level -= 1.0 / fade_steps
            if fade_level <= 0:
                fade_level = 0.0
                is_fading = False
                last_pressed_frets = []

        else:
            # Sustain off, or nothing left to fade -- stay silent.
            last_pressed_frets = []
            fade_level = 1.0
            is_fading = False

    # ---- Update the OLED (throttled) ----
    now = time.ticks_ms()
    if time.ticks_diff(now, last_display_update) >= DISPLAY_UPDATE_INTERVAL_MS:
        display.fill(0)
        display.text("Notes:", 0, 0, 1)
        display.text(f"{','.join(pressed_notes)}", 0, 10, 1)

        display.text("Vol:", 0, 20, 1)
        draw_bar(display, 40, 21, 85, 6, volume)

        display.text("Arpg:", 0, 30, 1)
        if is_arpeggiator_mode():
            arp_fraction = (300 - arp_delay_ms) / (300 - 5)
            draw_bar(display, 40, 31, 85, 6, arp_fraction)
        else:
            display.text("OFF", 40, 30, 1)

        display.text("Sust:", 0, 40, 1)
        if is_sustain_mode():
            draw_bar(display, 40, 41, 85, 6, sustain_ms / 1000)
        else:
            display.text("OFF", 40, 40, 1)

        display.text(f"Trem: {'ON' if is_tremolo_mode() else 'OFF'}", 0, 50, 1)

        display.show()
        last_display_update = now
