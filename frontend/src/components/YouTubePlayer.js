import React, { useCallback, useEffect, useRef, useState } from "react";
import { Youtube } from "lucide-react";

// Load the YouTube IFrame API once for the whole app
let ytApiLoading = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiLoading) return ytApiLoading;
  ytApiLoading = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return ytApiLoading;
}

/**
 * YouTube player with sync.
 * - Host: emits { playing, currentTime } on state/seek changes via onStateChange.
 * - Viewer: receives external `remoteState` and applies it, keeping playback within ±1s of host.
 */
export default function YouTubePlayer({ isHost, videoId, remoteState, onStateChange, roomName }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const applyingRef = useRef(false);
  const [ready, setReady] = useState(false);

  const emit = useCallback(() => {
    if (!isHost || !onStateChange || !playerRef.current) return;
    try {
      const p = playerRef.current;
      const state = p.getPlayerState?.();
      onStateChange({
        playing: state === 1,
        currentTime: p.getCurrentTime?.() || 0,
        video_id: videoId,
      });
    } catch { /* ignore */ }
  }, [isHost, onStateChange, videoId]);

  // Create player once
  useEffect(() => {
    let cancelled = false;
    if (!videoId) return;
    (async () => {
      await loadYouTubeApi();
      if (cancelled || !containerRef.current) return;
      // Destroy any previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      const el = document.createElement("div");
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(el);
      playerRef.current = new window.YT.Player(el, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          controls: isHost ? 1 : 0,
          disablekb: isHost ? 0 : 1,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: () => {
            if (applyingRef.current) return;
            emit();
          },
        },
      });
    })();
    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
    };
  }, [videoId, isHost]);

  // Emit periodic ticks from host so viewers stay in sync
  useEffect(() => {
    if (!isHost || !ready) return;
    const id = setInterval(emit, 3000);
    return () => clearInterval(id);
  }, [isHost, ready, emit]);

  // Apply remote state (viewers only)
  useEffect(() => {
    if (isHost || !remoteState || !playerRef.current || !ready) return;
    const p = playerRef.current;
    applyingRef.current = true;
    try {
      const cur = p.getCurrentTime?.() || 0;
      if (Math.abs(cur - (remoteState.currentTime || 0)) > 1.2) {
        p.seekTo(remoteState.currentTime || 0, true);
      }
      if (remoteState.playing) {
        p.playVideo?.();
      } else {
        p.pauseVideo?.();
      }
    } catch { /* ignore */ }
    setTimeout(() => { applyingRef.current = false; }, 250);
  }, [remoteState, isHost, ready]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center" data-testid="youtube-player">
      {!videoId ? (
        <div className="text-center text-white/50 text-sm">
          <Youtube className="w-10 h-10 mx-auto mb-2 text-[#EC4899]" />
          Paste a YouTube URL to start.
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-full" />
      )}
      {roomName && (
        <div className="absolute top-3 left-3 text-[11px] uppercase tracking-widest text-white/40 pointer-events-none">
          {roomName}
        </div>
      )}
    </div>
  );
}

export function parseYouTubeId(input) {
  if (!input) return null;
  const s = input.trim();
  // Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1);
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[embedIdx + 1])) {
        return parts[embedIdx + 1];
      }
    }
  } catch { /* ignore */ }
  return null;
}
