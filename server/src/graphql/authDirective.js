import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { defaultFieldResolver } from 'graphql';
import { hasRole, unauthenticated, forbidden } from '../auth.js';

/**
 * Schema transformer for `@auth(requires: Role)`.
 *
 * Wraps the resolver of every field (or every field on a type) carrying the directive, so access control
 * lives next to the schema definition instead of being scattered through resolver code.
 *
 * "Self" rule: if the parent object is the caller's own User document, the field is always allowed —
 * so a student can read their own `email` even though `User.email` requires FACULTY.
 */
export function authDirectiveTransformer(schema, directiveName = 'auth') {
  const typeLevel = new Map();

  return mapSchema(schema, {
    [MapperKind.OBJECT_TYPE]: (type) => {
      const d = getDirective(schema, type, directiveName)?.[0];
      if (d) typeLevel.set(type.name, d.requires);
      return undefined;
    },
    [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
      const d = getDirective(schema, fieldConfig, directiveName)?.[0];
      const requires = d?.requires ?? typeLevel.get(typeName);
      if (!requires) return fieldConfig;

      const { resolve = defaultFieldResolver, subscribe } = fieldConfig;
      const guard = (parent, ctx) => {
        if (!ctx.user) throw unauthenticated();
        const isSelf = typeName === 'User' && parent && String(parent._id ?? parent.id) === ctx.user.id;
        if (!isSelf && !hasRole(ctx.user, requires)) {
          throw forbidden(`Requires role ${requires}`);
        }
      };

      fieldConfig.resolve = (parent, args, ctx, info) => {
        guard(parent, ctx);
        return resolve(parent, args, ctx, info);
      };
      if (subscribe) {
        fieldConfig.subscribe = (parent, args, ctx, info) => {
          guard(parent, ctx);
          return subscribe(parent, args, ctx, info);
        };
      }
      return fieldConfig;
    },
  });
}
