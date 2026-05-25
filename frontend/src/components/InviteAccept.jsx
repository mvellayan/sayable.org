import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";

// Reached at /invite/:inviteId once the user is signed in. One step to join.
export default function InviteAccept() {
  const { inviteId } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState("accepting"); // accepting | done | error
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .acceptInvite(inviteId)
      .then(() => { if (!cancelled) setState("done"); })
      .catch((e) => { if (!cancelled) { setErr(e.message); setState("error"); } });
    return () => { cancelled = true; };
  }, [inviteId]);

  return (
    <div className="auth">
      <h1 className="auth__brand">BetterVibe</h1>
      {state === "accepting" && <div className="auth__status">Connecting you…</div>}
      {state === "done" && (
        <>
          <p className="auth__tagline">You're connected.</p>
          <button className="auth__button" onClick={() => nav("/")}>Open BetterVibe</button>
        </>
      )}
      {state === "error" && (
        <>
          <div className="auth__error">{err}</div>
          <button className="auth__button auth__button--ghost" onClick={() => nav("/")}>
            Go home
          </button>
        </>
      )}
    </div>
  );
}
