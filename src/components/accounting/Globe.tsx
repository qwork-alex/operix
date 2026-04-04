import { useRef, useState, useCallback, useEffect } from "react";

interface GlobeProps {
  size?: number;
}

export function Globe({ size = 220 }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: -20, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const autoRotate = useRef(true);
  const animFrame = useRef<number>();

  // Auto-rotate
  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      if (autoRotate.current && !isDragging) {
        const dt = (now - last) / 1000;
        setRotation((r) => ({ ...r, y: r.y + dt * 12 }));
      }
      last = now;
      animFrame.current = requestAnimationFrame(tick);
    };
    animFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [isDragging]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    autoRotate.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      setRotation((r) => ({ x: r.x - dy * 0.4, y: r.y + dx * 0.4 }));
      lastPos.current = { x: e.clientX, y: e.clientY };
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setTimeout(() => { autoRotate.current = true; }, 2000);
  }, []);

  // Generate grid lines
  const meridians = Array.from({ length: 8 }, (_, i) => i * 22.5);
  const parallels = [-60, -30, 0, 30, 60];

  return (
    <div
      ref={containerRef}
      className="relative select-none cursor-grab active:cursor-grabbing"
      style={{ width: size, height: size, perspective: 800 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Glow backdrop */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(43 85% 55% / 0.08) 0%, transparent 70%)",
          filter: "blur(20px)",
          transform: "scale(1.4)",
        }}
      />

      {/* Globe sphere */}
      <div
        className="absolute inset-0 rounded-full border border-primary/20"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          transition: isDragging ? "none" : "transform 0.1s ease-out",
        }}
      >
        {/* Surface */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `
              radial-gradient(circle at 35% 35%, hsl(43 85% 55% / 0.12) 0%, transparent 50%),
              radial-gradient(circle at 65% 65%, hsl(210 80% 55% / 0.08) 0%, transparent 50%),
              radial-gradient(circle, hsl(220 15% 12%) 0%, hsl(220 15% 6%) 100%)
            `,
            boxShadow: "inset -4px -4px 20px hsl(0 0% 0% / 0.5), inset 4px 4px 20px hsl(43 85% 55% / 0.05)",
          }}
        />

        {/* Grid lines — meridians */}
        {meridians.map((deg) => (
          <div
            key={`m-${deg}`}
            className="absolute inset-0"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateY(${deg}deg)`,
            }}
          >
            <div
              className="absolute rounded-full border border-primary/10"
              style={{
                left: "50%",
                top: 0,
                width: 1,
                height: "100%",
                transform: "translateX(-50%)",
              }}
            />
          </div>
        ))}

        {/* Grid lines — parallels */}
        {parallels.map((deg) => {
          const scale = Math.cos((deg * Math.PI) / 180);
          const offset = Math.sin((deg * Math.PI) / 180) * (size / 2);
          return (
            <div
              key={`p-${deg}`}
              className="absolute border border-primary/8 rounded-full"
              style={{
                width: size * scale,
                height: size * scale * 0.15,
                left: (size - size * scale) / 2,
                top: size / 2 - (size * scale * 0.15) / 2 - offset,
                transformStyle: "preserve-3d",
                transform: `rotateX(90deg) translateZ(${offset}px)`,
              }}
            />
          );
        })}

        {/* Highlight rim */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "linear-gradient(135deg, hsl(43 85% 55% / 0.1) 0%, transparent 40%, transparent 60%, hsl(210 80% 55% / 0.05) 100%)",
          }}
        />
      </div>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <span className="text-xs font-medium text-primary/60 tracking-widest uppercase">Contabilidade</span>
      </div>
    </div>
  );
}
