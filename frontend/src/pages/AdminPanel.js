import React, { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import api, { formatApiError } from "../lib/api";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck, Crown, Video, User as UserIcon, KeyRound, Trash2, Bell, RefreshCw, Activity, DoorOpen, Radio, Film, LogIn, LogOut as LogOutIcon, Copy, Link2, Hash, Users } from "lucide-react";

function fmt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const EVENT_META = {
  room_created: { icon: Film, color: "text-[#A855F7]", label: "Room created" },
  participant_joined: { icon: LogIn, color: "text-emerald-400", label: "Joined room" },
  participant_left: { icon: LogOutIcon, color: "text-white/50", label: "Left room" },
  stream_started: { icon: Radio, color: "text-[#EC4899]", label: "Stream started" },
  stream_ended: { icon: Radio, color: "text-[#22D3EE]", label: "Stream ended" },
  host_granted: { icon: ShieldCheck, color: "text-emerald-400", label: "Host granted" },
  host_revoked: { icon: ShieldCheck, color: "text-[#EC4899]", label: "Host revoked" },
  join_knock: { icon: DoorOpen, color: "text-[#A855F7]", label: "Knocked" },
  guest_admitted: { icon: DoorOpen, color: "text-emerald-400", label: "Guest admitted" },
  guest_denied: { icon: DoorOpen, color: "text-[#EC4899]", label: "Guest denied" },
};

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [events, setEvents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [resetUser, setResetUser] = useState(null);
  const [newPw, setNewPw] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [u, n, r, e, rm] = await Promise.all([
        api.get("/users"),
        api.get("/notifications/me"),
        api.get("/host-requests"),
        api.get("/events"),
        api.get("/rooms"),
      ]);
      setUsers(u.data);
      setNotifs(n.data);
      setRequests(r.data);
      setEvents(e.data);
      setRooms(rm.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Cannot load admin data");
    } finally {
      setLoading(false);
    }
  };

  const copyText = (label, val) => {
    navigator.clipboard.writeText(val);
    toast.success(`${label} copied`);
  };

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  const toggleHost = async (u, next) => {
    try {
      const { data } = await api.post("/users/grant-host", { user_id: u.user_id, can_host: next });
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? data : x)));
      toast.success(next ? `${u.name} can now host movies` : `${u.name}'s host access revoked`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Update failed");
    }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.user_id}`);
      setUsers((prev) => prev.filter((x) => x.user_id !== u.user_id));
      toast.success("User deleted");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Delete failed");
    }
  };

  const submitReset = async () => {
    if (!resetUser || newPw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await api.post(`/users/${resetUser.user_id}/reset-password`, { new_password: newPw });
      toast.success(`Password reset for ${resetUser.email}`);
      setResetUser(null);
      setNewPw("");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Reset failed");
    }
  };

  const markRead = async () => {
    try {
      await api.post("/notifications/me/read-all");
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  };

  const filtered = users.filter((u) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return u.email.toLowerCase().includes(s) || u.name.toLowerCase().includes(s) || u.role.includes(s);
  });

  const pending = requests.filter((r) => r.status === "pending");

  const eventTypes = useMemo(() => Array.from(new Set(events.map((e) => e.event_type))).sort(), [events]);
  const filteredEvents = useMemo(
    () => (eventFilter === "all" ? events : events.filter((e) => e.event_type === eventFilter)),
    [events, eventFilter],
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-6 h-6 text-[#A855F7]" />
          <div className="text-xs uppercase tracking-[0.2em] text-[#A855F7]">Super admin</div>
        </div>
        <h1 className="font-display text-4xl tracking-tighter mb-2">Command center</h1>
        <p className="text-white/60 text-sm mb-8 max-w-2xl">
          Users, host requests, activity — everything you need to run StreamStar. Passwords are stored as one-way bcrypt hashes (not viewable), but you can reset any user&apos;s password instantly.
        </p>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="rounded-xl border border-white/10 bg-[#0E0E0E] p-4">
            <div className="text-xs uppercase tracking-widest text-white/40">Total users</div>
            <div className="font-display text-3xl mt-1" data-testid="stat-users">{users.length}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0E0E0E] p-4">
            <div className="text-xs uppercase tracking-widest text-white/40">Approved hosts</div>
            <div className="font-display text-3xl mt-1" data-testid="stat-hosts">{users.filter((u) => u.can_host).length}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0E0E0E] p-4">
            <div className="text-xs uppercase tracking-widest text-white/40">Pending requests</div>
            <div className="font-display text-3xl mt-1" data-testid="stat-pending">{pending.length}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0E0E0E] p-4">
            <div className="text-xs uppercase tracking-widest text-white/40">Notifications</div>
            <div className="font-display text-3xl mt-1 flex items-center gap-2" data-testid="stat-notifs">
              {unreadCount}
              {unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse" />}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-xl border border-white/10 bg-[#0E0E0E] mb-8">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#A855F7]" />
              <h2 className="font-display text-lg">Recent activity</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-2 hover:bg-white/5 rounded-md" data-testid="refresh-admin"><RefreshCw className="w-4 h-4" /></button>
              {unreadCount > 0 && <Button variant="ghost" onClick={markRead} className="text-xs text-white/60 hover:text-white" data-testid="mark-read-btn">Mark all read</Button>}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="p-6 text-white/40 text-sm">No notifications yet.</div>
            ) : notifs.slice(0, 20).map((n) => (
              <div key={n.id} className={`px-6 py-3 border-b border-white/5 flex items-start justify-between gap-4 ${!n.read ? "bg-white/[0.02]" : ""}`} data-testid={`notif-${n.id}`}>
                <div className="flex items-start gap-3 min-w-0">
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7] mt-2 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-sm">{n.message}</div>
                    <div className="text-[11px] text-white/40 mt-0.5">{fmt(n.created_at)} · {n.type}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All watch rooms — super admin sees every room code + link */}
        <div className="flex items-center gap-2 mb-4 mt-8">
          <Video className="w-5 h-5 text-[#A855F7]" />
          <h2 className="font-display text-2xl tracking-tight">All watch rooms</h2>
          <span className="text-xs text-white/40 ml-2">{rooms.length} total</span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0E0E0E] overflow-hidden mb-10" data-testid="all-rooms-table">
          {rooms.length === 0 ? (
            <div className="p-8 text-white/40 text-sm text-center">No rooms yet.</div>
          ) : rooms.map((r) => (
            <div key={r.room_id} className="px-6 py-4 border-b border-white/5 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center" data-testid={`admin-room-${r.room_id}`}>
              <div className="min-w-0">
                <div className="font-display text-base text-white truncate">{r.name}</div>
                <div className="text-[11px] text-white/40 mt-0.5">Hosted by {r.host_name || "—"} · {r.is_public ? "Public" : "Private"} · {fmt(r.created_at)}</div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Hash className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                <button
                  onClick={() => copyText("Code", r.room_id)}
                  className="font-mono text-sm text-white tracking-widest hover:text-[#A855F7] truncate max-w-[160px]"
                  data-testid={`admin-room-code-${r.room_id}`}
                  title="Copy code"
                >
                  {r.room_id.toUpperCase()}
                </button>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                <button
                  onClick={() => copyText("Link", `${window.location.origin}/watch/${r.room_id}`)}
                  className="text-xs text-white/70 hover:text-[#A855F7] truncate max-w-[240px]"
                  data-testid={`admin-room-link-${r.room_id}`}
                  title="Copy invite link"
                >
                  {`${window.location.origin.replace(/^https?:\/\//, "")}/watch/${r.room_id}`}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {r.participant_count}
                </span>
                <a href={`/watch/${r.room_id}`} target="_blank" rel="noreferrer" data-testid={`admin-room-open-${r.room_id}`}>
                  <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/5">Open</Button>
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Users */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap mt-8">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#A855F7]" />
            <h2 className="font-display text-2xl tracking-tight">Activity log</h2>
            <span className="text-xs text-white/40 ml-2">Everything from the last 7 days</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setEventFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                eventFilter === "all"
                  ? "bg-[#A855F7]/15 border-[#A855F7]/40 text-[#A855F7]"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              }`}
              data-testid="event-filter-all"
            >
              All ({events.length})
            </button>
            {eventTypes.map((t) => (
              <button
                key={t}
                onClick={() => setEventFilter(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  eventFilter === t
                    ? "bg-[#A855F7]/15 border-[#A855F7]/40 text-[#A855F7]"
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                }`}
                data-testid={`event-filter-${t}`}
              >
                {(EVENT_META[t]?.label) || t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0E0E0E] overflow-hidden mb-10" data-testid="activity-log">
          <div className="max-h-96 overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-white/40 text-sm text-center">No events yet in this window.</div>
            ) : filteredEvents.map((e) => {
              const meta = EVENT_META[e.event_type] || { icon: Activity, color: "text-white/60", label: e.event_type };
              const Icon = meta.icon;
              return (
                <div key={e.id} className="px-6 py-3 border-b border-white/5 flex items-center gap-4 hover:bg-white/[0.02]" data-testid={`event-${e.id}`}>
                  <div className={`w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/90 truncate">
                      <span className="font-medium">{e.actor_name || "System"}</span>
                      <span className="text-white/50"> · {meta.label}</span>
                      {e.room_name && <span className="text-white/70"> · {e.room_name}</span>}
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmt(e.created_at)}</span>
                      {e.actor_email && <span>· {e.actor_email}</span>}
                      {e.meta?.duration_ms != null && (
                        <span className="text-[#22D3EE]">· {fmtDuration(e.meta.duration_ms)} watched</span>
                      )}
                      {e.meta?.method && <span>· {e.meta.method}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Users */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="font-display text-2xl tracking-tight">Users</h2>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, role…"
            className="max-w-xs bg-black/40 border-white/10 text-white focus-visible:ring-white/30" data-testid="admin-search" />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0E0E0E] overflow-hidden">
          <div className="grid grid-cols-12 px-6 py-4 border-b border-white/10 text-xs uppercase tracking-widest text-white/40">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-1 text-center">Logins</div>
            <div className="col-span-2">Last login</div>
            <div className="col-span-1 text-center">Host</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {loading ? (
            <div className="p-8 text-white/40 text-sm">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-white/40 text-sm">No users match.</div>
          ) : filtered.map((u) => (
            <div key={u.user_id} className="grid grid-cols-12 px-6 py-4 items-center border-b border-white/5 hover:bg-white/[0.02] gap-2" data-testid={`user-row-${u.user_id}`}>
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                {u.picture ? (
                  <img src={u.picture} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-white/70" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.name}</div>
                  <div className="text-xs text-white/50 truncate">{u.email}</div>
                  <div className="text-[10px] text-white/30 mt-0.5">Joined {fmt(u.created_at)} · {u.auth_provider}</div>
                </div>
              </div>
              <div className="col-span-2">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
                  u.role === "super_admin"
                    ? "bg-[#A855F7]/10 border-[#A855F7]/30 text-[#A855F7]"
                    : u.role === "host"
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}>
                  {u.role === "super_admin" ? <Crown className="w-3 h-3" /> : u.role === "host" ? <Video className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                  {u.role.replace("_", " ")}
                </span>
              </div>
              <div className="col-span-1 text-center text-sm text-white/70 tabular-nums">{u.login_count || 0}</div>
              <div className="col-span-2 text-xs text-white/50">{fmt(u.last_login)}</div>
              <div className="col-span-1 flex justify-center">
                {u.role === "super_admin" ? (
                  <span className="text-[11px] text-white/40">always</span>
                ) : (
                  <Switch checked={!!u.can_host} onCheckedChange={(next) => toggleHost(u, next)} data-testid={`toggle-host-${u.user_id}`} />
                )}
              </div>
              <div className="col-span-2 flex justify-end gap-1">
                {u.auth_provider === "email" && (
                  <Button variant="ghost" size="sm" onClick={() => { setResetUser(u); setNewPw(""); }}
                    className="text-white/60 hover:text-white hover:bg-white/5" data-testid={`reset-pw-${u.user_id}`}>
                    <KeyRound className="w-4 h-4" />
                  </Button>
                )}
                {u.role !== "super_admin" && (
                  <Button variant="ghost" size="sm" onClick={() => deleteUser(u)}
                    className="text-[#A855F7]/80 hover:text-[#A855F7] hover:bg-[#A855F7]/10" data-testid={`delete-user-${u.user_id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Password reset dialog */}
      <Dialog open={!!resetUser} onOpenChange={(o) => { if (!o) setResetUser(null); }}>
        <DialogContent className="bg-[#0E0E0E] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#A855F7]" /> Reset password
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              Set a new password for <span className="text-white">{resetUser?.email}</span>. They will need to sign in with the new password.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-widest">New password</Label>
            <Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              placeholder="min. 6 characters"
              className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
              data-testid="reset-pw-input" />
          </div>
          <DialogFooter>
            <Button onClick={submitReset} className="bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="reset-pw-submit">
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
