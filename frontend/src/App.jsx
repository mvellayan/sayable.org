import React from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "./auth";
import SignIn from "./components/SignIn";
import Home from "./components/Home";
import InviteAccept from "./components/InviteAccept";
import Admin from "./components/Admin";
import Instructions from "./components/Instructions";

export default function App() {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth">
        <h1 className="auth__brand">Sayable</h1>
        <div className="auth__status">…</div>
      </div>
    );
  }

  const authed = token && user;

  // The invite URL persists across sign-in: a logged-out user who taps an invite
  // link sees SignIn, then lands back on /invite/:id (InviteAccept) once authed.
  return (
    <Routes>
      {/* public — shareable how-to, no login required */}
      <Route path="/help" element={<Instructions />} />
      <Route path="/instructions" element={<Instructions />} />
      <Route path="/invite/:inviteId" element={authed ? <InviteAccept /> : <SignIn />} />
      <Route
        path="/admin"
        element={authed && user.role === "admin" ? <Admin /> : authed ? <Home /> : <SignIn />}
      />
      <Route path="*" element={authed ? <Home /> : <SignIn />} />
    </Routes>
  );
}
