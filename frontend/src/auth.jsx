import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, configureApi } from "./api";

const AuthContext = createContext(null);

const TOKEN_KEY = "bettervibe.token";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  // Refs hold the current token and unauth handler. The API client's getToken
  // and onAuthFailure read these refs every call rather than capturing token
  // in a closure. This avoids a sign-in race:
  //
  // On signin, AuthProvider state updates → ChatPage mounts → ChatPage's
  // useEffect fires (api.characters(), api.messages()) BEFORE AuthProvider's
  // useEffect that would have updated the API client's getToken closure.
  // Effects run bottom-up. Without the ref, ChatPage's first request goes
  // out with the OLD token (null on first login) → 401 → onUnauthorized
  // clears localStorage → bounce back to SignIn → login loop.
  const tokenRef = useRef(token);
  tokenRef.current = token; // sync during render; safe for refs

  const onAuthFailureRef = useRef(null);
  onAuthFailureRef.current = () => {
    setToken(null);
    setMember(null);
    localStorage.removeItem(TOKEN_KEY);
  };

  // Configure the API client ONCE on mount. The closures read the refs, so
  // they always see the latest token and the latest onAuthFailure.
  useEffect(() => {
    configureApi({
      getToken: () => tokenRef.current,
      onAuthFailure: () => onAuthFailureRef.current && onAuthFailureRef.current(),
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setMember(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (!cancelled) setMember(r.member);
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function signin(newToken, m) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setMember(m);
  }

  function signout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMember(null);
  }

  return (
    <AuthContext.Provider value={{ token, member, loading, signin, signout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
