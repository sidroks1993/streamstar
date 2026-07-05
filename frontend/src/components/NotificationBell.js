import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ShieldCheck, LogIn, XCircle, Video, Radio, UserPlus, DoorOpen } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const ICON_BY_TYPE = {
  host_granted: ShieldCheck,
  host_revoked: XCircle,
  host_auto_approved: ShieldCheck,
  host_request: UserPlus,
  join_knock: DoorOpen,
  join_approved: LogIn,
  join_denied: XCircle,
  stream_started: Video,
  stream_ended: Radio,
};

function timeAgo(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Math.max(0, Date.now() - d.getTime());
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const dd = Math.floor(h / 24);
    return `${dd}d ago`;
  } catch {
    return "";
  }
}

export default function NotificationBell() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/notifications/me");
      setItems(data);
      // If a host_granted notification arrives, refresh /auth/me so the UI updates instantly
      const gotHost = data.some((n) => n.type === "host_granted" && !n.read);
      if (gotHost && !user.can_host && user.role !== "super_admin") {
        refresh?.();
      }
    } catch {
      /* ignore */
    }
  }, [user, refresh]);

  useEffect(() => {
    load();
    if (!user) return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [user, load]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    try {
      await api.post("/notifications/me/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  };

  const onItemClick = async (n) => {
    if (!n.read) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch {
        /* ignore */
      }
    }
    const roomId = n.meta?.room_id;
    if (roomId && (n.type === "join_knock" || n.type === "join_approved")) {
      navigate(`/watch/${roomId}`);
      setOpen(false);
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-white/5 text-white/70 hover:text-white transition-colors"
        data-testid="notif-bell"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#A855F7] text-[10px] font-semibold text-white flex items-center justify-center animate-pulse"
            data-testid="notif-badge"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[360px] max-h-[480px] rounded-xl border border-white/10 bg-[#0E0E0E] shadow-2xl shadow-black/50 backdrop-blur-xl z-50 overflow-hidden flex flex-col"
          data-testid="notif-dropdown"
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#A855F7]" />
              <div className="font-display text-sm">Notifications</div>
              {unread > 0 && (
                <span className="text-[10px] text-[#A855F7] uppercase tracking-widest">{unread} new</span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] uppercase tracking-widest text-white/50 hover:text-white"
                data-testid="notif-mark-all-read"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-sm">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Nothing yet. Activity from your rooms will show up here.
              </div>
            ) : (
              items.map((n) => {
                const Icon = ICON_BY_TYPE[n.type] || Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => onItemClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 flex items-start gap-3 hover:bg-white/[0.03] transition-colors ${
                      !n.read ? "bg-[#A855F7]/[0.06]" : ""
                    }`}
                    data-testid={`notif-item-${n.id}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                        !n.read
                          ? "bg-[#A855F7]/15 text-[#A855F7]"
                          : "bg-white/5 text-white/50"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/90 leading-snug">{n.message}</div>
                      <div className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">
                        {timeAgo(n.created_at)} · {n.type.replace(/_/g, " ")}
                      </div>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-[#A855F7] mt-2 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
