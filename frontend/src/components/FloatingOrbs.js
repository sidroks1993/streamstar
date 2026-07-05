import React from "react";

/**
 * A cluster of tiny pulsing orbs scattered across the page background.
 * Purely decorative; behind all content, non-interactive.
 */
const ORBS = [
  { x: "8%",  y: "18%", size: 10, color: "#A855F7", delay: "0s",   duration: "6s" },
  { x: "18%", y: "72%", size: 6,  color: "#EC4899", delay: "1.2s", duration: "5s" },
  { x: "42%", y: "12%", size: 5,  color: "#22D3EE", delay: "2.4s", duration: "7s" },
  { x: "62%", y: "60%", size: 8,  color: "#A855F7", delay: "0.8s", duration: "6.5s" },
  { x: "82%", y: "22%", size: 6,  color: "#EC4899", delay: "3s",   duration: "8s" },
  { x: "92%", y: "68%", size: 10, color: "#22D3EE", delay: "1.6s", duration: "5.5s" },
  { x: "30%", y: "42%", size: 4,  color: "#EC4899", delay: "2s",   duration: "6s" },
  { x: "72%", y: "88%", size: 5,  color: "#A855F7", delay: "0.4s", duration: "7.5s" },
];

export default function FloatingOrbs({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      data-testid="floating-orbs"
    >
      {ORBS.map((o, i) => (
        <span
          key={i}
          className="absolute rounded-full ss-orb"
          style={{
            left: o.x,
            top: o.y,
            width: o.size,
            height: o.size,
            background: o.color,
            boxShadow: `0 0 ${o.size * 4}px ${o.color}`,
            animationDelay: o.delay,
            animationDuration: o.duration,
          }}
        />
      ))}
    </div>
  );
}
