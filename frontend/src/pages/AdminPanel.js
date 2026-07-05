import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import api, { formatApiError } from "../lib/api";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { ShieldCheck, Crown, Video, User as UserIcon } from "lucide-react";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Cannot load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleHost = async (u, next) => {
    try {
      const { data } = await api.post("/users/grant-host", { user_id: u.user_id, can_host: next });
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? data : x)));
      toast.success(next ? `${u.name} can now host movies` : `${u.name}'s host access revoked`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Update failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 lg:px-10 py-12">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-6 h-6 text-[#E50914]" />
          <div className="text-xs uppercase tracking-[0.2em] text-[#E50914]">Super admin</div>
        </div>
        <h1 className="font-display text-4xl tracking-tighter mb-2">Manage streaming permissions</h1>
        <p className="text-white/60 text-sm mb-10 max-w-2xl">
          Grant &quot;host&quot; access to any user so they can create rooms and stream movies. Viewers without host access can still join any public room.
        </p>

        <div className="rounded-xl border border-white/10 bg-[#0E0E0E] overflow-hidden">
          <div className="grid grid-cols-12 px-6 py-4 border-b border-white/10 text-xs uppercase tracking-widest text-white/40">
            <div className="col-span-6">User</div>
            <div className="col-span-3">Role</div>
            <div className="col-span-3 text-right">Can host</div>
          </div>
          {loading ? (
            <div className="p-8 text-white/40 text-sm">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-white/40 text-sm">No users yet.</div>
          ) : users.map((u) => (
            <div key={u.user_id} className="grid grid-cols-12 px-6 py-5 items-center border-b border-white/5 hover:bg-white/[0.02]" data-testid={`user-row-${u.user_id}`}>
              <div className="col-span-6 flex items-center gap-3 min-w-0">
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
                </div>
              </div>
              <div className="col-span-3">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
                  u.role === "super_admin"
                    ? "bg-[#E50914]/10 border-[#E50914]/30 text-[#E50914]"
                    : u.role === "host"
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}>
                  {u.role === "super_admin" ? <Crown className="w-3 h-3" /> : u.role === "host" ? <Video className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                  {u.role.replace("_", " ")}
                </span>
              </div>
              <div className="col-span-3 flex justify-end">
                {u.role === "super_admin" ? (
                  <span className="text-xs text-white/40">— always —</span>
                ) : (
                  <Switch
                    checked={!!u.can_host}
                    onCheckedChange={(next) => toggleHost(u, next)}
                    data-testid={`toggle-host-${u.user_id}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
