import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, configureApi } from "./api";

const AuthContext = createContext(null);

const TOKEN_KEY = "bettervibe.token";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Refs hold the current token + unauth handler so the API client reads the
  // latest value every call (avoids a sign-in race where the first request
  // after login goes out with the stale null token → 401 → login loop).
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const onAuthFailureRef = useRef(null);
  onAuthFailureRef.current = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
  };

  useEffect(() => {
    configureApi({
      getToken: () => tokenRef.current,
      onAuthFailure: () => onAuthFailureRef.current && onAuthFailureRef.current(),
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (!cancelled) setUser(r.user);
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

  function signin(newToken, u) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(u);
  }

  function signout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, signin, signout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
