import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './typeDefs.js';
import { typeResolvers } from './resolvers/types.js';
import { Query } from './resolvers/query.js';
import { Mutation } from './resolvers/mutation.js';
import { Subscription } from './resolvers/subscription.js';
import { authDirectiveTransformer } from './authDirective.js';

export function buildSchema() {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: { ...typeResolvers, Query, Mutation, Subscription },
  });
  return authDirectiveTransformer(schema);
}
