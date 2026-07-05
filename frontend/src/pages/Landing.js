import React from "react";
import { Link } from "react-router-dom";
import { Film, Users, MessageCircle, Wand2, ShieldCheck, Share2 } from "lucide-react";
import { Button } from "../components/ui/button";
import Navbar from "../components/Navbar";

const HERO_BG = "https://images.pexels.com/photos/18501410/pexels-photo-18501410.jpeg";

const steps = [
  { icon: ShieldCheck, title: "Get invited", desc: "The super admin grants you host access. Viewers can join any public room instantly." },
  { icon: Film, title: "Pick a movie", desc: "Host clicks 'Start Streaming' and selects a video file from their computer." },
  { icon: Share2, title: "Share the link", desc: "Copy the room link and send it to friends. One click and they're in." },
  { icon: MessageCircle, title: "Watch & chat", desc: "Everyone watches in sync. Chat in the sidebar. Reactions, jokes, popcorn — bring it all." },
];

const features = [
  { icon: Users, title: "HD watch parties", desc: "Peer-to-peer WebRTC streams straight from the host — no re-encoding, no re-uploads." },
  { icon: MessageCircle, title: "Live chat", desc: "Threaded, timestamped messages that slide in beside the screen." },
  { icon: Wand2, title: "Full playback control", desc: "Quality, speed, volume, PiP, fullscreen — the host drives the whole theater." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_BG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-[#050505]" />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 pt-28 pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/70 mb-6" data-testid="hero-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
              Movie night, together
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tighter font-medium leading-[0.95]">
              Watch <span className="text-[#E50914]">anything</span>,
              <br /> with <span className="italic text-white/80">anyone</span>.
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl leading-relaxed">
              StreamStar turns any movie on your machine into a private theater on the web. Stream in HD, chat live, control the room — no uploads, no accounts your friends have to hate.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/register" data-testid="hero-cta-signup">
                <Button className="bg-[#E50914] hover:bg-[#F40612] text-white px-7 py-6 text-base rounded-md">
                  Create your theater
                </Button>
              </Link>
              <Link to="/login" data-testid="hero-cta-signin">
                <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 px-7 py-6 text-base rounded-md">
                  I have an invite
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
            <div className="text-xs uppercase tracking-[0.2em] text-[#E50914] mb-3">First time here?</div>
            <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Here&apos;s how it works</h2>
          </div>
          <p className="text-white/60 max-w-md text-sm">Four steps from empty screen to synchronized movie night. Anyone can watch. Only approved hosts can stream.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <div key={s.title} className="group rounded-xl border border-white/10 bg-[#0E0E0E] p-6 hover:border-white/20 transition-colors" data-testid={`howto-step-${i}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-md bg-[#E50914]/10 border border-[#E50914]/30 flex items-center justify-center text-[#E50914]">
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

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 border-t border-white/10">
        <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-12 max-w-xl">Everything you need for the perfect watch party.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-[#0E0E0E] p-8 h-full">
              <f.icon className="w-6 h-6 text-[#E50914] mb-6" />
              <h3 className="font-display text-xl mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 text-center text-xs text-white/40 uppercase tracking-[0.2em]">
        StreamStar · Built for cinephiles
      </footer>
    </div>
  );
}
