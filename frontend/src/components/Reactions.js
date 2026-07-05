import React, { useEffect, useState, useRef } from "react";

/**
 * ReactionsOverlay
 * Renders floating emojis that rise + fade over the video.
 * Controlled via a ref-imperative API: overlayRef.current.push(emoji, name)
 */
const EMOJIS = ["❤️", "🔥", "😂", "😮", "👏", "🎉", "🍿", "😭", "😍", "🤯", "👑", "🎬"];

export const ReactionsOverlay = React.forwardRef(function ReactionsOverlay(_, ref) {
  const [items, setItems] = useState([]);
  const nextId = useRef(0);

  React.useImperativeHandle(ref, () => ({
    push: (emoji, name) => {
      const id = ++nextId.current;
      const left = 20 + Math.random() * 60; // 20% - 80%
      const drift = -20 + Math.random() * 40; // -20 to +20 px
      const size = 44 + Math.floor(Math.random() * 20);
      setItems((prev) => [...prev, { id, emoji, name, left, drift, size }]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3200);
    },
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="reactions-overlay">
      {items.map((it) => (
        <div
          key={it.id}
          className="absolute bottom-24 select-none"
          style={{
            left: `${it.left}%`,
            transform: `translateX(${it.drift}px)`,
            animation: "cs-float 3s ease-out forwards",
            fontSize: `${it.size}px`,
            textShadow: "0 4px 24px rgba(0,0,0,0.6)",
          }}
        >
          <div className="text-center leading-none">{it.emoji}</div>
          {it.name && <div className="text-[10px] mt-1 text-white/70 font-medium text-center">{it.name}</div>}
        </div>
      ))}
      <style>{`
        @keyframes cs-float {
          0%   { opacity: 0; transform: translate(var(--tx,0), 20px) scale(0.6); }
          15%  { opacity: 1; transform: translate(var(--tx,0), 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx,0), -320px) scale(0.85); }
        }
      `}</style>
    </div>
  );
});

export function ReactionPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-full hover:bg-white/10 transition-colors text-lg"
        data-testid="reaction-picker-btn"
        aria-label="Send reaction"
        title="Send reaction"
      >
        😀
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-20 w-72 bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-xl p-2 grid grid-cols-6 gap-1 shadow-2xl" data-testid="reaction-picker">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => { onPick(e); setOpen(false); }}
                className="w-9 h-9 rounded-md hover:bg-white/10 text-xl transition-colors"
                data-testid={`reaction-${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
