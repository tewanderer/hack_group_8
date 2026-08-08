import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';
import './App.css';

function Toru0({ radius, color, isSpinning }) {
  const meshRef = useRef();
  const basePosition = useRef([0, 0, 0]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (isSpinning) {
      meshRef.current.scale.setScalar(1 + Math.sin(t * 30) * 0.08);
    } else {
      // smoothly settle back to rest instead of snapping
      meshRef.current.position.x += (0 - meshRef.current.position.x) * 0.2;
      meshRef.current.position.y += (0 - meshRef.current.position.y) * 0.2;
      meshRef.current.rotation.z += (0 - meshRef.current.rotation.z) * 0.2;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, 0.15, 16, 100]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function Torus1({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.y += delta * 8;
      meshRef.current.rotation.z += delta * 6;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[1, 0.02, 64, 100]} />
      <meshStandardMaterial color="#28D5DE" />
    </mesh>
  );
}

function Torus2({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.z += delta * 4;
      meshRef.current.rotation.y += delta * 8;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[1.5, 0.02, 64, 100]} />
      <meshStandardMaterial color="#2DD6CF" />
    </mesh>
  );
}

function Torus3({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.x += delta * -8;
      meshRef.current.rotation.y += delta * 6;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[2, 0.02, 64, 100]} />
      <meshStandardMaterial color="#33D8BF" />
    </mesh>
  );
}

function Torus4({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.x += delta * 2;
      meshRef.current.rotation.y += delta * -6;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[2.5, 0.02, 64, 100]} />
      <meshStandardMaterial color="#39D9AF" />
    </mesh>
  );
}

function Torus5({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.x += delta * 8;
      meshRef.current.rotation.z += delta * 6;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[3, 0.02, 64, 100]} />
      <meshStandardMaterial color="#3FDB9F" />
    </mesh>
  );
}

function Torus6({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.z += delta * -8;
      meshRef.current.rotation.y += delta * 3;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[3.5, 0.02, 64, 100]} />
      <meshStandardMaterial color="#44DC90" />
    </mesh>
  );
}

function Torus7({ isSpinning }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (isSpinning) {
      meshRef.current.rotation.x += delta * 8;
      meshRef.current.rotation.z += delta * 6;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[4, 0.02, 64, 100]} />
      <meshStandardMaterial color="#4ADE80" />
    </mesh>
  );
}

function App() {
  const [torus0Spinning, setTorus0Spinning] = useState(false);
  const [torus1Spinning, setTorus1Spinning] = useState(false);
  const [torus2Spinning, setTorus2Spinning] = useState(false);
  const [torus3Spinning, setTorus3Spinning] = useState(false);
  const [torus4Spinning, setTorus4Spinning] = useState(false);
  const [torus5Spinning, setTorus5Spinning] = useState(false);
  const [torus6Spinning, setTorus6Spinning] = useState(false);
  const [torus7Spinning, setTorus7Spinning] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.onmessage = (event) => {
      const { index, pressed } = JSON.parse(event.data);
      if (index === 0) setTorus0Spinning(pressed);
      if (index === 1) setTorus1Spinning(pressed);
      if (index === 2) setTorus2Spinning(pressed);
      if (index === 3) setTorus3Spinning(pressed);
      if (index === 4) setTorus4Spinning(pressed);
      if (index === 5) setTorus5Spinning(pressed);
      if (index === 6) setTorus6Spinning(pressed);
      if (index === 7) setTorus7Spinning(pressed);
    };
    return () => ws.close();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 7] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 3, 3]} intensity={1.5} />
        <Torus0 isSpinning={torus0Spinning} />
        <Torus1 isSpinning={torus1Spinning} />
        <Torus2 isSpinning={torus2Spinning} />
        <Torus3 isSpinning={torus3Spinning} />
        <Torus4 isSpinning={torus4Spinning} />
        <Torus5 isSpinning={torus5Spinning} />
        <Torus6 isSpinning={torus6Spinning} />
        <Torus7 isSpinning={torus7Spinning} />
      </Canvas>
    </div>
  );
}

export default App;