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
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      vec3 n = normalize(vNormal);
      float lambert = dot(n, normalize(uLightDir));
      // Smooth day/night terminator
      float dayMix = smoothstep(-0.15, 0.25, lambert);

      vec3 dayColor = texture2D(uDay, vUv).rgb;
      vec3 nightColor = texture2D(uNight, vUv).rgb * 1.4; // brighten city lights

      // Subtle sun glint on oceans
      float spec = texture2D(uSpec, vUv).r;
      float glint = pow(max(dayMix, 0.0), 8.0) * spec * 0.25;

      vec3 color = mix(nightColor, dayColor, dayMix) + vec3(glint);

      // Atmosphere rim (Fresnel)
      float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
      color += vec3(0.25, 0.45, 0.85) * rim * 0.35;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useFrame((state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.04;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.05;
    // Slow ambient sun motion for living highlight
    const t = state.clock.elapsedTime * 0.05;
    lightDirRef.current.set(Math.cos(t), 0.3, Math.sin(t)).normalize();
    if (matRef.current) {
      (matRef.current.uniforms.uLightDir.value as THREE.Vector3).copy(lightDirRef.current);
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
