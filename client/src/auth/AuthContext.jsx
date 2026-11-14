import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { createApolloClient, disposeApolloClient } from '../apollo/client.js';
import { ME } from '../graphql/operations.js';

const TOKEN_KEY = 'researchmesh.token';
const REMEMBER_KEY = 'researchmesh.remembered'; // token kept across browser restarts ("Remember me")
const LAST_LOGIN_KEY = 'researchmesh.lastLogin'; // { email, role } to pre-fill the login form
const AuthCtx = createContext(null);

// By default the login lives in sessionStorage: it survives a refresh, and each tab can hold a
// different account (handy for testing a student and a faculty side by side). With "Remember me"
// the token is also kept in localStorage, so this browser stays signed in after it is closed.
// Passwords are never stored by the app — the browser's own password manager saves those.
const readToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY); // drop logins remembered by older versions
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t, remember = false) => {
  try {
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
      if (remember) localStorage.setItem(REMEMBER_KEY, t);
      else localStorage.removeItem(REMEMBER_KEY);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    /* storage unavailable — session-only login */
  }
};

/** Email + portal of the last "remembered" login on this browser, for pre-filling the form. */
export const lastLogin = () => {
  try { return JSON.parse(localStorage.getItem(LAST_LOGIN_KEY) || 'null'); } catch { return null; }
};
export const rememberLogin = (info) => {
  try {
    if (info) localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify(info));
    else localStorage.removeItem(LAST_LOGIN_KEY);
  } catch { /* ignore */ }
};

/**
 * Ask the browser to save the email + password in its password manager (Chrome / Edge show
 * "Save password?"). Other browsers offer to save on their own when the form is submitted.
 */
export async function saveCredentialInBrowser(email, password, name) {
  try {
    if (window.PasswordCredential && navigator.credentials?.store) {
      await navigator.credentials.store(new window.PasswordCredential({ id: email, password, name: name || email }));
    }
  } catch { /* user dismissed or not supported */ }
}

/**
 * Owns the JWT and the ApolloClient. A new client is built whenever the token changes, so the
 * subscription socket re-authenticates and the cache never shows one user's data to another.
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);

  const client = useMemo(() => createApolloClient(token, { onUnauthenticated: logout }), [token, logout]);

  // Dispose the *previous* client when the token changes. (Not an effect cleanup: StrictMode runs
  // cleanups on a simulated unmount, which would kill the live client's WebSocket.)
  const prevClient = useRef(null);
  useEffect(() => {
    if (prevClient.current && prevClient.current !== client) disposeApolloClient(prevClient.current);
    prevClient.current = client;
  }, [client]);

  const login = useCallback((t, { remember = false } = {}) => {
    writeToken(t, remember);
    setToken(t);
  }, []);

  return (
    <ApolloProvider client={client}>
      <CurrentUser token={token} login={login} logout={logout}>
        {children}
      </CurrentUser>
    </ApolloProvider>
  );
}

function CurrentUser({ token, login, logout, children }) {
  const { data, loading, error } = useQuery(ME, { skip: !token });
  const user = token ? data?.me ?? null : null;

  // A saved token can outlive its user (e.g. the in-memory dev DB is re-seeded on every restart,
  // so old user ids no longer exist). If `me` comes back empty, drop the token and show login
  // instead of waiting on "Loading…" forever.
  const staleToken = !!token && !loading && (!!error || (data !== undefined && data.me == null));
  useEffect(() => {
    if (staleToken) logout();
  }, [staleToken, logout]);
  const value = useMemo(
    () => ({
      token,
      user,
      loading: !!token && loading,
      login,
      logout,
      role: user?.role ?? null,
      isStudent: user?.role === 'STUDENT',
      isFaculty: user?.role === 'FACULTY',
      isAdmin: user?.role === 'ADMIN',
    }),
    [token, user, loading, login, logout]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
