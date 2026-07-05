import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * ProtectedRoute
 * - adminOnly: only allow super_admin
 * - registerFirst: when unauthenticated, redirect to /register?next=<pathname> instead of /login
 *   (used for invite links so anonymous visitors must create an account before joining a watch room)
 */
export default function ProtectedRoute({ children, adminOnly = false, registerFirst = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505] text-white/60" data-testid="auth-loading">
        <div className="animate-pulse text-sm tracking-widest uppercase">Loading…</div>
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    const target = registerFirst ? `/register?next=${next}` : `/login?next=${next}`;
    return <Navigate to={target} replace />;
  }
  if (adminOnly && user.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return children;
}
