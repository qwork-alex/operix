import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Realistic Earth-like procedural texture (lightweight, no downloads)*/
/* ------------------------------------------------------------------ */
function createEarthTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;

  // Deep ocean gradient (equator warmer, poles cooler)
  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#0a1830");
  ocean.addColorStop(0.25, "#0d2348");
  ocean.addColorStop(0.5, "#103257");
  ocean.addColorStop(0.75, "#0d2348");
  ocean.addColorStop(1, "#0a1830");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Continent silhouettes (rough but recognizable shapes)
  const w = canvas.width;
  const h = canvas.height;
  const drawLand = (path: [number, number][], shade = 0.85) => {
    ctx.beginPath();
    ctx.moveTo(path[0][0] * w, path[0][1] * h);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0] * w, path[i][1] * h);
    ctx.closePath();
    const grad = ctx.createRadialGradient(
      path[0][0] * w, path[0][1] * h, 0,
      path[0][0] * w, path[0][1] * h, w * 0.18
    );
    grad.addColorStop(0, `rgba(56, 102, 65, ${shade})`);
    grad.addColorStop(0.5, `rgba(42, 82, 52, ${shade * 0.85})`);
    grad.addColorStop(1, `rgba(28, 60, 38, ${shade * 0.6})`);
    ctx.fillStyle = grad;
    ctx.fill();
  };

  // North America
  drawLand([
    [0.12, 0.22], [0.20, 0.18], [0.27, 0.22], [0.28, 0.32],
    [0.24, 0.40], [0.20, 0.48], [0.16, 0.46], [0.13, 0.38], [0.10, 0.28],
  ]);
  // Central / South America
  drawLand([
    [0.24, 0.48], [0.27, 0.52], [0.30, 0.62], [0.28, 0.74],
    [0.25, 0.82], [0.22, 0.78], [0.21, 0.65], [0.22, 0.55],
  ]);
  // Europe
  drawLand([
    [0.46, 0.24], [0.52, 0.22], [0.55, 0.28], [0.52, 0.34],
    [0.48, 0.34], [0.45, 0.30],
  ], 0.75);
  // Africa
  drawLand([
    [0.48, 0.38], [0.54, 0.40], [0.57, 0.50], [0.55, 0.62],
    [0.52, 0.72], [0.48, 0.66], [0.46, 0.54], [0.46, 0.44],
  ]);
  // Asia
  drawLand([
    [0.55, 0.20], [0.68, 0.18], [0.78, 0.22], [0.80, 0.32],
    [0.74, 0.40], [0.66, 0.42], [0.58, 0.38], [0.55, 0.30],
  ]);
  // India
  drawLand([
    [0.66, 0.42], [0.70, 0.44], [0.69, 0.52], [0.66, 0.50],
  ], 0.75);
  // Southeast Asia / Indonesia
  drawLand([
    [0.76, 0.50], [0.80, 0.52], [0.82, 0.56], [0.78, 0.58], [0.74, 0.54],
  ], 0.7);
  // Australia
  drawLand([
    [0.80, 0.62], [0.88, 0.62], [0.90, 0.70], [0.84, 0.72], [0.79, 0.68],
  ]);
  // Antarctica strip
  ctx.fillStyle = "rgba(220, 230, 240, 0.55)";
  ctx.fillRect(0, h * 0.92, w, h * 0.08);

  // Subtle latitude grid (very faint)
  ctx.strokeStyle = "rgba(120, 180, 220, 0.05)";
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 12; i++) {
    const px = (i / 12) * w;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const py = (i / 6) * h;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
  }

  // Soft cloud wisps
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const r = 20 + Math.random() * 60;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, "rgba(255,255,255,0.9)");
    cg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createGlowTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.30, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(80, 170, 255, 0.22)");
  grad.addColorStop(0.5, "rgba(50, 120, 200, 0.06)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function Atmosphere() {
  const glowTex = useMemo(() => createGlowTexture(), []);
  return (
    <sprite scale={[3.9, 3.9, 1]}>
      <spriteMaterial map={glowTex} transparent depthWrite={false} />
    </sprite>
  );
}

function Planet({ autoRotate = true }: { autoRotate?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const texture = useMemo(() => createEarthTexture(1024), []);

  useFrame((state, delta) => {
    if (autoRotate && meshRef.current) {
      // very slow, luxury feel
      meshRef.current.rotation.y += delta * 0.04;
    }
    // Moving light highlight (subtle)
    if (lightRef.current) {
      const t = state.clock.elapsedTime * 0.15;
      lightRef.current.position.x = Math.cos(t) * 5;
      lightRef.current.position.z = Math.sin(t) * 5;
    }
  });

  return (
    <group>
      <directionalLight ref={lightRef} position={[5, 3, 5]} intensity={1.0} color="#ffe8c0" />
      <Sphere ref={meshRef} args={[1.5, 64, 64]}>
        <meshStandardMaterial
          map={texture}
          roughness={0.78}
          metalness={0.12}
          emissive={new THREE.Color("#0a1f3a")}
          emissiveIntensity={0.18}
        />
      </Sphere>
      <Atmosphere />
    </group>
  );
}

interface GlobeProps {
  size?: number;
}

export function Globe({ size = 400 }: GlobeProps) {
  return (
    <div className="relative select-none pointer-events-none" style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0, 4.0], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.32} />
        <directionalLight position={[-3, -2, -3]} intensity={0.18} color="#6090ff" />
        <Suspense fallback={null}>
          <Planet autoRotate />
        </Suspense>
      </Canvas>
    </div>
  );
}
