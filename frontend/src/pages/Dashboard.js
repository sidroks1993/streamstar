import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import BackgroundLogo from "../components/BackgroundLogo";
import CursorGlow from "../components/CursorGlow";
import FloatingOrbs from "../components/FloatingOrbs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Film, Plus, Users, Radio, Copy, LogIn, ShieldQuestion, Clock, Link2, Hash, Sparkles } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState("");

  const canHost = user?.can_host || user?.role === "super_admin" || user?.role === "host";
  const [reqOpen, setReqOpen] = useState(false);
  const [reqStatus, setReqStatus] = useState(null); // null | 'pending' | 'approved' | 'already'
  const { refresh } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/rooms");
      setRooms(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/rooms", { name: name.trim(), is_public: isPublic });
      setOpen(false);
      setName("");
      toast.success("Room ready — let's roll");
      navigate(`/watch/${data.room_id}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not create room");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (roomId) => {
    const url = `${window.location.origin}/watch/${roomId}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const copyCode = (roomId) => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room code copied");
  };

  const joinById = () => {
    const id = joinId.trim();
    if (!id) return;
    // accept full URL or just id
    const match = id.match(/watch\/([a-zA-Z0-9]+)/);
    navigate(`/watch/${match ? match[1] : id}`);
  };

  const requestHost = async () => {
    try {
      const { data } = await api.post("/host-requests");
      if (data.status === "already_host") {
        toast.success("You are already a host");
        setReqStatus("approved");
        refresh();
        return;
      }
      setReqStatus("pending");
      toast.success("Request sent to the super admin");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not send request");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <CursorGlow />
      <BackgroundLogo variant="peek" />
      <FloatingOrbs className="opacity-70" />
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-12 relative z-10">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 ss-fade-up">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#A855F7] mb-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A855F7] opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#A855F7]" />
              </span>
              Your theater
            </div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">
              Hi, <span className="ss-gradient-text">{user?.name?.split(" ")[0] || "friend"}</span>.
            </h1>
            <p className="text-white/60 mt-2 text-sm max-w-lg">
              {canHost
                ? "Create a room, share the link, and start streaming a movie from your machine."
                : "Browse public rooms and jump into any movie night. Ask the super admin to grant you host permission to stream your own films."}
            </p>
          </div>
          <div className="flex gap-3">
            {canHost ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="ss-shimmer bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="create-room-btn">
                    <Sparkles className="w-4 h-4 mr-2" /> New watch room
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0E0E0E] border-white/10 text-white sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl">Start a watch party</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-white/70 text-xs uppercase tracking-widest">Room name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="Friday Movie Night"
                        className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
                        data-testid="new-room-name" />
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
                      <div>
                        <div className="text-sm">Public room</div>
                        <div className="text-xs text-white/50">Anyone with the link can join.</div>
                      </div>
                      <Switch checked={isPublic} onCheckedChange={setIsPublic} data-testid="new-room-public" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={create} disabled={creating}
                      className="bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="new-room-submit">
                      {creating ? "Creating…" : "Create & enter"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={reqOpen} onOpenChange={setReqOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="create-room-btn">
                    <Plus className="w-4 h-4 mr-2" /> New watch room
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0E0E0E] border-white/10 text-white sm:max-w-md" data-testid="request-host-dialog">
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl flex items-center gap-2">
                      <ShieldQuestion className="w-5 h-5 text-[#A855F7]" /> Request host access
                    </DialogTitle>
                    <DialogDescription className="text-white/60 text-sm pt-2">
                      Only approved hosts can stream movies. Send a request to the super admin — you&apos;ll be notified the moment it&apos;s approved.
                    </DialogDescription>
                  </DialogHeader>
                  {reqStatus === "pending" ? (
                    <div className="rounded-md border border-[#A855F7]/30 bg-[#A855F7]/10 p-4" data-testid="request-pending">
                      <div className="flex items-start gap-2 text-sm">
                        <Clock className="w-4 h-4 text-[#A855F7] shrink-0 mt-0.5" />
                        <span>Requested the SuperAdmin for host access. You&apos;ll shortly be notified!</span>
                      </div>
                    </div>
                  ) : reqStatus === "approved" ? (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300" data-testid="request-approved">
                      You&apos;re now a host. Close this dialog to create a room.
                    </div>
                  ) : null}
                  <DialogFooter>
                    {!reqStatus && (
                      <Button
                        onClick={requestHost}
                        className="bg-[#A855F7] hover:bg-[#C026D3] text-white"
                        data-testid="request-host-submit"
                      >
                        Request host access
                      </Button>
                    )}
                    {reqStatus === "approved" && (
                      <Button onClick={() => { setReqOpen(false); setReqStatus(null); }}
                        className="bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="request-close-btn">
                        Great, let&apos;s go
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Join by link */}
        <div className="rounded-xl border border-white/10 bg-[#0E0E0E] p-6 mb-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium mb-1">Have an invite link?</div>
            <div className="text-xs text-white/50">Paste it below or type a room ID to jump in.</div>
          </div>
          <div className="flex gap-2 sm:w-96">
            <Input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="paste link or room id"
              className="bg-black/40 border-white/10 text-white focus-visible:ring-white/30" data-testid="join-input" />
            <Button onClick={joinById} className="bg-white/10 hover:bg-white/20 text-white" data-testid="join-btn">
              <LogIn className="w-4 h-4 mr-2" /> Join
            </Button>
          </div>
        </div>

        {/* Public rooms */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#A855F7]" /> Public rooms
          </h2>
          <button onClick={load} className="text-xs text-white/50 hover:text-white uppercase tracking-widest" data-testid="refresh-rooms">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-white/40 text-sm">Loading rooms…</div>
        ) : rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0A0A0A] p-12 text-center">
            <Film className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/60 text-sm">No public rooms yet. {canHost ? "Create one to get started." : "Check back soon."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((r, idx) => (
              <div
                key={r.room_id}
                className="ss-room-card ss-card-in group rounded-xl border border-white/10 bg-[#0E0E0E] p-5"
                style={{ animationDelay: `${Math.min(idx * 60, 480)}ms` }}
                data-testid={`room-card-${r.room_id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-lg leading-tight group-hover:ss-gradient-text transition-colors">{r.name}</h3>
                    <div className="text-xs text-white/40 mt-1">Hosted by {r.host_name || "—"}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1.5 ${
                      r.participant_count > 0
                        ? "bg-[#A855F7]/10 border-[#A855F7]/40 text-[#A855F7]"
                        : "bg-white/5 border-white/10 text-white/60"
                    }`}
                  >
                    {r.participant_count > 0 && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A855F7] opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#A855F7]" />
                      </span>
                    )}
                    <Users className="w-3 h-3" /> {r.participant_count}
                  </span>
                </div>

                {/* Prominent share block — visible only to super-admin, the room host, or users who've joined the room */}
                {r.code && (
                  <div className="rounded-lg border border-[#A855F7]/25 bg-gradient-to-br from-[#A855F7]/10 to-[#C026D3]/5 p-3 mb-4 space-y-2" data-testid={`share-block-${r.room_id}`}>
                    <div className="flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/50 w-14 shrink-0">Code</div>
                      <button
                        onClick={() => copyCode(r.code)}
                        className="flex-1 min-w-0 font-mono text-sm text-white tracking-widest text-left truncate hover:text-[#A855F7] transition-colors"
                        data-testid={`room-code-${r.room_id}`}
                        title="Click to copy code"
                      >
                        {r.code.toUpperCase()}
                      </button>
                      <button
                        onClick={() => copyCode(r.code)}
                        className="text-white/50 hover:text-white p-1 rounded hover:bg-white/5"
                        data-testid={`copy-code-${r.room_id}`}
                        aria-label="Copy code"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/50 w-14 shrink-0">Link</div>
                      <button
                        onClick={() => copyLink(r.room_id)}
                        className="flex-1 min-w-0 text-xs text-white/70 truncate text-left hover:text-[#A855F7] transition-colors"
                        data-testid={`room-link-${r.room_id}`}
                        title="Click to copy link"
                      >
                        {`${window.location.origin.replace(/^https?:\/\//, "")}/watch/${r.room_id}`}
                      </button>
                      <button
                        onClick={() => copyLink(r.room_id)}
                        className="text-white/50 hover:text-white p-1 rounded hover:bg-white/5"
                        data-testid={`copy-room-${r.room_id}`}
                        aria-label="Copy invite link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <Link to={`/watch/${r.room_id}`}>
                  <Button className="ss-shimmer w-full bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid={`join-room-${r.room_id}`}>
                    {r.code ? "Enter room" : "Knock to join"}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
