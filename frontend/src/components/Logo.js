import React from "react";

/**
 * StreamStar original mark:
 * A radiating four-point starburst with a rounded play triangle at its center,
 * plus a small orbiting spark. Composed from primitive geometry — no
 * resemblance to any known corporate logo.
 */
export default function Logo({ size = 24, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-label="StreamStar logo">
      <defs>
        <linearGradient id="ss-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="55%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <filter id="ss-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* four-point starburst */}
      <path
        d="M20 2 L23 16 L38 20 L23 24 L20 38 L17 24 L2 20 L17 16 Z"
        fill="url(#ss-grad)"
        filter="url(#ss-glow)"
      />
      {/* inner play triangle */}
      <path d="M17.5 15 L27 20 L17.5 25 Z" fill="#0A0A0A" />
      <path d="M17.5 15 L27 20 L17.5 25 Z" fill="url(#ss-grad)" fillOpacity="0.15" />
      {/* orbiting spark */}
      <circle cx="34" cy="8" r="1.6" fill="#22D3EE" />
    </svg>
  );
}
