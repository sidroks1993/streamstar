import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { BACKEND_URL, formatApiError } from "../lib/api";
import VideoPlayer from "../components/VideoPlayer";
import YouTubePlayer, { parseYouTubeId } from "../components/YouTubePlayer";
import ChatPanel from "../components/ChatPanel";
import { ReactionsOverlay, ReactionPicker } from "../components/Reactions";
import { toast } from "sonner";
import { Copy, ArrowLeft, Film, MessageSquare, Circle, Square, Share2, Mail, MessageCircle, DoorOpen, Check, X, Loader2, Youtube, Sparkles, Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";

const DEFAULT_ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function WatchRoom() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [myId, setMyId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [mutedIds, setMutedIds] = useState([]);
  const [recording, setRecording] = useState(false);
  // Knock-to-enter admission state (guest side): null | 'pending' | 'granted' | 'denied'
  const [admission, setAdmission] = useState(null);
  // Host side: list of {user_id, name, email} awaiting approval
  const [pendingGuests, setPendingGuests] = useState([]);
  // YouTube mode
  const [mode, setMode] = useState("webrtc"); // 'webrtc' | 'youtube'
  const [ytVideoId, setYtVideoId] = useState(null);
  const [ytRemoteState, setYtRemoteState] = useState(null);
  const [ytDialogOpen, setYtDialogOpen] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState("");
  // Dynamic ICE (STUN + optional TURN from backend)
  const [iceConfig, setIceConfig] = useState(DEFAULT_ICE);
  const reactionsRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peer_user_id -> RTCPeerConnection

  // Fetch WebRTC ICE config (STUN + TURN when configured) once
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/config/webrtc");
        if (data?.iceServers?.length) setIceConfig({ iceServers: data.iceServers });
      } catch { /* fall back to default STUN */ }
    })();
  }, []);

  // Redeem a one-tap invite token if the URL has `?invite=...` — pre-admits the current user
  // so the WS handler auto-admits them instead of routing to the knock queue.
  const [inviteRedeemed, setInviteRedeemed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) { setInviteRedeemed(true); return; }
    (async () => {
      try {
        await api.post("/invites/accept", { token });
        toast.success("Invite accepted — you'll walk right in.");
      } catch (e) {
        const msg = formatApiError(e.response?.data?.detail) || "Invite could not be redeemed";
        toast.error(msg);
      } finally {
        // Strip the token from the URL so refresh/copy-paste of the current URL doesn't re-send it
        params.delete("invite");
        const qs = params.toString();
        window.history.replaceState({}, "", `/watch/${roomId}${qs ? `?${qs}` : ""}`);
        setInviteRedeemed(true);
      }
    })();
  }, [roomId]);

  // Load room details
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/rooms/${roomId}`);
        setRoom(data);
      } catch (e) {
        setError(formatApiError(e.response?.data?.detail) || "Room not found");
      }
    })();
  }, [roomId]);

  const wsUrl = () => {
    const base = BACKEND_URL.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
    // Server accepts both JWT access_token and Emergent session_token in ?token=
    // We can't read httpOnly cookies. Request a short-lived echo from /auth/me — but WS needs token in query.
    return `${base}/api/ws/room/${roomId}`;
  };

  // Fetch a short-lived token for WS handshake (server accepts JWT or session token). We ask backend for a token.
  const [wsToken, setWsToken] = useState(null);
  useEffect(() => {
    // Retrieve token — backend does not currently return one via /auth/me for cookies.
    // Provide a small helper endpoint fallback: use document cookies isn't possible for httpOnly.
    // Solution: hit a dedicated endpoint that returns a short-lived echo token.
    (async () => {
      try {
        const { data } = await api.get("/auth/ws-token");
        setWsToken(data.token);
      } catch {
        setError("Could not authenticate WebSocket");
      }
    })();
  }, []);

  // Connect WebSocket
  useEffect(() => {
    if (!room || !wsToken || !inviteRedeemed) return;
    const url = `${wsUrl()}?token=${encodeURIComponent(wsToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {};
    ws.onerror = () => {};
    ws.onclose = () => {
      // If the server closed while we were still waiting, treat as denied
      setAdmission((prev) => (prev === "pending" ? "denied" : prev));
    };
    ws.onmessage = async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "pending_admission":
          setAdmission("pending");
          break;
        case "admission_granted":
          setAdmission("granted");
          toast.success("You've been admitted — welcome!");
          break;
        case "admission_denied":
          setAdmission("denied");
          break;
        case "join_request":
          // Host receives a knock — add to pending list
          if (msg.pending) {
            setPendingGuests(msg.pending);
          } else if (msg.user) {
            setPendingGuests((prev) => {
              if (prev.find((p) => p.user_id === msg.user.user_id)) return prev;
              return [...prev, msg.user];
            });
          }
          toast(`${msg.user?.name || "Someone"} is knocking to join`);
          break;
        case "pending_update":
          setPendingGuests(msg.pending || []);
          break;
        case "welcome":
          setMyId(msg.user_id);
          setIsHost(!!msg.is_host);
          setParticipants(msg.participants || []);
          setMutedIds(msg.muted || []);
          setPendingGuests(msg.pending || []);
          setAdmission("granted");
          if (msg.yt_video_id) {
            setYtVideoId(msg.yt_video_id);
            setMode(msg.mode || "youtube");
          } else {
            setMode(msg.mode || "webrtc");
          }
          // Viewer: ask host to start a peer connection for us (only in webrtc mode)
          if (!msg.is_host && (msg.mode || "webrtc") === "webrtc") ws.send(JSON.stringify({ type: "request_stream" }));
          break;
        case "chat_history":
          setMessages(msg.messages || []);
          break;
        case "yt_video":
          if (msg.video_id) {
            setYtVideoId(msg.video_id);
            setMode("youtube");
            toast("Host started a YouTube video");
          } else {
            setYtVideoId(null);
            setMode("webrtc");
            toast("Host switched back to the movie stream");
          }
          break;
        case "yt_state":
          setYtRemoteState(msg.state);
          break;
        case "participant_joined":
          setParticipants(msg.participants || []);
          toast(`${msg.user?.name || "Someone"} joined`);
          break;
        case "participant_left":
          setParticipants(msg.participants || []);
          // Clean up any peer connection we had with them
          {
            const pc = peersRef.current.get(msg.user_id);
            if (pc) { pc.close(); peersRef.current.delete(msg.user_id); }
          }
          break;
        case "chat":
          setMessages((prev) => [...prev, msg]);
          break;
        case "request_stream":
          // Host: create an offer for the requesting viewer if we have a stream
          if (localStreamRef.current) {
            await createOfferForPeer(msg.from);
          }
          break;
        case "webrtc_offer":
          await handleOffer(msg.from, msg.data);
          break;
        case "webrtc_answer":
          await handleAnswer(msg.from, msg.data);
          break;
        case "webrtc_ice":
          await handleIce(msg.from, msg.data);
          break;
        case "host_streaming":
          // Viewer sees the host started/stopped
          if (msg.streaming && !isHost) ws.send(JSON.stringify({ type: "request_stream" }));
          break;
        case "reaction":
          reactionsRef.current?.push(msg.emoji, msg.name);
          break;
        case "mute_changed":
          setMutedIds((prev) => {
            const set = new Set(prev);
            if (msg.muted) set.add(msg.target); else set.delete(msg.target);
            return Array.from(set);
          });
          break;
        case "chat_blocked":
          toast.error(msg.reason || "Message blocked");
          break;
        case "record_request":
          // Host receives a viewer's request to record
          {
            const approve = window.confirm(`${msg.name || "A viewer"} wants to record this session. Allow?`);
            send({ type: "record_response", to: msg.from, approved: approve });
            toast(approve ? "Recording permission granted" : "Recording denied");
          }
          break;
        case "record_response":
          // Viewer receives host's decision
          if (msg.approved) {
            const stream = remoteStream;
            if (stream) {
              const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
              const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
              recordedChunksRef.current = [];
              rec.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
              rec.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: mime });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url;
                a.download = `streamstar-${Date.now()}.webm`; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setRecording(false); toast.success("Recording saved");
              };
              rec.start(1000); recorderRef.current = rec; setRecording(true);
              toast.success("Host approved — recording HD stream to your computer");
            }
          } else {
            toast.error("Host denied the record request");
          }
          break;
        case "kicked":
          toast.error("You were removed from the room by the host");
          setTimeout(() => navigate("/dashboard"), 800);
          break;
        default:
          break;
      }
    };

    return () => {
    try { ws.close(); } catch { /* ignore */ }
      for (const [, pc] of peersRef.current) pc.close();
      peersRef.current.clear();
    };
  }, [room, wsToken]);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }, []);

  // ---------- WebRTC (host-driven mesh) ----------
  const createPeer = (peerId) => {
    const pc = new RTCPeerConnection(iceConfig);
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "webrtc_ice", to: peerId, data: e.candidate });
    };
    pc.ontrack = (e) => {
      // Viewer receives stream
      setRemoteStream(e.streams[0]);
    };
    peersRef.current.set(peerId, pc);
    return pc;
  };

  const createOfferForPeer = async (peerId) => {
    // Host role: send local stream to viewer
    if (!localStreamRef.current) return;
    let pc = peersRef.current.get(peerId);
    if (pc) { pc.close(); peersRef.current.delete(peerId); }
    pc = createPeer(peerId);
    for (const track of localStreamRef.current.getTracks()) {
      pc.addTrack(track, localStreamRef.current);
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "webrtc_offer", to: peerId, data: offer });
  };

  const handleOffer = async (from, offer) => {
    // Viewer receives an offer from host
    let pc = peersRef.current.get(from);
    if (pc) { pc.close(); peersRef.current.delete(from); }
    pc = createPeer(from);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: "webrtc_answer", to: from, data: answer });
  };

  const handleAnswer = async (from, answer) => {
    const pc = peersRef.current.get(from);
    if (!pc) return;
    await pc.setRemoteDescription(answer);
  };

  const handleIce = async (from, cand) => {
    const pc = peersRef.current.get(from);
    if (!pc || !cand) return;
    try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
  };

  // Host acquires local stream (from VideoPlayer via captureStream)
  const onLocalStreamReady = (stream) => {
    localStreamRef.current = stream;
    send({ type: "host_streaming", streaming: true });
    // Push to any viewers already present
    for (const p of participants) {
      if (p.user_id !== myId) createOfferForPeer(p.user_id);
    }
  };

  // Actions
  const inviteUrl = `${window.location.origin}/watch/${roomId}`;
  const [inviteOpen, setInviteOpen] = useState(false);
  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied");
  };
  const copyCode = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room code copied");
  };
  const nativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join my watch party: ${room?.name || "StreamStar"}`,
          text: `Come watch with me on StreamStar — room code ${roomId}`,
          url: inviteUrl,
        });
      } else {
        copyInvite();
      }
    } catch { /* user cancelled */ }
  };

  const sendReaction = (emoji) => {
    send({ type: "reaction", emoji });
    reactionsRef.current?.push(emoji, "You");
  };

  const kick = (targetId) => {
    if (!window.confirm("Remove this participant from the room?")) return;
    send({ type: "host_kick", target: targetId });
    toast("Participant removed");
  };
  const muteToggle = (targetId, mute) => {
    send({ type: "host_mute", target: targetId, mute });
  };

  const respondKnock = (targetId, approved) => {
    send({ type: "join_response", target: targetId, approved });
    setPendingGuests((prev) => prev.filter((p) => p.user_id !== targetId));
    toast(approved ? "Guest admitted" : "Knock declined");
  };

  const submitYouTube = () => {
    const id = parseYouTubeId(ytUrlInput);
    if (!id) {
      toast.error("That doesn't look like a valid YouTube URL");
      return;
    }
    send({ type: "set_yt", video_id: id });
    setYtVideoId(id);
    setMode("youtube");
    setYtDialogOpen(false);
    setYtUrlInput("");
    toast.success("Sharing YouTube video with everyone");
  };

  const clearYouTube = () => {
    send({ type: "set_yt", video_id: null });
    setYtVideoId(null);
    setMode("webrtc");
    setYtRemoteState(null);
    toast("Switched back to movie stream");
  };

  const onYtHostState = (state) => {
    send({ type: "yt_state", state });
  };

  // One-tap invite: host generates a signed 15-min URL others can use to bypass the knock queue.
  const [oneTapInvite, setOneTapInvite] = useState(null); // { url, expires_at } | null
  const [inviteBusy, setInviteBusy] = useState(false);
  const generateOneTap = async () => {
    setInviteBusy(true);
    try {
      const { data } = await api.post(`/rooms/${roomId}/invites`);
      // Prefer window origin so the URL points at the public app, not the internal cluster host
      const url = `${window.location.origin}/watch/${roomId}?invite=${encodeURIComponent(data.invite_token)}`;
      setOneTapInvite({ url, expires_at: data.expires_at });
      await navigator.clipboard.writeText(url);
      toast.success("One-tap invite copied — valid for 15 minutes");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't create invite");
    } finally {
      setInviteBusy(false);
    }
  };

  const toggleRecording = () => {
    // Host: local recording of own stream. Viewer: ask host first.
    if (!isHost) {
      if (recording) { try { recorderRef.current?.stop(); } catch { /* noop */ } return; }
      if (!remoteStream) { toast.error("Wait for the host to start streaming first."); return; }
      send({ type: "record_request" });
      toast("Recording request sent to host…");
      return;
    }
    if (recording) {
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      return;
    }
    const stream = localStreamRef.current;
    if (!stream) {
      toast.error("Start streaming a movie first, then hit record.");
      return;
    }
    try {
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `streamstar-${room?.name || "recording"}-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setRecording(false);
        toast.success("Recording saved to your downloads");
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
      toast.success("Recording started");
    } catch (e) {
      toast.error("Recording not supported in this browser");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] text-white gap-4">
        <Film className="w-8 h-8 text-white/30" />
        <div className="text-white/70">{error}</div>
        <Button onClick={() => navigate("/dashboard")} className="bg-white/10 hover:bg-white/20 text-white">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to dashboard
        </Button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white/60">
        <div className="animate-pulse text-sm tracking-widest uppercase">Entering the theater…</div>
      </div>
    );
  }

  // Waiting-room overlay (before host admits us)
  if (admission === "pending") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] text-white px-6" data-testid="knock-waiting">
        <div className="max-w-md w-full text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-[#A855F7]/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#A855F7] to-[#C026D3] flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.4)]">
              <DoorOpen className="w-9 h-9 text-white" />
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.24em] text-[#A855F7] mb-3">Knocking…</div>
          <h1 className="font-display text-3xl tracking-tight mb-3">Waiting for the host to let you in</h1>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            <span className="text-white">{room.host_name || "The host"}</span> has been notified. You&apos;ll enter <span className="text-white">{room.name}</span> the moment they approve.
          </p>
          <div className="flex items-center justify-center gap-2 text-white/40 text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            Awaiting response
          </div>
          <Button
            onClick={() => navigate("/dashboard")}
            variant="ghost"
            className="mt-8 text-white/60 hover:text-white hover:bg-white/5"
            data-testid="knock-cancel"
          >
            Cancel and go back
          </Button>
        </div>
      </div>
    );
  }

  if (admission === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] text-white px-6" data-testid="knock-denied">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <X className="w-7 h-7 text-white/50" />
          </div>
          <h1 className="font-display text-3xl tracking-tight mb-3">Access declined</h1>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            The host didn&apos;t admit you to <span className="text-white">{room.name}</span>. You can try again later or ask them for a direct invite.
          </p>
          <Button onClick={() => navigate("/dashboard")} className="bg-[#A855F7] hover:bg-[#C026D3] text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#050505]">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/dashboard")} className="p-2 rounded-md hover:bg-white/10" data-testid="exit-room-btn">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="font-display text-lg tracking-tight truncate">{room.name}</div>
            <div className="text-[11px] text-white/40 truncate">
              Hosted by {room.host_name || "—"} · {room.is_public ? "Public" : "Private"} · ID {room.room_id}
              {isHost && <span className="ml-2 text-[#A855F7]">You&apos;re the host</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isHost && (
            mode === "youtube" ? (
              <Button
                onClick={clearYouTube}
                variant="ghost"
                className="text-[#EC4899] hover:text-white hover:bg-white/5"
                data-testid="yt-clear-btn"
                title="Switch back to movie stream"
              >
                <Youtube className="w-4 h-4 mr-2" /> Stop YouTube
              </Button>
            ) : (
              <Button
                onClick={() => setYtDialogOpen(true)}
                variant="ghost"
                className="text-white/70 hover:text-white hover:bg-white/5"
                data-testid="yt-open-btn"
                title="Play a YouTube video for everyone"
              >
                <Youtube className="w-4 h-4 mr-2 text-[#EC4899]" /> YouTube
              </Button>
            )
          )}
          {(isHost || remoteStream) && mode === "webrtc" && (
            <Button
              onClick={toggleRecording}
              variant="ghost"
              className={`${recording ? "text-[#EC4899]" : "text-white/70"} hover:text-white hover:bg-white/5`}
              data-testid="record-btn"
              title={isHost ? (recording ? "Stop recording" : "Start recording") : (recording ? "Stop recording" : "Request to record")}
            >
              {recording ? <Square className="w-4 h-4 mr-2 fill-current" /> : <Circle className="w-4 h-4 mr-2 fill-current text-[#A855F7]" />}
              {recording ? "Stop rec" : isHost ? "Record" : "Request record"}
            </Button>
          )}
          <Button onClick={() => setInviteOpen(true)} variant="ghost" className="text-white/70 hover:text-white hover:bg-white/5" data-testid="copy-invite-btn">
            <Copy className="w-4 h-4 mr-2" /> Invite
          </Button>
          <Button onClick={() => setChatOpen((v) => !v)} variant="ghost" className="lg:hidden text-white/70 hover:text-white hover:bg-white/5" data-testid="toggle-chat-btn">
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative min-w-0">
          {mode === "youtube" ? (
            <YouTubePlayer
              isHost={isHost}
              videoId={ytVideoId}
              remoteState={ytRemoteState}
              onStateChange={onYtHostState}
              roomName={room.name}
            />
          ) : (
            <VideoPlayer
              isHost={isHost}
              roomName={room.name}
              remoteStream={remoteStream}
              onStreamReady={onLocalStreamReady}
            />
          )}
          <ReactionsOverlay ref={reactionsRef} />
          <div className="absolute right-4 top-4 z-10">
            <ReactionPicker onPick={sendReaction} />
          </div>
        </div>
        <div className={`${chatOpen ? "flex" : "hidden"} lg:flex w-full lg:w-96 shrink-0`}>
          <ChatPanel
            messages={messages}
            myUserId={myId}
            participants={participants}
            onSend={(text) => send({ type: "chat", text })}
            amIHost={isHost}
            mutedIds={mutedIds}
            onKick={kick}
            onMute={muteToggle}
          />
        </div>
      </div>

      {/* Invite dialog — any participant can share */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-[#0E0E0E] border-white/10 text-white sm:max-w-md" data-testid="invite-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <Share2 className="w-5 h-5 text-[#A855F7]" /> Invite friends
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              Anyone with the link can knock — you&apos;ll approve them from inside the room.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Room code</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/50 border border-white/10 rounded-md px-4 py-3 font-mono text-lg tracking-widest text-white text-center" data-testid="invite-code">{roomId}</code>
                <Button onClick={copyCode} variant="ghost" className="text-white/70 hover:text-white hover:bg-white/5" data-testid="invite-copy-code"><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Invite link</div>
              <div className="flex items-center gap-2">
                <input readOnly value={inviteUrl}
                  className="flex-1 bg-black/50 border border-white/10 rounded-md px-3 py-2 text-xs text-white/80 truncate"
                  onFocus={(e) => e.target.select()} data-testid="invite-url" />
                <Button onClick={copyInvite} className="bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="invite-copy-link">Copy</Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Button onClick={nativeShare} variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 text-white" data-testid="invite-native-share">
                <Share2 className="w-4 h-4 mr-2" /> Share
              </Button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Join my StreamStar watch party: ${inviteUrl}`)}`} target="_blank" rel="noreferrer" data-testid="invite-whatsapp">
                <Button variant="outline" className="w-full border-white/10 bg-white/5 hover:bg-white/10 text-white">
                  <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                </Button>
              </a>
              <a href={`mailto:?subject=${encodeURIComponent(`Watch party: ${room?.name}`)}&body=${encodeURIComponent(`Join me on StreamStar — ${inviteUrl}`)}`} data-testid="invite-email">
                <Button variant="outline" className="w-full border-white/10 bg-white/5 hover:bg-white/10 text-white">
                  <Mail className="w-4 h-4 mr-2" /> Email
                </Button>
              </a>
            </div>

            {/* One-tap VIP invite — host only */}
            {isHost && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
                  <div className="text-xs uppercase tracking-widest text-white/70">One-tap VIP invite</div>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed mb-3">
                  Skip the knock queue. The link lets one friend walk right in — valid for 15 minutes, single-use per person, works even for brand-new sign-ups.
                </p>
                {oneTapInvite ? (
                  <div className="rounded-md border border-[#EC4899]/30 bg-[#EC4899]/5 p-3 space-y-2" data-testid="onetap-invite-result">
                    <input
                      readOnly
                      value={oneTapInvite.url}
                      className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-[11px] text-white/80 font-mono truncate"
                      onFocus={(e) => e.target.select()}
                      data-testid="onetap-invite-url"
                    />
                    <div className="flex items-center justify-between text-[10px] text-white/50 uppercase tracking-widest">
                      <span>Expires {new Date(oneTapInvite.expires_at).toLocaleTimeString()}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(oneTapInvite.url); toast.success("Copied again"); }}
                        className="hover:text-white flex items-center gap-1"
                        data-testid="onetap-invite-copy"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={generateOneTap}
                    disabled={inviteBusy}
                    className="w-full bg-gradient-to-r from-[#EC4899] to-[#A855F7] hover:opacity-90 text-white disabled:opacity-60"
                    data-testid="onetap-invite-btn"
                  >
                    <Zap className="w-4 h-4 mr-2" /> {inviteBusy ? "Generating…" : "Generate one-tap invite"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Host YouTube URL dialog */}
      <Dialog open={ytDialogOpen} onOpenChange={setYtDialogOpen}>
        <DialogContent className="bg-[#0E0E0E] border-white/10 text-white sm:max-w-md" data-testid="yt-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <Youtube className="w-5 h-5 text-[#EC4899]" /> Play a YouTube video
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              Paste any YouTube link — everyone in the room watches in sync. You control play, pause, and seek.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={ytUrlInput}
              onChange={(e) => setYtUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="bg-black/40 border-white/10 text-white focus-visible:ring-[#A855F7]/40 font-mono"
              onKeyDown={(e) => { if (e.key === "Enter") submitYouTube(); }}
              data-testid="yt-url-input"
            />
            <div className="text-[11px] text-white/40">Supports `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`, or a bare 11-char video ID.</div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setYtDialogOpen(false)}
              variant="ghost"
              className="text-white/60 hover:text-white hover:bg-white/5"
              data-testid="yt-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={submitYouTube}
              disabled={!ytUrlInput.trim()}
              className="bg-[#EC4899] hover:bg-[#A855F7] text-white"
              data-testid="yt-submit"
            >
              <Youtube className="w-4 h-4 mr-2" /> Play for everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Host-side: pending knock approvals — floating card */}
      {isHost && pendingGuests.length > 0 && (
        <div
          className="fixed bottom-6 left-6 z-40 w-80 rounded-xl border border-[#A855F7]/40 bg-[#0E0E0E]/95 backdrop-blur-xl shadow-2xl shadow-[#A855F7]/20 overflow-hidden"
          data-testid="pending-guests-panel"
        >
          <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-[#A855F7]/15 to-transparent flex items-center gap-2">
            <DoorOpen className="w-4 h-4 text-[#A855F7]" />
            <div className="font-display text-sm">
              {pendingGuests.length} {pendingGuests.length === 1 ? "person" : "people"} knocking
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {pendingGuests.map((g) => (
              <div
                key={g.user_id}
                className="px-4 py-3 border-b border-white/5 flex items-center gap-3"
                data-testid={`pending-guest-${g.user_id}`}
              >
                <div className="w-9 h-9 rounded-full bg-[#A855F7]/20 border border-[#A855F7]/40 flex items-center justify-center text-sm font-semibold text-[#A855F7] shrink-0">
                  {(g.name || "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{g.name || "Guest"}</div>
                  {g.email && <div className="text-[11px] text-white/40 truncate">{g.email}</div>}
                </div>
                <button
                  onClick={() => respondKnock(g.user_id, true)}
                  className="p-2 rounded-md bg-[#A855F7] hover:bg-[#C026D3] text-white transition-colors"
                  data-testid={`approve-knock-${g.user_id}`}
                  aria-label="Admit"
                  title="Admit"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => respondKnock(g.user_id, false)}
                  className="p-2 rounded-md bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  data-testid={`deny-knock-${g.user_id}`}
                  aria-label="Decline"
                  title="Decline"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
