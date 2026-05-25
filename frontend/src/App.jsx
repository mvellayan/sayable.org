import React from "react";
import { useAuth } from "./auth";
import SignIn from "./components/SignIn";
import ChatPage from "./components/ChatPage";

export default function App() {
  const { token, member, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth">
        <h1 className="auth__brand">BetterVibe</h1>
        <div className="auth__status">…</div>
      </div>
    );
  }

  if (!token || !member) {
    return <SignIn />;
  }

  return <ChatPage />;
}
