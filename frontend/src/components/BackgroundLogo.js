import React from "react";

/**
 * Enlarged StreamStar mark used as a subtle background watermark.
 * `variant='full'` centers a gigantic ghost logo behind the hero (home page).
 * `variant='peek'` anchors a partial logo to the bottom-right corner (dashboard).
 */
export default function BackgroundLogo({ variant = "full", className = "" }) {
  const isPeek = variant === "peek";
  return (
    <div
      aria-hidden="true"
      data-testid={`bg-logo-${variant}`}
      className={`pointer-events-none absolute z-0 ${
        isPeek
          ? "-right-40 -bottom-40 w-[560px] h-[560px] md:w-[720px] md:h-[720px]"
          : "inset-0 flex items-center justify-center"
      } ${className}`}
      style={{ opacity: isPeek ? 0.05 : 0.035 }}
    >
      <svg
        viewBox="0 0 40 40"
        className={isPeek ? "w-full h-full" : "w-[min(140vh,140vw)] h-[min(140vh,140vw)]"}
        fill="none"
      >
        <defs>
          <linearGradient id="bg-ss-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="55%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <path
          d="M20 2 L23 16 L38 20 L23 24 L20 38 L17 24 L2 20 L17 16 Z"
          fill="url(#bg-ss-grad)"
        />
        <path d="M17.5 15 L27 20 L17.5 25 Z" fill="#0A0A0A" />
        <circle cx="34" cy="8" r="1.6" fill="#22D3EE" />
      </svg>
    </div>
  );
}
