import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Film, Plus, Users, Radio, Copy, LogIn } from "lucide-react";

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

  const joinById = () => {
    const id = joinId.trim();
    if (!id) return;
    // accept full URL or just id
    const match = id.match(/watch\/([a-zA-Z0-9]+)/);
    navigate(`/watch/${match ? match[1] : id}`);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#E50914] mb-2">Your theater</div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">Hi, {user?.name?.split(" ")[0] || "friend"}.</h1>
            <p className="text-white/60 mt-2 text-sm max-w-lg">
              {canHost
                ? "Create a room, share the link, and start streaming a movie from your machine."
                : "Browse public rooms and jump into any movie night. Ask the super admin to grant you host permission to stream your own films."}
            </p>
          </div>
          <div className="flex gap-3">
            {canHost && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#E50914] hover:bg-[#F40612] text-white" data-testid="create-room-btn">
                    <Plus className="w-4 h-4 mr-2" /> New watch room
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
                      className="bg-[#E50914] hover:bg-[#F40612] text-white" data-testid="new-room-submit">
                      {creating ? "Creating…" : "Create & enter"}
                    </Button>
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
            <Radio className="w-5 h-5 text-[#E50914]" /> Public rooms
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
            {rooms.map((r) => (
              <div key={r.room_id} className="group rounded-xl border border-white/10 bg-[#0E0E0E] p-5 hover:border-white/20 transition-colors" data-testid={`room-card-${r.room_id}`}>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="font-display text-lg leading-tight">{r.name}</h3>
                    <div className="text-xs text-white/40 mt-1">Hosted by {r.host_name || "—"}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 flex items-center gap-1">
                    <Users className="w-3 h-3" /> {r.participant_count}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/watch/${r.room_id}`} className="flex-1">
                    <Button className="w-full bg-[#E50914] hover:bg-[#F40612] text-white" data-testid={`join-room-${r.room_id}`}>
                      Join room
                    </Button>
                  </Link>
                  <Button variant="ghost" onClick={() => copyLink(r.room_id)} className="text-white/60 hover:text-white hover:bg-white/5" data-testid={`copy-room-${r.room_id}`}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
