import { useEffect, useRef } from "react";

/**
 * Cinematic space background — pure canvas, GPU-friendly.
 * 3 parallax star layers + rare meteors + soft galaxy fog.
 * Disables animation on low-perf devices (reduced motion or low CPU).
 */
export function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPerf =
      (navigator as any).hardwareConcurrency && (navigator as any).hardwareConcurrency <= 2;
    const animate = !reduceMotion && !lowPerf;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    type Star = { x: number; y: number; r: number; o: number; tw: number; vx: number };
    let layerFar: Star[] = [];
    let layerMid: Star[] = [];
    let layerNear: Star[] = [];

    type Meteor = { x: number; y: number; vx: number; vy: number; life: number; max: number };
    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 20000 + Math.random() * 20000;

    type Planet = { xRel: number; yRel: number; r: number; hue: number; sat: number; light: number; vx: number };
    let planets: Planet[] = [
      // Jupiter-like (soft orange/brown), upper-left far
      { xRel: 0.12, yRel: 0.22, r: 38, hue: 28,  sat: 45, light: 42, vx: 0.0008 },
      // Neptune-like (deep blue), lower-right far
      { xRel: 0.86, yRel: 0.78, r: 28, hue: 218, sat: 55, light: 38, vx: -0.0006 },
      // Distant warm sun-glow, mid-right
      { xRel: 0.92, yRel: 0.18, r: 18, hue: 38,  sat: 65, light: 60, vx: 0.0004 },
    ];

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const seed = () => {
      const area = width * height;
      const farCount  = Math.min(180, Math.floor(area / 9000));
      const midCount  = Math.min(70,  Math.floor(area / 22000));
      const nearCount = Math.min(25,  Math.floor(area / 60000));

      layerFar = Array.from({ length: farCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: rand(0.3, 0.8),
        o: rand(0.25, 0.6),
        tw: Math.random() * Math.PI * 2,
        vx: rand(-0.005, 0.005),
      }));
      layerMid = Array.from({ length: midCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: rand(0.6, 1.2),
        o: rand(0.3, 0.7),
        tw: Math.random() * Math.PI * 2,
        vx: rand(-0.02, 0.02),
      }));
      layerNear = Array.from({ length: nearCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: rand(1.0, 1.8),
        o: rand(0.4, 0.85),
        tw: Math.random() * Math.PI * 2,
        vx: rand(-0.05, 0.05),
      }));
    };

    const drawStaticBackdrop = () => {
      // Deep space gradient
      const g = ctx.createRadialGradient(
        width * 0.5, height * 0.45, Math.min(width, height) * 0.1,
        width * 0.5, height * 0.5, Math.max(width, height) * 0.85
      );
      g.addColorStop(0, "hsl(225 50% 8%)");
      g.addColorStop(0.55, "hsl(230 55% 4%)");
      g.addColorStop(1, "hsl(240 60% 2%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      // Subtle galaxy fog (two soft blobs)
      const fog1 = ctx.createRadialGradient(width * 0.25, height * 0.35, 0, width * 0.25, height * 0.35, Math.max(width, height) * 0.45);
      fog1.addColorStop(0, "hsl(220 80% 45% / 0.10)");
      fog1.addColorStop(1, "hsl(220 80% 45% / 0)");
      ctx.fillStyle = fog1;
      ctx.fillRect(0, 0, width, height);

      const fog2 = ctx.createRadialGradient(width * 0.78, height * 0.7, 0, width * 0.78, height * 0.7, Math.max(width, height) * 0.4);
      fog2.addColorStop(0, "hsl(280 70% 40% / 0.08)");
      fog2.addColorStop(1, "hsl(280 70% 40% / 0)");
      ctx.fillStyle = fog2;
      ctx.fillRect(0, 0, width, height);
    };

    const drawPlanets = (dt: number) => {
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        // Very slow horizontal drift in relative space
        p.xRel += (p.vx * dt) / Math.max(width, 1);
        if (p.xRel < -0.1) p.xRel = 1.1;
        else if (p.xRel > 1.1) p.xRel = -0.1;

        const cx = p.xRel * width;
        const cy = p.yRel * height;
        const r = p.r;

        // Soft outer halo
        const halo = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
        halo.addColorStop(0, `hsl(${p.hue} ${p.sat}% ${p.light}% / 0.18)`);
        halo.addColorStop(1, `hsl(${p.hue} ${p.sat}% ${p.light}% / 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Planet body with soft side-shading (simulated lighting)
        const body = ctx.createRadialGradient(
          cx - r * 0.35, cy - r * 0.35, r * 0.1,
          cx, cy, r
        );
        body.addColorStop(0, `hsl(${p.hue} ${p.sat}% ${Math.min(80, p.light + 18)}% / 0.55)`);
        body.addColorStop(0.55, `hsl(${p.hue} ${p.sat}% ${p.light}% / 0.42)`);
        body.addColorStop(1, `hsl(${p.hue} ${Math.max(20, p.sat - 15)}% ${Math.max(8, p.light - 25)}% / 0.05)`);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawStars = (stars: Star[], twinkleAmp: number, dt: number) => {
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.x += s.vx * dt;
        if (s.x < -2) s.x = width + 2;
        else if (s.x > width + 2) s.x = -2;
        s.tw += 0.0015 * dt;
        const alpha = Math.max(0, Math.min(1, s.o + Math.sin(s.tw) * twinkleAmp));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "hsl(220 30% 95%)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawMeteor = (m: Meteor) => {
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 12, m.y - m.vy * 12);
      grad.addColorStop(0, "hsl(200 90% 90% / 0.9)");
      grad.addColorStop(1, "hsl(200 90% 90% / 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 12, m.y - m.vy * 12);
      ctx.stroke();
    };

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      ctx.clearRect(0, 0, width, height);
      drawStaticBackdrop();
      drawPlanets(dt);
      drawStars(layerFar, 0.08, dt);
      drawStars(layerMid, 0.15, dt);
      drawStars(layerNear, 0.22, dt);

      // Rare meteor
      if (!meteor && now > nextMeteorAt) {
        const fromLeft = Math.random() < 0.5;
        meteor = {
          x: fromLeft ? -20 : width + 20,
          y: rand(height * 0.05, height * 0.5),
          vx: (fromLeft ? 1 : -1) * rand(0.35, 0.55),
          vy: rand(0.12, 0.22),
          life: 0,
          max: 1800,
        };
      }
      if (meteor) {
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.life += dt;
        drawMeteor(meteor);
        if (
          meteor.life > meteor.max ||
          meteor.x < -50 || meteor.x > width + 50 ||
          meteor.y > height + 50
        ) {
          meteor = null;
          nextMeteorAt = now + 20000 + Math.random() * 20000;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (animate) {
      rafRef.current = requestAnimationFrame((t) => {
        last = t;
        loop(t);
      });
    } else {
      // Single static paint
      ctx.clearRect(0, 0, width, height);
      drawStaticBackdrop();
      drawPlanets(0);
      drawStars(layerFar, 0, 0);
      drawStars(layerMid, 0, 0);
      drawStars(layerNear, 0, 0);
    }

    const onVis = () => {
      if (document.hidden && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!document.hidden && animate && !rafRef.current) {
        last = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ display: "block" }}
      aria-hidden
    />
  );
}
