import React from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import { Film, Users, MessageCircle, Wand2, ShieldCheck, Share2 } from "lucide-react";
import { Button } from "../components/ui/button";
import Navbar from "../components/Navbar";
import CursorGlow from "../components/CursorGlow";
import FloatingOrbs from "../components/FloatingOrbs";
import BackgroundLogo from "../components/BackgroundLogo";
import ShareSite from "../components/ShareSite";

const HERO_BG = "https://images.pexels.com/photos/18501410/pexels-photo-18501410.jpeg";

const steps = [
  { icon: ShieldCheck, title: "Claim your director's chair", desc: "Design your own private theater — set the vibe, invite your crew, and call the shots. Guests slip in with a single click, no accounts, no friction." },
  { icon: Film, title: "Pick a movie", desc: "Host clicks 'Start Streaming' and selects a video file from their computer." },
  { icon: Share2, title: "Share the link", desc: "Copy the room link and send it to friends. One click and they're in." },
  { icon: MessageCircle, title: "Watch & chat", desc: "Everyone watches in sync. Chat in the sidebar. Reactions, jokes, popcorn — bring it all." },
];

const features = [
  { icon: Users, title: "HD watch parties", desc: "Peer-to-peer WebRTC streams straight from the host — no re-encoding, no re-uploads." },
  { icon: MessageCircle, title: "Live chat & reactions", desc: "Threaded messages, floating emoji reactions, and host controls (kick / mute) — the crowd, curated." },
  { icon: Wand2, title: "Record in HD, keep forever", desc: "One click and the host saves the entire session in crisp HD to their own machine as a .webm file. Viewers can request to record too — with host approval." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden" data-testid="landing-root">
      <CursorGlow />
      {/* Enlarged, ghosted brand mark behind the entire page */}
      <BackgroundLogo variant="full" />
      <ShareSite />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_BG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/75 to-[#050505]" />
        <FloatingOrbs className="opacity-90" />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 pt-28 pb-32 z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/70 mb-6" data-testid="hero-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
              Movie night, together
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tighter font-medium leading-[0.95]">
              Watch <span className="text-[#A855F7]">anything</span>,
              <br /> with <span className="italic text-white/80">anyone</span>.
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl leading-relaxed">
              StreamStar turns any movie on your machine into a private theater on the web. Stream a local file or share your screen, chat live, and <span className="text-white font-medium">record the whole session</span> to keep forever — nothing uploads, ever.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/register" data-testid="hero-cta-signup">
                <Button className="ss-shimmer bg-[#A855F7] hover:bg-[#C026D3] text-white px-7 py-6 text-base rounded-md">
                  Create your theater
                </Button>
              </Link>
              <Link to="/join" data-testid="hero-cta-join">
                <Button variant="outline" className="ss-btn-glow border-white/20 bg-white/5 text-white hover:bg-white/10 px-7 py-6 text-base rounded-md">
                  Join with code
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How to use */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24" data-testid="how-to-section">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#A855F7] mb-3">First time here?</div>
            <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Here&apos;s how it works</h2>
          </div>
          <p className="text-white/60 max-w-md text-sm">Four steps from empty screen to synchronized movie night. Anyone can watch. Only approved hosts can stream.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <div key={s.title} className="group rounded-xl border border-white/10 bg-[#0E0E0E] p-6 hover:border-white/20 transition-colors" data-testid={`howto-step-${i}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-md bg-[#A855F7]/10 border border-[#A855F7]/30 flex items-center justify-center text-[#A855F7]">
                  <s.icon className="w-5 h-5" />
                </div>
                <span className="font-display text-3xl text-white/10 group-hover:text-white/20 transition-colors">0{i + 1}</span>
              </div>
              <h3 className="font-display text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Posters marquee */}
      <section className="border-t border-white/10 overflow-hidden">
        <div className="py-6 flex gap-4 animate-[cs-marquee_40s_linear_infinite]" style={{ width: "max-content" }}>
          {[
            "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400",
            "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400",
            "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400",
            "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400",
            "https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?w=400",
            "https://images.unsplash.com/photo-1524712245354-2c4e5e7121c0?w=400",
          ].concat([
            "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400",
            "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400",
            "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400",
          ]).map((src, i) => (
            <div key={i} className="w-52 h-72 rounded-xl overflow-hidden border border-white/10 shrink-0 hover:scale-105 transition-transform duration-500 shadow-lg shadow-[#A855F7]/10">
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
        <style>{`@keyframes cs-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 border-t border-white/10">
        <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-12 max-w-xl">Everything you need for the perfect watch party.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-[#0E0E0E] p-8 h-full">
              <f.icon className="w-6 h-6 text-[#A855F7] mb-6" />
              <h3 className="font-display text-xl mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 text-center text-xs text-white/40 uppercase tracking-[0.2em] relative z-10">
        StreamStar © · Built for cinephiles
      </footer>
    </div>
  );
}
