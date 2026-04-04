import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere } from "@react-three/drei";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Procedural Earth-like texture (lightweight, no image downloads)    */
/* ------------------------------------------------------------------ */
function createEarthTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;

  // Ocean base
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0a1628");
  grad.addColorStop(0.5, "#0d1f3c");
  grad.addColorStop(1, "#0a1628");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Simplenoise-free continent blobs
  const continents = [
    { x: 0.25, y: 0.35, rx: 0.08, ry: 0.15, rot: -0.2 },
    { x: 0.28, y: 0.55, rx: 0.05, ry: 0.12, rot: 0.3 },
    { x: 0.48, y: 0.3, rx: 0.06, ry: 0.1, rot: 0.1 },
    { x: 0.5, y: 0.45, rx: 0.04, ry: 0.08, rot: -0.1 },
    { x: 0.52, y: 0.6, rx: 0.03, ry: 0.06, rot: 0.2 },
    { x: 0.7, y: 0.4, rx: 0.1, ry: 0.12, rot: -0.3 },
    { x: 0.75, y: 0.55, rx: 0.04, ry: 0.05, rot: 0.1 },
    { x: 0.85, y: 0.7, rx: 0.05, ry: 0.04, rot: 0.4 },
    { x: 0.15, y: 0.25, rx: 0.04, ry: 0.03, rot: 0 },
  ];

  continents.forEach((c) => {
    ctx.save();
    ctx.translate(c.x * canvas.width, c.y * canvas.height);
    ctx.rotate(c.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, c.rx * canvas.width, c.ry * canvas.height, 0, 0, Math.PI * 2);
    const cGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, c.rx * canvas.width);
    cGrad.addColorStop(0, "rgba(34, 80, 50, 0.7)");
    cGrad.addColorStop(0.6, "rgba(28, 65, 42, 0.5)");
    cGrad.addColorStop(1, "rgba(18, 45, 30, 0)");
    ctx.fillStyle = cGrad;
    ctx.fill();
    ctx.restore();
  });

  // Subtle grid lines (lat/lon)
  ctx.strokeStyle = "rgba(60,180,220,0.06)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 12; i++) {
    const px = (i / 12) * canvas.width;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const py = (i / 6) * canvas.height;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(canvas.width, py); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createGlowTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(60,180,255,0.15)");
  grad.addColorStop(0.5, "rgba(40,120,200,0.05)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/* ------------------------------------------------------------------ */
/*  Atmosphere ring                                                    */
/* ------------------------------------------------------------------ */
function Atmosphere() {
  const glowTex = useMemo(() => createGlowTexture(), []);
  return (
    <sprite scale={[3.6, 3.6, 1]}>
      <spriteMaterial map={glowTex} transparent depthWrite={false} />
    </sprite>
  );
}

/* ------------------------------------------------------------------ */
/*  Planet mesh                                                        */
/* ------------------------------------------------------------------ */
function Planet() {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => createEarthTexture(1024), []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group>
      <Sphere ref={meshRef} args={[1.5, 64, 64]}>
        <meshStandardMaterial
          map={texture}
          roughness={0.85}
          metalness={0.1}
          emissive={new THREE.Color("#0a2040")}
          emissiveIntensity={0.15}
        />
      </Sphere>
      <Atmosphere />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported Globe wrapper                                             */
/* ------------------------------------------------------------------ */
interface GlobeProps {
  size?: number;
}

export function Globe({ size = 400 }: GlobeProps) {
  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
    >
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 3, 5]} intensity={0.9} color="#ffe8c0" />
        <directionalLight position={[-3, -2, -3]} intensity={0.15} color="#6090ff" />

        <Suspense fallback={null}>
          <Planet />
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          rotateSpeed={0.5}
          dampingFactor={0.08}
          enableDamping
        />
      </Canvas>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <span className="text-xs font-medium text-primary/50 tracking-widest uppercase drop-shadow-lg">
          Contabilidade
        </span>
      </div>
    </div>
  );
}
