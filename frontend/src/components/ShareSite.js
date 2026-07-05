import React, { useEffect, useRef, useState } from "react";
import { Share2, Copy, Check, MessageCircle, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

/**
 * Floating "Share this site" widget for the marketing page.
 * Sits in the top-left corner; on click it opens a small popover
 * with copy-link + WhatsApp options.
 */
export default function ShareSite({ shareUrl }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef(null);
  const url = shareUrl || (typeof window !== "undefined" ? window.location.origin : "https://streamstar.app");
  const text = `Movie night on StreamStar — watch anything with anyone in HD. ${url}`;

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — long-press the field to select it");
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "StreamStar", text: "Watch anything with anyone.", url });
        setOpen(false);
      } catch { /* user canceled */ }
    } else {
      copy();
    }
  };

  return (
    <div className="fixed top-24 left-4 md:left-8 z-40" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Share StreamStar"
        data-testid="share-site-btn"
        className="group ss-fab relative w-12 h-12 rounded-full border border-white/15 bg-black/40 backdrop-blur-md hover:border-[#A855F7]/50 hover:bg-black/60 transition-all shadow-lg shadow-black/40 flex items-center justify-center"
      >
        <Share2 className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" />
        <span className="absolute inset-0 rounded-full ss-fab-ring" />
      </button>

      {open && (
        <div
          className="absolute top-14 left-0 w-72 rounded-xl border border-white/10 bg-[#0E0E0E]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          data-testid="share-site-popover"
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#A855F7]" />
            <div className="font-display text-sm">Share © StreamStar</div>
          </div>
          <div className="p-3 space-y-2">
            <button
              onClick={copy}
              className="w-full flex items-center gap-3 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-left transition-colors"
              data-testid="share-site-copy"
            >
              <div className="w-8 h-8 rounded-md bg-[#A855F7]/15 border border-[#A855F7]/30 flex items-center justify-center">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <LinkIcon className="w-4 h-4 text-[#A855F7]" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white/90">{copied ? "Copied!" : "Copy link"}</div>
                <div className="text-[10px] text-white/40 truncate font-mono">{url}</div>
              </div>
              <Copy className="w-3.5 h-3.5 text-white/40" />
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-3 rounded-md border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 px-3 py-2 text-left transition-colors"
              data-testid="share-site-whatsapp"
            >
              <div className="w-8 h-8 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white/90">Share on WhatsApp</div>
                <div className="text-[10px] text-white/40">Opens WhatsApp with a friendly pitch</div>
              </div>
            </a>

            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={nativeShare}
                className="w-full flex items-center gap-3 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-left transition-colors"
                data-testid="share-site-native"
              >
                <div className="w-8 h-8 rounded-md bg-[#EC4899]/15 border border-[#EC4899]/30 flex items-center justify-center">
                  <Share2 className="w-4 h-4 text-[#EC4899]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white/90">More apps</div>
                  <div className="text-[10px] text-white/40">Uses your device share sheet</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
