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
      // Deep space gradient — clean, no glowing fog blobs
      const g = ctx.createRadialGradient(
        width * 0.5, height * 0.5, Math.min(width, height) * 0.1,
        width * 0.5, height * 0.5, Math.max(width, height) * 0.9
      );
      g.addColorStop(0, "hsl(228 45% 6%)");
      g.addColorStop(0.6, "hsl(232 55% 3%)");
      g.addColorStop(1, "hsl(240 60% 1.5%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
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
