/**
 * QWRobotEntity — the living operational AI robot for QW Nexus.
 *
 * A real React-Three-Fiber scene rendered inside the global AI
 * entity footprint. Procedurally built (no GLB asset required):
 *   - titanium-white body with black glossy faceplate
 *   - twin glowing eyes (color reacts to state)
 *   - chest "QW" emissive logo
 *   - twin antennas with sway
 *   - holographic rotating rings
 *   - jet thrust particles below
 *   - breathing / inertia / eye-tracking driven by RobotBrain
 *
 * Intentionally compact in geometry count so it renders at 60fps
 * even on modest GPUs. SAFE MODE (driven by MovementOrchestrator)
 * lowers ring count and freezes secondary motion.
 */
import { Suspense, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRobotBrain } from "./RobotBrain";
import { decorateFrame } from "./RobotBehaviorTree";
import { damp } from "./RobotMotionEngine";
import { robotAwareness } from "./RobotAwareness";

/* -------------------------------------------------------------- */
/*  Sub-pieces                                                    */
/* -------------------------------------------------------------- */

function hsl(str: string, alpha = 1) {
  const [h, s, l] = str.split(" ");
  const css = `hsla(${h}, ${s}, ${l}, ${alpha})`;
  const c = new THREE.Color();
  c.setStyle(css);
  return c;
}

function HoloRing({ radius, speed, color, tilt = 0 }: {
  radius: number; speed: number; color: THREE.Color; tilt?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.z += speed * dt;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2 + tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.012, 8, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
    </mesh>
  );
}

function Eye({ x, color, intensity, blink }: {
  x: number; color: THREE.Color; intensity: number; blink: number;
}) {
  return (
    <group position={[x, 0.05, 0.42]}>
      <mesh>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity * blink}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      {/* outer halo */}
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[0.075, 0.11, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.4 * blink} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Antenna({ x, sway, color }: { x: number; sway: number; color: THREE.Color }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    t.current += dt;
    ref.current.rotation.z = Math.sin(t.current * 2 + x) * sway;
  });
  return (
    <group ref={ref} position={[x, 0.65, 0]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
        <meshStandardMaterial color="#cfd5dc" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function ChestCore({ color, pulse }: { color: THREE.Color; pulse: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const k = 1 + Math.sin(s.clock.elapsedTime * pulse * Math.PI) * 0.08;
    ref.current.scale.set(k, k, k);
  });
  return (
    <group position={[0, -0.05, 0.43]}>
      {/* core dot */}
      <mesh ref={ref}>
        <circleGeometry args={[0.09, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* QW text — drawn via canvas texture */}
      <QWLogo color={color} />
    </group>
  );
}

function QWLogo({ color }: { color: THREE.Color }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = `rgb(${color.r * 255},${color.g * 255},${color.b * 255})`;
    ctx.font = "bold 64px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle as string;
    ctx.shadowBlur = 14;
    ctx.fillText("QW", 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 2;
    return t;
  }, [color.r, color.g, color.b]);
  return (
    <mesh position={[0, 0, 0.002]}>
      <planeGeometry args={[0.22, 0.22]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

function Jets({ count, color }: { count: number; color: THREE.Color }) {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(
    () => Array.from({ length: count }).map((_, i) => ({
      x: (i - (count - 1) / 2) * 0.12,
      phase: i * 0.4,
    })),
    [count],
  );
  useFrame((s) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const m = child as THREE.Mesh;
      const t = (s.clock.elapsedTime * 2.4 + items[i].phase) % 1;
      m.position.y = -0.65 - t * 0.5;
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      const sc = 1 - t * 0.7;
      m.scale.set(sc, sc, sc);
    });
  });
  return (
    <group ref={group}>
      {items.map((p, i) => (
        <mesh key={i} position={[p.x, -0.65, 0.2]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------- */
/*  Robot assembly                                                */
/* -------------------------------------------------------------- */

function Robot() {
  const { snapshot, frame: rawFrame } = useRobotBrain();
  const frame = useMemo(() => decorateFrame(rawFrame, snapshot), [rawFrame, snapshot]);

  const eyeColor = useMemo(() => hsl(frame.hue), [frame.hue]);
  const accentColor = useMemo(() => hsl(frame.accent), [frame.accent]);

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const blinkRef = useRef(1);
  const blinkTimer = useRef(0);
  const lookTarget = useRef({ x: 0, y: 0 });

  // Sync pointer awareness — set the anchor to viewport center of
  // the canvas DOM node every frame for accuracy.
  const canvasCenter = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const updateAnchor = () => {
      const el = document.getElementById("qw-robot-canvas");
      if (!el) return;
      const r = el.getBoundingClientRect();
      canvasCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    updateAnchor();
    const t = window.setInterval(updateAnchor, 500);
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, []);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    // breathing bob
    if (root.current) {
      root.current.position.y = Math.sin(t * frame.bobSpeed) * frame.bob;
      root.current.rotation.z = Math.sin(t * frame.bobSpeed * 0.7) * 0.03;
    }
    // head tracking
    if (head.current) {
      const look = robotAwareness.lookFrom(canvasCenter.current, 320);
      lookTarget.current.x = damp(lookTarget.current.x, look.x * 0.35, 6 * frame.trackSpeed, dt);
      lookTarget.current.y = damp(lookTarget.current.y, -look.y * 0.25, 6 * frame.trackSpeed, dt);
      head.current.rotation.y = lookTarget.current.x;
      head.current.rotation.x = lookTarget.current.y;
    }
    // blink
    blinkTimer.current += dt * frame.blinkRate;
    if (blinkTimer.current > 1) {
      blinkTimer.current = 0;
      blinkRef.current = 0;
    } else {
      blinkRef.current = damp(blinkRef.current, 1, 18, dt);
    }
  });

  return (
    <group ref={root}>
      {/* holographic rings */}
      {Array.from({ length: frame.rings }).map((_, i) => (
        <HoloRing
          key={i}
          radius={0.95 + i * 0.16}
          speed={(i % 2 === 0 ? 1 : -1) * frame.ringSpeed * (1 + i * 0.3)}
          color={accentColor}
          tilt={i * 0.18}
        />
      ))}

      {/* jets */}
      {frame.jets > 0 && <Jets count={frame.jets} color={accentColor} />}

      {/* body */}
      <mesh position={[0, -0.15, 0]}>
        <capsuleGeometry args={[0.42, 0.22, 8, 24]} />
        <meshStandardMaterial color="#e9edf2" metalness={0.85} roughness={0.28} />
      </mesh>

      {/* chest plate */}
      <mesh position={[0, -0.05, 0.4]}>
        <circleGeometry args={[0.32, 32]} />
        <meshStandardMaterial color="#0a0d12" metalness={0.4} roughness={0.2} />
      </mesh>
      <ChestCore color={eyeColor} pulse={frame.corePulse} />

      {/* head */}
      <group ref={head} position={[0, 0.42, 0]}>
        {/* skull */}
        <mesh>
          <sphereGeometry args={[0.4, 32, 32]} />
          <meshStandardMaterial color="#f0f3f7" metalness={0.9} roughness={0.22} />
        </mesh>
        {/* visor */}
        <mesh position={[0, 0.02, 0.18]} rotation={[-0.08, 0, 0]}>
          <sphereGeometry args={[0.34, 32, 32, 0, Math.PI * 2, 0.4, 0.9]} />
          <meshStandardMaterial
            color="#06080c"
            metalness={0.95}
            roughness={0.08}
            envMapIntensity={1.2}
          />
        </mesh>
        {/* eyes */}
        <Eye x={-0.13} color={eyeColor} intensity={frame.eyeIntensity} blink={blinkRef.current} />
        <Eye x={0.13} color={eyeColor} intensity={frame.eyeIntensity} blink={blinkRef.current} />
        {/* ear units */}
        <mesh position={[-0.38, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.16, 0.16]} />
          <meshStandardMaterial color="#aeb4bc" metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0.38, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.16, 0.16]} />
          <meshStandardMaterial color="#aeb4bc" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* antennas */}
        <Antenna x={-0.18} sway={frame.antennaSway} color={accentColor} />
        <Antenna x={0.18} sway={frame.antennaSway} color={accentColor} />
      </group>

      {/* shoulder pauldrons */}
      <mesh position={[-0.48, -0.05, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#cfd5dc" metalness={0.9} roughness={0.28} />
      </mesh>
      <mesh position={[0.48, -0.05, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#cfd5dc" metalness={0.9} roughness={0.28} />
      </mesh>

      {/* ground halo */}
      <mesh position={[0, -0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.6, 32]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.35} toneMapped={false} />
      </mesh>

      {/* point light to light the body with state color */}
      <pointLight color={eyeColor} intensity={1.4 + frame.eyeIntensity * 0.6} distance={4} position={[0, 0, 1.2]} />
    </group>
  );
}

/* -------------------------------------------------------------- */
/*  Public component                                              */
/* -------------------------------------------------------------- */

export function QWRobotEntity({ size }: { size: number }) {
  // suppress R3F-internal context to avoid clipping
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mql) return;
    setReduced(mql.matches);
    const h = () => setReduced(mql.matches);
    mql.addEventListener?.("change", h);
    return () => mql.removeEventListener?.("change", h);
  }, []);

  return (
    <div id="qw-robot-canvas" style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0.05, 2.6], fov: 38 }}
        dpr={[1, reduced ? 1.25 : 2]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} />
        <directionalLight position={[-2, 1, -1]} intensity={0.5} color="#7bd0ff" />
        <Suspense fallback={null}>
          <Robot />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default QWRobotEntity;
