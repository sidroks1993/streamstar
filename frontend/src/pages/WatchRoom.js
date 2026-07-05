import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { BACKEND_URL, formatApiError } from "../lib/api";
import VideoPlayer from "../components/VideoPlayer";
import ChatPanel from "../components/ChatPanel";
import { ReactionsOverlay, ReactionPicker } from "../components/Reactions";
import { toast } from "sonner";
import { Copy, ArrowLeft, Film, MessageSquare, Circle, Square, Share2, Mail, MessageCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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
  const reactionsRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peer_user_id -> RTCPeerConnection

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
    if (!room || !wsToken) return;
    const url = `${wsUrl()}?token=${encodeURIComponent(wsToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {};
    ws.onerror = () => {};
    ws.onclose = () => {};
    ws.onmessage = async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "welcome":
          setMyId(msg.user_id);
          setIsHost(!!msg.is_host);
          setParticipants(msg.participants || []);
          setMutedIds(msg.muted || []);
          // Viewer: ask host to start a peer connection for us
          if (!msg.is_host) ws.send(JSON.stringify({ type: "request_stream" }));
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
    const pc = new RTCPeerConnection(ICE);
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
          {(isHost || remoteStream) && (
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
          <VideoPlayer
            isHost={isHost}
            roomName={room.name}
            remoteStream={remoteStream}
            onStreamReady={onLocalStreamReady}
          />
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
              Anyone with the link can join this room. Share the link, drop the room code, or send it straight to your contacts.
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
