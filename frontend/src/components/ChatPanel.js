import React, { useEffect, useRef, useState } from "react";
import { Send, MessageSquare } from "lucide-react";

export default function ChatPanel({ messages, myUserId, onSend, participants }) {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText("");
  };

  return (
    <aside className="w-full h-full flex flex-col bg-[#0A0A0A] border-l border-white/10" data-testid="chat-panel">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#E50914]" />
          <span className="font-display text-sm uppercase tracking-[0.2em]">Chat</span>
        </div>
        <span className="text-xs text-white/40" data-testid="participant-count">{participants.length} watching</span>
      </div>

      {/* Participants strip */}
      <div className="px-5 py-3 border-b border-white/10 flex gap-2 flex-wrap">
        {participants.map((p) => (
          <span key={p.user_id} className={`text-xs px-2 py-1 rounded-full border ${p.is_host ? "border-[#E50914]/40 bg-[#E50914]/10 text-[#E50914]" : "border-white/10 bg-white/5 text-white/70"}`}>
            {p.is_host ? "★ " : ""}{p.name}{p.user_id === myUserId ? " (you)" : ""}
          </span>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="text-center text-white/30 text-sm mt-10">
            Say hi to your movie crew.
          </div>
        ) : (
          messages.map((m, i) => {
            const isSelf = m.from === myUserId;
            return (
              <div key={i} className={`flex flex-col mb-3 cs-rise ${isSelf ? "items-end" : "items-start"}`}>
                <div className="text-[11px] text-white/40 mb-1">{isSelf ? "You" : m.name}</div>
                <div className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${
                  isSelf
                    ? "bg-[#E50914]/20 border border-[#E50914]/30 rounded-tr-sm text-white"
                    : "bg-white/10 rounded-tl-sm text-white"
                }`}>
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="p-4 border-t border-white/10 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the room…"
          maxLength={1000}
          className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 placeholder:text-white/30"
          data-testid="chat-input"
        />
        <button type="submit" className="bg-[#E50914] hover:bg-[#F40612] text-white p-2 rounded-md transition-colors" data-testid="chat-send">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}
