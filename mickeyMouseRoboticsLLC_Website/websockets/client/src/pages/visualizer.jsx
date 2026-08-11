import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';

// =========================================================================
// SPACE BACKGROUND -- dark void with continuously falling stars. Runs on
// its own clock, independent of note presses.
// =========================================================================

function Starfield({ count = 500, twinkleActive }) {
  const materialRef = useRef();
  const activeLevelRef = useRef(0);

  // Fixed positions -- no per-frame movement, so this reads as a starfield
  // rather than snow. `phase`/`speed` are per-star randoms that drive an
  // independent twinkle rate once twinkling is switched on.
  const { positions, phases, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 1] = Math.random() * 140 - 80;
      positions[i * 3 + 2] = -Math.random() * 220 - 10;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 2 + Math.random() * 5; // each star twinkles at its own rate
    }
    return { positions, phases, speeds };
  }, [count]);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uActive: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aPhase;
      attribute float aSpeed;
      uniform float uTime;
      uniform float uActive;
      varying float vAlpha;
      void main() {
        // 0-1 twinkle wave, unique per star via its own phase + speed.
        float twinkle = sin(uTime * aSpeed + aPhase) * 0.5 + 0.5;
        // uActive blends between "steady, full brightness" (arp off) and
        // "flickering between dim and bright" (arp on).
        vAlpha = mix(1.0, mix(0.25, 1.0, twinkle), uActive);

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 340.0 / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha);
      }
    `,
  }), []);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;

    // Ease uActive toward its target instead of snapping the instant the
    // Arpeggiator toggle flips, so the twinkle fades in/out smoothly.
    const target = twinkleActive ? 1 : 0;
    activeLevelRef.current += (target - activeLevelRef.current) * 0.05;
    materialRef.current.uniforms.uActive.value = activeLevelRef.current;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={materialRef} args={[shaderArgs]} />
    </points>
  );
}

function SpaceBackground({ twinkleActive }) {
  return <Starfield twinkleActive={twinkleActive} />;
}

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
  const materialRef = useRef();
  const glowRef = useRef();
  const glowMaterialRef = useRef();
  const lightRef = useRef();
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

    // ---- Glow: the ring lights itself up the harder it's played ----
    // In a dark scene, this (plus the point light below) is what actually
    // makes each ring read as "alive" rather than a flat gray outline.
    const glow = 0.3 + intensity * 2.4 * tremoloMod;
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = glow;
    }
    if (glowRef.current) {
      const haloScale = pulse * (1.1 + intensity * 0.15);
      glowRef.current.scale.set(haloScale, haloScale, haloScale);
      glowRef.current.rotation.copy(meshRef.current.rotation);
    }
    if (glowMaterialRef.current) {
      glowMaterialRef.current.opacity = 0.08 + intensity * 0.4 * tremoloMod;
    }
    if (lightRef.current) {
      lightRef.current.intensity = intensity * 3.5 * tremoloMod;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* Additive-blended halo -- a cheap stand-in for real bloom, since
          there's no postprocessing pipeline wired up here. */}
      <mesh ref={glowRef} geometry={geometry}>
        <meshBasicMaterial
          ref={glowMaterialRef}
          color={color}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Lets a played ring cast colored light onto its neighbors --
          useful in a dark scene where there's little ambient light to
          reveal the other rings otherwise. */}
      <pointLight ref={lightRef} color={color} intensity={0} distance={radius * 2.5} decay={2} />
    </group>
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

// =========================================================================
// EFFECTS OVERLAY -- plain HTML (not part of the 3D scene), positioned over
// the left side of the canvas. Deliberately understated: small text, low
// contrast, no borders/boxes fighting for attention against the rings.
// =========================================================================

function EffectBar({ label, value, active = true }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div style={{ marginBottom: 10, opacity: active ? 0.9 : 0.3, transition: 'opacity 0.3s ease' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 3,
        }}
      >
        <span>{label}</span>
        <span>{active ? `${pct}%` : 'off'}</span>
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${active ? pct : 0}%`,
            background: '#4ade80',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
    </div>
  );
}

function EffectsPanel({ volume, mode, arpRate, sustainOn, sustainLevel, tremolo }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        left: 20,
        width: 140,
        padding: '12px 14px',
        background: 'rgba(2, 2, 10, 0.4)',
        backdropFilter: 'blur(3px)',
        borderRadius: 8,
        color: '#e8fbff',
        fontFamily: 'system-ui, sans-serif',
        // Discreet + non-interactive: it reports state, it doesn't block
        // clicks/drags meant for the canvas underneath.
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: '0.08em', opacity: 0.45, marginBottom: 10, textTransform: 'uppercase' }}>
        {mode === 'arp' ? 'Arpeggiator' : 'Chord'} mode
      </div>
      <EffectBar label="Volume" value={volume ?? 0} />
      <EffectBar label="Arp rate" value={arpRate ?? 0} active={mode === 'arp'} />
      <EffectBar label="Sustain" value={sustainLevel ?? 0} active={!!sustainOn} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: tremolo ? 0.9 : 0.3,
          transition: 'opacity 0.3s ease',
        }}
      >
        <span>Tremolo</span>
        <span>{tremolo ? 'on' : 'off'}</span>
      </div>
    </div>
  );
}

function Visualizer() {
  const [pressedState, setPressedState] = useState(Array(8).fill(false));
  const [instrumentState, setInstrumentState] = useState(DEFAULT_STATE);

  useEffect(() => {
    // window.location.hostname is whatever machine actually served this
    // page -- on your own PC that's still "localhost", but from another
    // device on the network it'll correctly be that PC's LAN IP instead
    // of a hardcoded 'localhost' (which would just mean "myself" to
    // whatever device loaded the page).
    const ws = new WebSocket(`ws://${window.location.hostname}:8080`);

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

  // Kept deliberately low -- the rings now light themselves (emissive +
  // point lights), so we don't need bright ambient/directional light to
  // see them. Volume still nudges it a little for some responsiveness.
  const baseLight = 0.12 + volume * 0.35;

  // Longer sustain -> slower visual fade-out (matches the audio fade
  // tail). No sustain -> snap off quickly, same as the audio does.
  const rampDown = sustainOn
    ? THREE.MathUtils.lerp(0.25, 0.02, sustainLevel ?? 0)
    : 0.3;

  return (
    <div style={{ width: '100%', height: '100%', background: '#020208', position: 'relative' }}>
      <EffectsPanel
        volume={volume}
        mode={mode}
        arpRate={arpRate}
        sustainOn={sustainOn}
        sustainLevel={sustainLevel}
        tremolo={tremolo}
      />
      <Canvas camera={{ position: [0, 0, 22] }}>
        <SpaceBackground twinkleActive={mode === 'arp'} />
        <ambientLight intensity={baseLight * 0.4} />
        <directionalLight position={[3, 3, 3]} intensity={baseLight} />
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

export default Visualizer;