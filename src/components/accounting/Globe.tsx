import { useRef, useMemo, Suspense, useEffect, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  WebGL detection                                                    */
/* ------------------------------------------------------------------ */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Texture URLs (free 2K NASA Blue Marble + Black Marble via jsDelivr)*/
/* ------------------------------------------------------------------ */
const TEX_DAY    = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_atmos_2048.jpg";
const TEX_NIGHT  = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_lights_2048.png";
const TEX_SPEC   = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_specular_2048.jpg";
const TEX_CLOUDS = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_clouds_1024.png";

/* ------------------------------------------------------------------ */
/*  Custom shader: blend day/night by light direction                  */
/* ------------------------------------------------------------------ */
function EarthMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const lightDirRef = useRef(new THREE.Vector3(1, 0.3, 1).normalize());

  const [dayMap, nightMap, specMap, cloudsMap] = useLoader(THREE.TextureLoader, [
    TEX_DAY,
    TEX_NIGHT,
    TEX_SPEC,
    TEX_CLOUDS,
  ]);

  // Optimize textures
  useMemo(() => {
    [dayMap, nightMap, specMap, cloudsMap].forEach((t) => {
      t.anisotropy = 4;
      t.colorSpace = THREE.SRGBColorSpace;
    });
  }, [dayMap, nightMap, specMap, cloudsMap]);

  const uniforms = useMemo(
    () => ({
      uDay:   { value: dayMap },
      uNight: { value: nightMap },
      uSpec:  { value: specMap },
      uLightDir: { value: lightDirRef.current.clone() },
      uTime: { value: 0 },
    }),
    [dayMap, nightMap, specMap]
  );

  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform sampler2D uDay;
    uniform sampler2D uNight;
    uniform sampler2D uSpec;
    uniform vec3 uLightDir;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      vec3 n = normalize(vNormal);
      float lambert = dot(n, normalize(uLightDir));
      float dayMix = smoothstep(-0.15, 0.25, lambert);

      vec3 dayColor = texture2D(uDay, vUv).rgb;
      vec3 nightColor = texture2D(uNight, vUv).rgb * 1.4;

      // Ocean mask from specular map (water = bright in spec map)
      float oceanMask = texture2D(uSpec, vUv).r;

      // Deep ocean color palette — realistic, cinematic
      vec3 deepOcean = vec3(0.039, 0.122, 0.267);   // #0a1f44
      vec3 shallowOcean = vec3(0.071, 0.227, 0.420); // #123a6b

      // Depth variation using latitude + subtle noise from UV
      float depthVar = smoothstep(0.0, 1.0, abs(vUv.y - 0.5) * 1.6);
      float coastNoise = sin(vUv.x * 40.0) * sin(vUv.y * 30.0) * 0.5 + 0.5;
      vec3 oceanColor = mix(deepOcean, shallowOcean, depthVar * 0.6 + coastNoise * 0.15);

      // Replace bright/grey ocean from texture with our deep ocean tone
      // Preserve land detail by only blending where oceanMask is high
      vec3 correctedDay = mix(dayColor, oceanColor, oceanMask * 0.85);

      // Subtle animated shimmer on water (very slow, barely visible)
      float shimmer = sin(vUv.x * 120.0 + uTime * 0.3) * sin(vUv.y * 90.0 + uTime * 0.2);
      shimmer = shimmer * 0.5 + 0.5;
      correctedDay += vec3(0.02, 0.04, 0.07) * shimmer * oceanMask * dayMix * 0.4;

      // Specular sun glint on oceans — soft living surface
      vec3 viewDir = vec3(0.0, 0.0, 1.0);
      vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
      float specAngle = max(dot(n, halfDir), 0.0);
      float glint = pow(specAngle, 32.0) * oceanMask * dayMix * 0.6;

      vec3 color = mix(nightColor, correctedDay, dayMix) + vec3(0.5, 0.7, 1.0) * glint;

      // Atmosphere rim (Fresnel) — blend ocean with atmospheric blue
      float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
      color += vec3(0.25, 0.45, 0.85) * rim * 0.4;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useFrame((state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.04;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.05;
    const t = state.clock.elapsedTime * 0.05;
    lightDirRef.current.set(Math.cos(t), 0.3, Math.sin(t)).normalize();
    if (matRef.current) {
      (matRef.current.uniforms.uLightDir.value as THREE.Vector3).copy(lightDirRef.current);
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group>
      <Sphere ref={meshRef} args={[1.5, 64, 64]}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </Sphere>
      {/* Subtle cloud layer */}
      <Sphere ref={cloudsRef} args={[1.515, 48, 48]}>
        <meshStandardMaterial
          map={cloudsMap}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </Sphere>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Atmosphere glow (back-side sphere with Fresnel)                    */
/* ------------------------------------------------------------------ */
function Atmosphere() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = /* glsl */ `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
      gl_FragColor = vec4(0.35, 0.6, 1.0, 1.0) * intensity;
    }
  `;
  return (
    <Sphere args={[1.65, 48, 48]}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
      />
    </Sphere>
  );
}

/* ------------------------------------------------------------------ */
/*  Pause render when tab inactive                                     */
/* ------------------------------------------------------------------ */
function useTabActive() {
  const [active, setActive] = useState(!document.hidden);
  useEffect(() => {
    const onVis = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return active;
}

/* ------------------------------------------------------------------ */
/*  Static fallback (no WebGL)                                         */
/* ------------------------------------------------------------------ */
function StaticFallback({ size }: { size: number }) {
  return (
    <div
      className="rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: `radial-gradient(circle at 35% 35%, hsl(210 70% 35%), hsl(220 60% 15%) 60%, hsl(220 80% 8%) 100%)`,
        boxShadow: "0 0 40px hsl(210 80% 50% / 0.35), inset -20px -20px 60px rgba(0,0,0,0.6)",
      }}
    />
  );
}

interface GlobeProps {
  size?: number;
}

export function Globe({ size = 400 }: GlobeProps) {
  const [webgl] = useState(() => isWebGLAvailable());
  const tabActive = useTabActive();

  if (!webgl) {
    return (
      <div className="relative select-none pointer-events-none flex items-center justify-center" style={{ width: size, height: size }}>
        <StaticFallback size={size} />
      </div>
    );
  }

  // Oversize the canvas so the atmosphere shader sphere (radius 1.65) is not clipped
  // at the canvas edges. The visible globe still measures `size` because the camera
  // framing is preserved — we just give the halo more room to fade.
  const overscan = 1.5; // 50% larger canvas around the globe
  const canvasSize = size * overscan;

  return (
    <div
      className="globe-wrapper relative select-none pointer-events-none flex items-center justify-center"
      style={{ width: size, height: size, overflow: "visible" }}
    >
      {/* Soft CSS atmospheric halo (fades to transparent, no hard edges) */}
      <div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: canvasSize,
          height: canvasSize,
          background:
            "radial-gradient(circle, rgba(80,140,255,0.22) 0%, rgba(80,140,255,0.12) 38%, rgba(80,140,255,0.04) 60%, transparent 75%)",
          filter: "blur(20px)",
          zIndex: 1,
        }}
      />
      {/* Oversized canvas — keeps camera framing identical, prevents shader clipping */}
      <div
        className="absolute"
        style={{ width: canvasSize, height: canvasSize, zIndex: 2, overflow: "visible" }}
      >
        <Canvas
          camera={{ position: [0, 0.6, 4.2 * overscan], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          frameloop={tabActive ? "always" : "never"}
          style={{ background: "transparent", width: "100%", height: "100%" }}
        >
          <ambientLight intensity={0.18} />
          <Suspense fallback={null}>
            <EarthMesh />
            <Atmosphere />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
