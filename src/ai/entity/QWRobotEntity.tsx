/**
 * QWRobotEntity — premium automotive operational AI copilot.
 *
 * Visual direction: Tesla Optimus × Iron Man × F1 telemetry × BMW
 * cockpit AI. Not a mascot. Not a toy. A slim, articulated, metallic
 * field engineer that hovers on twin thrusters beside the operator.
 *
 * Architecture:
 *   - smaller serious helmet with dark visor + horizontal eye band
 *   - slim graphite torso with titanium chest plate and operational LED
 *   - fully articulated shoulders / upper arms / forearms / hands
 *   - tucked legs over twin thrusters (floating propulsion)
 *   - cinematic damped motion: head tracks cursor, arm points on alert,
 *     subtle breathing bob and idle scan
 *
 * Materials: metallic graphite #1f2328, titanium silver #b4bac3,
 * electric blue accents, restrained red operational pilot light.
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

const MAT = {
  graphite: "#1f2328",
  graphiteDark: "#11141a",
  titanium: "#b4bac3",
  titaniumDark: "#6b7280",
  visor: "#04070c",
} as const;

/* -------------------------------------------------------------- */
/*  Sub-pieces                                                    */
/* -------------------------------------------------------------- */

/** Single glowing eye dot inside the visor band. */
function Eye({ x, color, intensity, blink, shape }: {
  x: number; color: THREE.Color; intensity: number; blink: number; shape: number;
}) {
  return (
    <group position={[x, 0.0, 0.27]} scale={[1, Math.max(0.05, shape * blink), 1]}>
      <mesh>
        <sphereGeometry args={[0.045, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity * 1.4}
          roughness={0.2}
          metalness={0.0}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Operational pilot LED on the chest. */
function PilotLED({ color, pulse, on }: { color: THREE.Color; pulse: number; on: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    const k = on ? 0.45 + (Math.sin(s.clock.elapsedTime * pulse * Math.PI) + 1) * 0.45 : 0;
    m.emissiveIntensity = k * 1.6;
  });
  return (
    <mesh ref={ref} position={[0, -0.05, 0.18]}>
      <sphereGeometry args={[0.022, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} toneMapped={false} />
    </mesh>
  );
}

/** Twin underglow thrusters — floating propulsion. */
function Thrusters({ color }: { color: THREE.Color }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const k = 0.55 + Math.sin(s.clock.elapsedTime * 4) * 0.15;
    [left, right].forEach((r) => {
      if (!r.current) return;
      (r.current.material as THREE.MeshStandardMaterial).emissiveIntensity = k * 1.8;
    });
  });
  return (
    <group position={[0, -0.78, 0]}>
      {[-0.12, 0.12].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          {/* nozzle */}
          <mesh position={[0, 0.04, 0]}>
            <cylinderGeometry args={[0.07, 0.055, 0.08, 16]} />
            <meshStandardMaterial color={MAT.graphiteDark} metalness={0.95} roughness={0.25} />
          </mesh>
          {/* hot core */}
          <mesh ref={i === 0 ? left : right} position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.052, 0.04, 0.04, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Articulated arm — shoulder → upper → forearm → hand. */
function Arm({
  side, raise, point, accent,
}: {
  side: "L" | "R"; raise: number; point: number; accent: THREE.Color;
}) {
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  const dir = side === "L" ? -1 : 1;

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (shoulder.current) {
      // base idle sway + raise blends toward "pointing forward"
      const idleSway = Math.sin(t * 1.1 + (side === "L" ? 0 : Math.PI / 2)) * 0.04;
      // raise: 0 = arm down by side, 1 = arm extended forward & up ~45°
      shoulder.current.rotation.x = -raise * 1.2 + idleSway;
      shoulder.current.rotation.z = dir * (0.18 - raise * 0.18);
    }
    if (elbow.current) {
      // bend less when pointing — straighter arm to indicate direction
      const bend = 0.55 - point * 0.5;
      elbow.current.rotation.x = bend + Math.sin(t * 1.4 + dir) * 0.02;
    }
  });

  return (
    <group position={[dir * 0.21, 0.04, 0]}>
      {/* shoulder pauldron */}
      <mesh>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshStandardMaterial color={MAT.titanium} metalness={0.92} roughness={0.28} />
      </mesh>
      <group ref={shoulder}>
        {/* upper arm */}
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.035, 0.04, 0.22, 14]} />
          <meshStandardMaterial color={MAT.graphite} metalness={0.85} roughness={0.35} />
        </mesh>
        {/* elbow joint */}
        <group position={[0, -0.22, 0]} ref={elbow}>
          <mesh>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial color={MAT.titaniumDark} metalness={0.9} roughness={0.3} />
          </mesh>
          {/* forearm */}
          <mesh position={[0, -0.11, 0]}>
            <cylinderGeometry args={[0.03, 0.034, 0.22, 14]} />
            <meshStandardMaterial color={MAT.graphite} metalness={0.85} roughness={0.35} />
          </mesh>
          {/* hand / manipulator with accent LED */}
          <group position={[0, -0.24, 0]}>
            <mesh>
              <boxGeometry args={[0.07, 0.07, 0.05]} />
              <meshStandardMaterial color={MAT.graphiteDark} metalness={0.9} roughness={0.28} />
            </mesh>
            {/* accent strip on the manipulator — glows brighter when pointing */}
            <mesh position={[0, -0.02, 0.027]}>
              <boxGeometry args={[0.05, 0.012, 0.005]} />
              <meshStandardMaterial
                color={accent}
                emissive={accent}
                emissiveIntensity={0.6 + point * 1.8}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/** Tucked leg over thruster — purely cosmetic, no walking. */
function Leg({ side }: { side: "L" | "R" }) {
  const dir = side === "L" ? -1 : 1;
  return (
    <group position={[dir * 0.1, -0.5, 0.02]} rotation={[0.45, 0, dir * -0.05]}>
      {/* thigh */}
      <mesh>
        <cylinderGeometry args={[0.045, 0.05, 0.18, 14]} />
        <meshStandardMaterial color={MAT.graphite} metalness={0.85} roughness={0.35} />
      </mesh>
      {/* knee */}
      <mesh position={[0, -0.1, 0.04]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial color={MAT.titaniumDark} metalness={0.9} roughness={0.3} />
      </mesh>
      {/* shin */}
      <mesh position={[0, -0.18, 0.08]} rotation={[-0.55, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.04, 0.16, 14]} />
        <meshStandardMaterial color={MAT.graphite} metalness={0.85} roughness={0.35} />
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
  const torso = useRef<THREE.Group>(null);
  const blinkRef = useRef(1);
  const blinkTimer = useRef(0);
  const lookTarget = useRef({ x: 0, y: 0 });
  const tiltRef = useRef(0);
  const raiseRef = useRef(0); // right arm raise (0..1)
  const pointRef = useRef(0); // right arm pointing extension (0..1)

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
    // hover bob — slow vertical drift + tiny roll, mechanical inertia
    if (root.current) {
      root.current.position.y = Math.sin(t * frame.bobSpeed) * frame.bob * 0.8;
      root.current.rotation.z = Math.sin(t * frame.bobSpeed * 0.55) * 0.015;
    }
    // torso counter-balance for life-like weight shift
    if (torso.current) {
      torso.current.rotation.y = Math.sin(t * 0.6) * 0.04;
    }
    // head tracking — damped follow toward cursor + personality tilt
    if (head.current) {
      const look = robotAwareness.lookFrom(canvasCenter.current, 360);
      lookTarget.current.x = damp(lookTarget.current.x, look.x * 0.42, 5 * frame.trackSpeed, dt);
      lookTarget.current.y = damp(lookTarget.current.y, -look.y * 0.26, 5 * frame.trackSpeed, dt);
      tiltRef.current = damp(tiltRef.current, frame.headTilt, 4, dt);
      head.current.rotation.y = lookTarget.current.x;
      head.current.rotation.x = lookTarget.current.y;
      head.current.rotation.z = tiltRef.current;
    }
    // arm pointing — raise on alert / focused moods, point in cursor direction
    const wantRaise =
      frame.mood === "alert" || frame.mood === "concerned" ? 0.95 :
      frame.mood === "focused" ? 0.45 :
      frame.mood === "curious" ? 0.25 : 0.0;
    const wantPoint =
      frame.mood === "alert" || frame.mood === "concerned" ? 1.0 :
      frame.mood === "focused" ? 0.5 : 0.0;
    raiseRef.current = damp(raiseRef.current, wantRaise, 3.5, dt);
    pointRef.current = damp(pointRef.current, wantPoint, 3.5, dt);

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
      {/* soft ground shadow — small, beneath thrusters */}
      <mesh position={[0, -0.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.38, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>

      {/* TORSO — slim graphite chassis */}
      <group ref={torso}>
        {/* upper torso block */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.36, 0.34, 0.24]} />
          <meshStandardMaterial color={MAT.graphite} metalness={0.92} roughness={0.32} />
        </mesh>
        {/* titanium chest plate — F1 inspired */}
        <mesh position={[0, 0.0, 0.125]}>
          <boxGeometry args={[0.26, 0.22, 0.02]} />
          <meshStandardMaterial color={MAT.titanium} metalness={0.95} roughness={0.22} />
        </mesh>
        {/* horizontal vent slits */}
        {[-0.04, 0.0, 0.04].map((y, i) => (
          <mesh key={i} position={[0, y, 0.137]}>
            <boxGeometry args={[0.18, 0.008, 0.004]} />
            <meshStandardMaterial color={MAT.graphiteDark} metalness={0.6} roughness={0.6} />
          </mesh>
        ))}
        {/* operational pilot LED */}
        <PilotLED color={pilotColor} pulse={frame.pilotPulse} on={frame.pilotOn} />
        {/* hip / lower spine */}
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[0.28, 0.12, 0.2]} />
          <meshStandardMaterial color={MAT.graphiteDark} metalness={0.92} roughness={0.3} />
        </mesh>
        {/* spinal accent strip */}
        <mesh position={[0, -0.05, -0.12]}>
          <boxGeometry args={[0.04, 0.32, 0.005]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={0.7} toneMapped={false} />
        </mesh>

        {/* shoulders + arms */}
        <group position={[0, 0.08, 0]}>
          <Arm side="L" raise={0} point={0} accent={eyeColor} />
          <Arm side="R" raise={raiseRef.current} point={pointRef.current} accent={eyeColor} />
        </group>

        {/* legs (decorative, tucked) */}
        <Leg side="L" />
        <Leg side="R" />
      </group>

      {/* neck — exposed mechanical joint */}
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.045, 0.06, 0.08, 14]} />
        <meshStandardMaterial color={MAT.titaniumDark} metalness={0.95} roughness={0.28} />
      </mesh>

      {/* HEAD — compact, serious helmet */}
      <group ref={head} position={[0, 0.32, 0]}>
        {/* helmet shell */}
        <mesh>
          <boxGeometry args={[0.32, 0.28, 0.3]} />
          <meshStandardMaterial color={MAT.graphite} metalness={0.92} roughness={0.32} />
        </mesh>
        {/* rounded crown */}
        <mesh position={[0, 0.13, 0]}>
          <sphereGeometry args={[0.17, 24, 24]} />
          <meshStandardMaterial color={MAT.graphite} metalness={0.92} roughness={0.32} />
        </mesh>
        {/* dark visor band */}
        <mesh position={[0, 0.0, 0.151]}>
          <boxGeometry args={[0.3, 0.11, 0.005]} />
          <meshStandardMaterial
            color={MAT.visor}
            metalness={0.98}
            roughness={0.05}
            envMapIntensity={1.6}
          />
        </mesh>
        {/* eye dots inside visor */}
        <Eye x={-0.07} color={eyeColor} intensity={frame.eyeIntensity} blink={blinkRef.current} shape={frame.eyeShape} />
        <Eye x={0.07} color={eyeColor} intensity={frame.eyeIntensity} blink={blinkRef.current} shape={frame.eyeShape} />
        {/* jaw / chin plate */}
        <mesh position={[0, -0.13, 0.04]}>
          <boxGeometry args={[0.22, 0.06, 0.18]} />
          <meshStandardMaterial color={MAT.titaniumDark} metalness={0.95} roughness={0.28} />
        </mesh>
        {/* side temple sensors */}
        {[-0.17, 0.17].map((x, i) => (
          <mesh key={i} position={[x, 0, 0.0]}>
            <boxGeometry args={[0.025, 0.08, 0.12]} />
            <meshStandardMaterial color={MAT.titaniumDark} metalness={0.95} roughness={0.28} />
          </mesh>
        ))}
        {/* tiny rear antenna pin */}
        <mesh position={[0, 0.22, -0.04]}>
          <cylinderGeometry args={[0.005, 0.006, 0.12, 8]} />
          <meshStandardMaterial color={MAT.titanium} metalness={0.95} roughness={0.3} />
        </mesh>
      </group>

      {/* propulsion */}
      <Thrusters color={eyeColor} />

      {/* state-tinted rim light for cinematic readability */}
      <pointLight color={eyeColor} intensity={1.0} distance={3.2} position={[0, 0.15, 1.2]} />
      <pointLight color={pilotColor} intensity={0.4} distance={1.6} position={[0, -0.85, 0.4]} />
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
        camera={{ position: [0, 0.0, 2.6], fov: 32 }}
        dpr={[1, reduced ? 1.25 : 2]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
        {/* cool key + warm fill — automotive showroom lighting */}
        <ambientLight intensity={0.55} />
        <directionalLight position={[2.2, 3, 2]} intensity={1.0} color="#dceaff" />
        <directionalLight position={[-2, 1.4, -1]} intensity={0.45} color="#ffb27a" />
        <directionalLight position={[0, -2, 1.5]} intensity={0.25} color="#7ec8ff" />
        <Suspense fallback={null}>
          <Robot />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default QWRobotEntity;
