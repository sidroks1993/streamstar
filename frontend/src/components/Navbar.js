import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
        <Link to="/" className="ss-nav-logo flex items-center gap-3 group" data-testid="nav-logo">
          <span className="ss-nav-logo-mark">
            <Logo size={40} className="group-hover:rotate-12 transition-transform duration-300" />
          </span>
          <span className="ss-nav-wordmark font-display text-2xl md:text-[26px] tracking-tight leading-none">
            <span className="text-[#22D3EE] mr-0.5 align-super text-[13px] md:text-[15px]">©</span>
            <span>Stream<span className="ss-gradient-text">Star</span></span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {user?.role === "super_admin" && (
            <Link to="/admin" data-testid="nav-admin">
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/5">
                <ShieldCheck className="w-4 h-4 mr-2" /> Admin
              </Button>
            </Link>
          )}
          {user ? (
            <>
              <NotificationBell />
              <Link to="/dashboard" className="hidden sm:flex items-center gap-2 mr-2 hover:opacity-80" data-testid="nav-user">
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs">
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <span className="text-sm text-white/80">{user.name}</span>
              </Link>
              <Button variant="ghost" onClick={onLogout} data-testid="logout-btn" className="text-white/70 hover:text-white hover:bg-white/5">
                <LogOut className="w-4 h-4 mr-2" /> Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login">
                <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/5">Sign in</Button>
              </Link>
              <Link to="/register" data-testid="nav-register">
                <Button className="bg-[#A855F7] hover:bg-[#C026D3] text-white">Get started</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
