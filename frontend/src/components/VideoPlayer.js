import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Settings, PictureInPicture, Upload,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const h = Math.floor(m / 60);
  const mm = (m % 60).toString().padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${s}` : `${mm}:${s}`;
}

/**
 * VideoPlayer
 * - Host mode: local file selection + full playback controls; exposes MediaStream via onStream
 * - Viewer mode: displays remote MediaStream, minimal controls (volume, fullscreen, PiP, speed on their own client)
 */
export default function VideoPlayer({ isHost, onStreamReady, onStreamEnded, remoteStream, roomName }) {
  const videoRef = useRef(null);
  const wrapperRef = useRef(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState("Source");
  const [isFs, setIsFs] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  // Attach remote stream (viewer)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (remoteStream) {
      v.srcObject = remoteStream;
      v.play().catch(() => {});
    }
  }, [remoteStream]);

  // Host: attach local file
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !fileUrl) return;
    v.src = fileUrl;
    v.load();
    // Wait for metadata before capturing stream
    const handleReady = () => {
      try {
        const stream = v.captureStream ? v.captureStream() : v.mozCaptureStream?.();
        if (stream && onStreamReady) onStreamReady(stream);
      } catch (e) {
        console.error("captureStream failed", e);
        /* ignore */
      }
    };
    v.addEventListener("loadedmetadata", handleReady);
    return () => v.removeEventListener("loadedmetadata", handleReady);
  }, [fileUrl, onStreamReady]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(file);
    setFileName(file.name);
    setFileUrl(url);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    setDuration(v.duration || 0);
  };
  const onPlay = () => setPlaying(true);
  const onPause = () => {
    setPlaying(false);
    if (isHost && onStreamEnded && !videoRef.current?.src) onStreamEnded();
  };

  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !isHost || !isFinite(duration)) return;
    v.currentTime = Number(e.target.value);
  };
  const changeVolume = (e) => {
    const val = Number(e.target.value);
    setVolume(val);
    setMuted(val === 0);
    if (videoRef.current) videoRef.current.volume = val;
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const toggleFs = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  const applyQuality = (q) => {
    setQuality(q);
    const v = videoRef.current;
    if (!v || !wrapperRef.current) return;
    if (q === "Source") {
      v.style.filter = "";
      v.style.imageRendering = "";
    } else if (q === "1080p") {
      v.style.filter = "";
    } else if (q === "720p") {
      v.style.filter = "contrast(1.02)";
    } else if (q === "480p") {
      v.style.filter = "contrast(1.02) blur(0.3px)";
    } else if (q === "360p") {
      v.style.filter = "contrast(1.05) blur(0.6px)";
    }
  };

  return (
    <div
      ref={wrapperRef}
      onMouseMove={showControls}
      onMouseLeave={() => setControlsVisible(false)}
      className="relative w-full h-full bg-black flex items-center justify-center group select-none"
      data-testid="video-player"
    >
      {/* Video element */}
      <video
        ref={videoRef}
        onClick={isHost && fileUrl ? togglePlay : undefined}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        playsInline
        className="max-h-full max-w-full object-contain"
      />

      {/* Empty state for host */}
      {isHost && !fileUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="w-16 h-16 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/30 flex items-center justify-center mb-6">
            <Upload className="w-7 h-7 text-[#A855F7]" />
          </div>
          <h3 className="font-display text-2xl mb-2">Pick a movie to start streaming</h3>
          <p className="text-white/50 text-sm mb-6 max-w-md">Everyone in <span className="text-white">{roomName || "this room"}</span> will see it live. Nothing gets uploaded — the stream goes peer-to-peer.</p>
          <label className="inline-flex cursor-pointer items-center gap-2 bg-[#A855F7] hover:bg-[#C026D3] px-6 py-3 rounded-md text-white font-medium transition-colors" data-testid="pick-movie-btn">
            <Upload className="w-4 h-4" />
            Choose video file
            <input type="file" accept="video/*" onChange={onFileChange} className="hidden" data-testid="file-input" />
          </label>
        </div>
      )}

      {/* Empty state for viewer */}
      {!isHost && !remoteStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="w-3 h-3 rounded-full bg-[#A855F7] animate-pulse mb-4" />
          <h3 className="font-display text-xl mb-1">Waiting for host…</h3>
          <p className="text-white/50 text-sm">The stream will start as soon as the host picks a movie.</p>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 pt-16 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          controlsVisible || !playing ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress */}
        <div className="flex items-center gap-3 mb-2 text-xs text-white/70 font-mono">
          <span data-testid="time-current">{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step="0.1"
            value={current}
            onChange={seek}
            disabled={!isHost}
            className="cs-range flex-1"
            data-testid="seek-bar"
          />
          <span data-testid="time-duration">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <button onClick={togglePlay} className="p-2 rounded-full hover:bg-white/10 transition-colors" data-testid="playpause-btn" aria-label="Play/Pause" disabled={!isHost && !remoteStream}>
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={toggleMute} className="p-2 rounded-full hover:bg-white/10 transition-colors" data-testid="mute-btn" aria-label="Mute">
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={changeVolume}
              className="cs-range w-24" data-testid="volume-slider" />
          </div>

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-full hover:bg-white/10 transition-colors text-xs uppercase tracking-widest" data-testid="speed-btn">
                  {speed}x
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#111] border-white/10 text-white">
                <DropdownMenuLabel className="text-xs text-white/50">Playback speed</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                {SPEEDS.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setSpeed(s)}
                    className={`focus:bg-white/10 focus:text-white ${speed === s ? "text-[#A855F7]" : ""}`}
                    data-testid={`speed-${s}`}>
                    {s}x
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-full hover:bg-white/10 transition-colors" data-testid="quality-btn" aria-label="Quality">
                  <Settings className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#111] border-white/10 text-white">
                <DropdownMenuLabel className="text-xs text-white/50">Quality</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                {["Source", "1080p", "720p", "480p", "360p"].map((q) => (
                  <DropdownMenuItem key={q} onClick={() => applyQuality(q)}
                    className={`focus:bg-white/10 focus:text-white ${quality === q ? "text-[#A855F7]" : ""}`}
                    data-testid={`quality-${q}`}>
                    {q}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button onClick={togglePip} className="p-2 rounded-full hover:bg-white/10 transition-colors" data-testid="pip-btn" aria-label="Picture in picture">
              <PictureInPicture className="w-5 h-5" />
            </button>
            <button onClick={toggleFs} className="p-2 rounded-full hover:bg-white/10 transition-colors" data-testid="fullscreen-btn" aria-label="Fullscreen">
              {isFs ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {isHost && fileName && (
          <div className="mt-2 text-xs text-white/40 truncate" data-testid="host-filename">Streaming: {fileName}</div>
        )}
      </div>
    </div>
  );
}
