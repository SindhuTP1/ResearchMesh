import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { createApolloClient, disposeApolloClient } from '../apollo/client.js';
import { ME } from '../graphql/operations.js';

const TOKEN_KEY = 'researchmesh.token';
const AuthCtx = createContext(null);

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session-only login */
  }
};

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

  const login = useCallback((t) => {
    writeToken(t);
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
  const { data, loading } = useQuery(ME, { skip: !token });
  const user = token ? data?.me ?? null : null;
  const value = useMemo(
    () => ({
      token,
      user,
      loading: !!token && loading,
      login,
      logout,
      isFaculty: user?.role === 'FACULTY' || user?.role === 'ADMIN',
      isAdmin: user?.role === 'ADMIN',
    }),
    [token, user, loading, login, logout]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
