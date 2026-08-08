import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import './App.css';

// `freq` — how fast each ring wobbles/pulses/wiggles when pressed.
//   1.0 = baseline speed, higher = faster/more energetic, lower = slower.
// `amp` — how strong/large that motion is when pressed.
//   1.0 = baseline strength, higher = bigger bend/throb, lower = subtler.
// Both are independent: a torus can be fast-but-gentle, slow-but-huge, etc.
const TORUS_CONFIG = [
  { radius: 1, color: '#22D3EE', freq: 3, amp: 0.6 },
  { radius: 3, color: '#28D5DE', freq: 3, amp: 0.75 },
  { radius: 5, color: '#2DD6CF', freq: 5, amp: 0.55 },
  { radius: 7, color: '#33D8BF', freq: 6, amp: 0.45 },
  { radius: 9, color: '#39D9AF', freq: 7, amp: 0.35 },
  { radius: 11, color: '#3FDB9F', freq: 8, amp: 0.25 },
  { radius: 13, color: '#44DC90', freq: 9, amp: 0.15 },
  { radius: 15, color: '#4ADE80', freq: 10, amp: 0.1 },
];

// Default telemetry shape until the first "state" message arrives.
const DEFAULT_STATE = {
  volume: 0.8,
  mode: 'chord',
  arpRate: 0.5,
  sustainOn: false,
  sustainLevel: 0,
  tremolo: false,
};

function WigglyTorus({ radius, color, isSpinning, freq, amp, tremolo, rampDown }) {
  const meshRef = useRef();
  const intensityRef = useRef(0); // 0 = fully at rest, 1 = fully wobbling

  const geometry = useMemo(() => new THREE.TorusGeometry(radius, 0.1, 32, 128), [radius]);
  const basePositions = useMemo(
    () => geometry.attributes.position.array.slice(),
    [geometry]
  );

  // Random per-instance offsets so identical `freq` values still don't look
  // perfectly synced — small natural variation layered on top of your
  // deliberate per-torus frequency setting.
  const seed = useMemo(() => ({
    phase: Math.random() * Math.PI * 2,
    ampMul: 0.85 + Math.random() * 0.3,
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const posAttr = geometry.attributes.position;

    const RAMP_UP = 0.04;
    // How fast the wobble dies back down once a fret is released. Tied to
    // the physical Sustain pot: long sustain -> the visual lingers too,
    // instead of snapping off the instant audio does.
    const RAMP_DOWN = rampDown;
    const target = isSpinning ? 1 : 0;
    const rate = isSpinning ? RAMP_UP : RAMP_DOWN;
    intensityRef.current += (target - intensityRef.current) * rate;
    const intensity = intensityRef.current;

    // Breathing stays gentle and mostly independent of the per-torus `freq`
    // setting — it's the idle personality, not the "pressed" behavior.
    const breathe = Math.sin(t * 0.001 * freq * 0.5 + seed.phase * 1.7) * 0.0001;

    // Tremolo = amplitude modulation. The audio side gets its "beat" from
    // detuning two voices by ~0.6% -- but that only reads as audible
    // beating because the carrier notes run at hundreds of Hz. The bend
    // wave here only runs at ~4*freq (roughly 10-40), so the same 0.6%
    // detune would take minutes per beat cycle -- technically correct,
    // effectively invisible. Instead, pulse the amplitude directly at a
    // fixed, clearly visible rate whenever tremolo is on.
    const TREMOLO_RATE_HZ = 7;
    const tremoloMod = tremolo
      ? 1 + 0.5 * Math.sin(t * TREMOLO_RATE_HZ * Math.PI * 2)
      : 1;

    if (intensity > 0.001 || Math.abs(breathe) > 0.001) {
      const bendFreq = 2 * freq;
      const bendAmp = 0.4 * amp * seed.ampMul * intensity * tremoloMod;

      for (let i = 0; i < posAttr.count; i++) {
        const ix = i * 3;
        const x = basePositions[ix];
        const y = basePositions[ix + 1];
        const z = basePositions[ix + 2];

        const wave = Math.sin(t * bendFreq + seed.phase + x * 2 + y * 2) * bendAmp;
        const total = wave + breathe;

        posAttr.array[ix]     = x + total * x;
        posAttr.array[ix + 1] = y + total * y;
        posAttr.array[ix + 2] = z + total;
      }
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    const pulse = 1
      + Math.sin(t * 3 * freq + seed.phase) * 0.06 * amp * intensity * tremoloMod
      + Math.sin(t * 0.8 * freq * 0.5 + seed.phase * 1.7) * 0.02;
    meshRef.current.scale.set(pulse, pulse, pulse);

    meshRef.current.rotation.x =
      Math.sin(t * 4 * freq + seed.phase) * 0.05 * amp * intensity
      + Math.sin(t * 0.6 * freq * 0.5 + seed.phase * 1.3) * 0.02;
    meshRef.current.rotation.y =
      Math.cos(t * 5 * freq + seed.phase) * 0.05 * amp * intensity
      + Math.cos(t * 0.6 * freq * 0.5 + seed.phase * 1.3) * 0.02;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Slow whole-scene spin whose speed tracks the Arpeggiator pot -- fast
// arpeggio = fast spin, slow/off arpeggio = the scene basically holds still.
function SceneRig({ arpRate, mode, children }) {
  const groupRef = useRef();
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const speed = mode === 'arp' ? 0.05 + arpRate * 0.4 : 0.02;
    groupRef.current.rotation.z += delta * speed;
  });
  return <group ref={groupRef}>{children}</group>;
}

function App() {
  const [pressedState, setPressedState] = useState(Array(8).fill(false));
  const [instrumentState, setInstrumentState] = useState(DEFAULT_STATE);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'note') {
        setPressedState((prev) => {
          const next = [...prev];
          next[msg.index] = msg.pressed;
          return next;
        });
      } else if (msg.type === 'state') {
        setInstrumentState((prev) => ({ ...prev, ...msg }));
      }
    };

    return () => ws.close();
  }, []);

  const { volume, mode, arpRate, sustainOn, sustainLevel, tremolo } = instrumentState;

  // Volume drives overall scene brightness -- never fully dark so the
  // shapes stay visible even with the pot near zero.
  const lightIntensity = 0.6 + volume * 1.4;

  // Longer sustain -> slower visual fade-out (matches the audio fade
  // tail). No sustain -> snap off quickly, same as the audio does.
  const rampDown = sustainOn
    ? THREE.MathUtils.lerp(0.25, 0.02, sustainLevel ?? 0)
    : 0.3;

  // Subtle mode tint on the page background: cool teal for chord mode,
  // warmer for arp mode, so you can tell the mode at a glance.
  const backgroundColor = mode === 'arp' ? '#150826' : '#04141a';

  return (
    <div style={{ width: '100vw', height: '100vh', background: backgroundColor, transition: 'background 0.4s ease' }}>
      <Canvas camera={{ position: [0, 0, 22] }}>
        <ambientLight intensity={lightIntensity * 0.4} />
        <directionalLight position={[3, 3, 3]} intensity={lightIntensity} />
        <SceneRig arpRate={arpRate ?? 0} mode={mode}>
          {TORUS_CONFIG.map((config, i) => (
            <WigglyTorus
              key={i}
              radius={config.radius}
              color={config.color}
              freq={config.freq}
              amp={config.amp}
              isSpinning={pressedState[i]}
              tremolo={tremolo}
              rampDown={rampDown}
            />
          ))}
        </SceneRig>
      </Canvas>
    </div>
  );
}

export default App;