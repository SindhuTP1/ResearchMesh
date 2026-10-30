import { ApolloClient, InMemoryCache, HttpLink, ApolloLink, split } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { ErrorLink } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const HTTP_URL = import.meta.env.VITE_GRAPHQL_URL || '/graphql';
const WS_URL =
  import.meta.env.VITE_GRAPHQL_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/graphql`;

/**
 * One ApolloClient per auth token. When the user logs in/out, AuthProvider builds a new client so the
 * WebSocket reconnects with the new token in connectionParams and no cached data leaks across users.
 */
export function createApolloClient(token, { onUnauthenticated } = {}) {
  const httpLink = new HttpLink({ uri: HTTP_URL });

  const authLink = new SetContextLink((prev) => ({
    headers: { ...prev.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }));

  const errorLink = new ErrorLink(({ error }) => {
    if (CombinedGraphQLErrors.is(error) && error.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED') && token) {
      onUnauthenticated?.();
    }
  });

  // graphql-ws client: lazy (connects on first subscription), auto-retries with backoff.
  const wsClient = createClient({
    url: WS_URL,
    lazy: true,
    retryAttempts: Infinity,
    shouldRetry: () => true,
    connectionParams: () => (token ? { authorization: `Bearer ${token}` } : {}),
  });
  const wsLink = new GraphQLWsLink(wsClient);

  // Subscriptions go over WebSocket, everything else over HTTP.
  const link = split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return def.kind === 'OperationDefinition' && def.operation === 'subscription';
    },
    wsLink,
    ApolloLink.from([errorLink, authLink, httpLink])
  );

  const cache = new InMemoryCache({
    typePolicies: {
      // Match/score wrappers have no id — embed them in their parent instead of normalizing.
      FacultyMatch: { keyFields: false },
      StudentMatch: { keyFields: false },
      MatchBreakdown: { keyFields: false },
      UserSearchResult: { keyFields: false },
      Skill: { keyFields: false },
      Query: {
        fields: {
          // Search results are keyed by their input so different filters don't overwrite each other.
          searchFaculty: { keyArgs: ['input', ['area', 'skills', 'publishedWithinYears', 'hasOpenSlots', 'departmentId', 'offset', 'limit']] },
          searchStudents: { keyArgs: ['input', ['skills', 'unattached', 'interests', 'departmentId', 'program', 'minSkillLevel', 'offset', 'limit']] },
          notifications: { keyArgs: ['unreadOnly'] },
        },
      },
    },
  });

  const client = new ApolloClient({ link, cache });
  client.__wsClient = wsClient;
  return client;
}

export function disposeApolloClient(client) {
  try {
    client?.__wsClient?.dispose();
    client?.stop();
  } catch {
    /* ignore */
  }
}
