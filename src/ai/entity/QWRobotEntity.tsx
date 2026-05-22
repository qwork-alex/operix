/**
 * QWRobotEntity — friendly cinematic AI companion for QW Nexus.
 *
 * Rebuilt from the ground up: no more spinning rings, no jet flares,
 * no alarm orbs. The character is a compact, rounded Pixar-readable
 * robot — large soft head, glossy black visor, twin oval eyes that
 * track the cursor and blink, a tiny red operational pilot light on
 * the chest, a single short antenna, and a soft ground shadow.
 *
 * State is conveyed through subtle micro-animation: eye color,
 * squint/wide eye shape, head tilt, breathing speed, and pilot LED
 * pulse — never through aggressive overlays.
 *
 * Procedurally built via react-three-fiber. Lightweight enough for
 * 60fps on integrated GPUs.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRobotBrain } from "./RobotBrain";
import { decorateFrame } from "./RobotBehaviorTree";
import { damp } from "./RobotMotionEngine";
import { robotAwareness } from "./RobotAwareness";

/* -------------------------------------------------------------- */
/*  Helpers                                                       */
/* -------------------------------------------------------------- */

function hsl(str: string) {
  const [h, s, l] = str.split(" ");
  const c = new THREE.Color();
  c.setStyle(`hsl(${h}, ${s}, ${l})`);
  return c;
}

/* -------------------------------------------------------------- */
/*  Sub-pieces                                                    */
/* -------------------------------------------------------------- */

function Eye({ x, color, intensity, blink, shape }: {
  x: number; color: THREE.Color; intensity: number; blink: number; shape: number;
}) {
  // Oval, expressive — scale Y to convey shape (squint / wide).
  return (
    <group position={[x, 0.04, 0.36]} scale={[1, shape * blink, 1]}>
      <mesh>
        <sphereGeometry args={[0.075, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity}
          roughness={0.25}
          metalness={0.05}
        />
      </mesh>
      {/* tiny white catchlight — gives "alive" feeling */}
      <mesh position={[-0.022, 0.022, 0.06]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  );
}

function PilotLED({ color, pulse, on }: { color: THREE.Color; pulse: number; on: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    const k = on ? 0.55 + (Math.sin(s.clock.elapsedTime * pulse * Math.PI) + 1) * 0.5 : 0;
    m.emissiveIntensity = k * 1.8;
  });
  return (
    <mesh ref={ref} position={[0, -0.18, 0.4]}>
      <sphereGeometry args={[0.028, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
    </mesh>
  );
}

function Antenna() {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.4) * 0.05;
  });
  return (
    <group ref={ref} position={[0, 0.62, 0]}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.008, 0.01, 0.24, 8]} />
        <meshStandardMaterial color="#c3c8cf" metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffd9d9" emissiveIntensity={0.7} metalness={0.4} roughness={0.3} />
      </mesh>
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
  const pilotColor = useMemo(() => hsl(frame.accent), [frame.accent]);

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const blinkRef = useRef(1);
  const blinkTimer = useRef(0);
  const lookTarget = useRef({ x: 0, y: 0 });
  const tiltRef = useRef(0);

  // anchor for cursor tracking
  const canvasCenter = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const update = () => {
      const el = document.getElementById("qw-robot-canvas");
      if (!el) return;
      const r = el.getBoundingClientRect();
      canvasCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    update();
    const t = window.setInterval(update, 400);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    // breathing bob — slow vertical drift + tiny roll
    if (root.current) {
      root.current.position.y = Math.sin(t * frame.bobSpeed) * frame.bob;
      root.current.rotation.z = Math.sin(t * frame.bobSpeed * 0.6) * 0.02;
    }
    // head tracking — soft damped follow toward cursor + personality tilt
    if (head.current) {
      const look = robotAwareness.lookFrom(canvasCenter.current, 360);
      lookTarget.current.x = damp(lookTarget.current.x, look.x * 0.32, 5 * frame.trackSpeed, dt);
      lookTarget.current.y = damp(lookTarget.current.y, -look.y * 0.22, 5 * frame.trackSpeed, dt);
      tiltRef.current = damp(tiltRef.current, frame.headTilt, 4, dt);
      head.current.rotation.y = lookTarget.current.x;
      head.current.rotation.x = lookTarget.current.y;
      head.current.rotation.z = tiltRef.current;
    }
    // blink — eyelid snap then ease open
    blinkTimer.current += dt * frame.blinkRate;
    if (blinkTimer.current > 1) {
      blinkTimer.current = 0;
      blinkRef.current = 0.05;
    } else {
      blinkRef.current = damp(blinkRef.current, 1, 16, dt);
    }
  });

  return (
    <group ref={root}>
      {/* soft ground shadow disc */}
      <mesh position={[0, -0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} />
      </mesh>

      {/* body — rounded, compact, soft white */}
      <mesh position={[0, -0.18, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial color="#f3f5f8" metalness={0.55} roughness={0.42} />
      </mesh>

      {/* chest faceplate (subtle, recessed) */}
      <mesh position={[0, -0.18, 0.36]}>
        <circleGeometry args={[0.22, 32]} />
        <meshStandardMaterial color="#0d1014" metalness={0.5} roughness={0.25} />
      </mesh>
      <PilotLED color={pilotColor} pulse={frame.pilotPulse} on={frame.pilotOn} />

      {/* neck connector */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.1, 16]} />
        <meshStandardMaterial color="#b9bfc6" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* HEAD — large, rounded, friendly proportions */}
      <group ref={head} position={[0, 0.32, 0]}>
        {/* skull */}
        <mesh>
          <sphereGeometry args={[0.42, 40, 40]} />
          <meshStandardMaterial color="#fafbfd" metalness={0.55} roughness={0.35} />
        </mesh>
        {/* black glossy visor — wraps front */}
        <mesh position={[0, 0.02, 0.08]} scale={[1, 0.62, 1]}>
          <sphereGeometry args={[0.39, 40, 40]} />
          <meshStandardMaterial
            color="#070a0f"
            metalness={0.95}
            roughness={0.06}
            envMapIntensity={1.4}
          />
        </mesh>
        {/* eyes */}
        <Eye x={-0.12} color={eyeColor} intensity={frame.eyeIntensity} blink={blinkRef.current} shape={frame.eyeShape} />
        <Eye x={0.12} color={eyeColor} intensity={frame.eyeIntensity} blink={blinkRef.current} shape={frame.eyeShape} />
        {/* small side audio pods */}
        <mesh position={[-0.4, -0.02, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color="#c8cdd4" metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0.4, -0.02, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color="#c8cdd4" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* single small antenna with soft red blinker */}
        <Antenna />
      </group>

      {/* soft state-tinted rim light to give it cinematic lighting */}
      <pointLight color={eyeColor} intensity={0.9} distance={3.5} position={[0, 0.1, 1.1]} />
      <pointLight color={pilotColor} intensity={0.35} distance={1.6} position={[0, -0.2, 0.6]} />
    </group>
  );
}

/* -------------------------------------------------------------- */
/*  Public component                                              */
/* -------------------------------------------------------------- */

export function QWRobotEntity({ size }: { size: number }) {
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
    <div id="qw-robot-canvas" style={{ width: size, height: size, pointerEvents: "none" }}>
      <Canvas
        camera={{ position: [0, 0.05, 2.5], fov: 36 }}
        dpr={[1, reduced ? 1.25 : 2]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
        {/* warm key + cool fill for soft cinematic lighting */}
        <ambientLight intensity={0.65} />
        <directionalLight position={[2.2, 3, 2]} intensity={1.15} color="#fff4e6" />
        <directionalLight position={[-2, 1, -1]} intensity={0.55} color="#9cd4ff" />
        <Suspense fallback={null}>
          <Robot />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default QWRobotEntity;
