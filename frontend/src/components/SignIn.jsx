import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

// Open signup + email-OTP. Unknown email → name form → signup (creates the
// account and sends a code) → code → in. No admin approval.
export default function SignIn() {
  const { signin } = useAuth();
  const [stage, setStage] = useState("email"); // email | signup | code
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmail(e) {
    e.preventDefault();
    setError(""); setStatus(""); setBusy(true);
    try {
      const r = await api.requestOtp(email.trim().toLowerCase());
      if (r.status === "code-sent") {
        setStage("code");
        setStatus("A sign-in code is on its way.");
      } else if (r.status === "signup-required") {
        setStage("signup");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await api.signup({
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
      });
      if (r.status === "code-sent") {
        setStage("code");
        setStatus("A sign-in code is on its way.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await api.verifyOtp(email.trim().toLowerCase(), code.trim());
      signin(r.token, r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1 className="auth__brand">BetterVibe</h1>
      <p className="auth__tagline">Say the hard thing so it can actually be heard.</p>

      {stage === "email" && (
        <form onSubmit={submitEmail}>
          <input
            className="auth__field" type="email" placeholder="your email"
            value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
          />
          <button className="auth__button" disabled={busy}>Continue</button>
        </form>
      )}

      {stage === "signup" && (
        <form onSubmit={submitSignup}>
          <div className="auth__status">First time here. What should we call you?</div>
          <input
            className="auth__field" placeholder="first name"
            value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus required
          />
          <button className="auth__button" disabled={busy}>Create account</button>
        </form>
      )}

      {stage === "code" && (
        <form onSubmit={submitCode}>
          <div className="auth__status">{status}</div>
          <input
            className="auth__field" inputMode="numeric" pattern="[0-9]*"
            placeholder="six-digit code" value={code}
            onChange={(e) => setCode(e.target.value)} autoFocus required
          />
          <button className="auth__button" disabled={busy}>Sign in</button>
          <button
            type="button" className="auth__button auth__button--ghost"
            onClick={() => { setStage("email"); setCode(""); }}
          >
            use a different email
          </button>
        </form>
      )}

      {error && <div className="auth__error">{error}</div>}
    </div>
  );
}
