import React, { useEffect, useRef } from "react";

/**
 * Soft purple/pink orb that follows the cursor with a spring-like delay.
 * Blends over content and never interferes with clicks (pointer-events: none).
 */
export default function CursorGlow() {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Skip on touch devices — no cursor to follow
    if (window.matchMedia?.("(hover: none)").matches) return;

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let raf = 0;

    const onMove = (e) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      if (ref.current) {
        ref.current.style.transform = `translate3d(${cx - 220}px, ${cy - 220}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[5] w-[440px] h-[440px] rounded-full opacity-40 mix-blend-screen"
      style={{
        background:
          "radial-gradient(closest-side, rgba(168,85,247,0.45), rgba(236,72,153,0.18) 40%, rgba(34,211,238,0.08) 65%, transparent 75%)",
        filter: "blur(20px)",
        willChange: "transform",
      }}
      data-testid="cursor-glow"
    />
  );
}
