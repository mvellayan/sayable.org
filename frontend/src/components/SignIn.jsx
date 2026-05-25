import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

// Two-step OTP sign-in. If the email isn't a recognized friend, falls
// through to a signup form that posts to /auth/signup (admin must approve).
export default function SignIn() {
  const { signin } = useAuth();
  const [stage, setStage] = useState("email"); // email | code | signup | pending
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmail(e) {
    e.preventDefault();
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const r = await api.requestOtp(email.trim().toLowerCase());
      if (r.status === "code-sent") {
        setStage("code");
        setStatus("A sign-in code is on its way.");
      } else if (r.status === "signup-required") {
        setStage("signup");
      } else if (r.status === "signup-pending") {
        setStage("pending");
      } else if (r.status === "denied") {
        setError("This email isn't on the list.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api.verifyOtp(email.trim().toLowerCase(), code.trim());
      signin(r.token, r.member);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.signup({
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setStage("pending");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1 className="auth__brand">BetterVibe</h1>
      <p className="auth__tagline">A room of characters who feel alive.</p>

      {stage === "email" && (
        <form onSubmit={submitEmail}>
          <input
            className="auth__field"
            type="email"
            placeholder="your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
          <button className="auth__button" disabled={busy}>
            Continue
          </button>
        </form>
      )}

      {stage === "code" && (
        <form onSubmit={submitCode}>
          <div className="auth__status">{status}</div>
          <input
            className="auth__field"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="six-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
          <button className="auth__button" disabled={busy}>
            Sign in
          </button>
          <button
            type="button"
            className="auth__button auth__button--ghost"
            onClick={() => {
              setStage("email");
              setCode("");
            }}
          >
            use a different email
          </button>
        </form>
      )}

      {stage === "signup" && (
        <form onSubmit={submitSignup}>
          <div className="auth__status">
            Not on the list yet. Tell me who you are; I'll let the host know.
          </div>
          <input
            className="auth__field"
            placeholder="first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoFocus
            required
          />
          <input
            className="auth__field"
            placeholder="last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <button className="auth__button" disabled={busy}>
            Request access
          </button>
        </form>
      )}

      {stage === "pending" && (
        <div className="auth__status">
          The host has been told. You'll be able to sign in once they say yes.
        </div>
      )}

      {error && <div className="auth__error">{error}</div>}
    </div>
  );
}
