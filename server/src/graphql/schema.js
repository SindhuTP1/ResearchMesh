import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './typeDefs.js';
import { typeResolvers } from './resolvers/types.js';
import { Query } from './resolvers/query.js';
import { Mutation } from './resolvers/mutation.js';
import { Subscription } from './resolvers/subscription.js';
import { authDirectiveTransformer } from './authDirective.js';
import { social, userSocialFields } from './resolvers/social.js';

export function buildSchema() {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      ...typeResolvers,
      ...social.types,
      User: { ...typeResolvers.User, ...userSocialFields },
      Query: { ...Query, ...social.Query },
      Mutation: { ...Mutation, ...social.Mutation },
      Subscription: { ...Subscription, ...social.Subscription },
    },
  });
  return authDirectiveTransformer(schema);
}
