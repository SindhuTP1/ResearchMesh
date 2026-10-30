import { GraphQLScalarType, Kind } from 'graphql';
import { loadMany } from '../loaders.js';
import { JoinRequest, Project } from '../../models/index.js';
import { hasRole } from '../../auth.js';

const id = (doc) => String(doc._id ?? doc.id);
const thisYear = () => new Date().getFullYear();

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',
  serialize: (v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()),
  parseValue: (v) => new Date(v),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

/**
 * Field resolvers for object types. Every relation goes through a DataLoader (ctx.loaders),
 * so nested queries like faculty → lab → members → projects stay at ~1 DB query per type.
 */
export const typeResolvers = {
  DateTime,

  Department: {
    id,
    labs: (d, _, { loaders }) => loaders.labsByDepartment.load(d._id),
    facultyCount: (d, _, { loaders }) => loaders.facultyByDepartment.load(d._id),
  },

  User: {
    id,
    department: (u, _, { loaders }) => (u.department ? loaders.department.load(u.department) : null),
    lab: (u, _, { loaders }) => (u.lab ? loaders.lab.load(u.lab) : null),
    skills: (u) => u.skills ?? [],
    interests: (u) => u.interests ?? [],
    lookingFor: (u) => u.lookingFor ?? [],
    connections: (u, { limit }, { loaders }) => loadMany(loaders.user, (u.connections ?? []).slice(0, limit)),
    connectionCount: (u) => (u.connections ?? []).length,
    projects: (u, _, { loaders }) => loaders.projectsByMember.load(u._id),
    publications: async (u, { sinceYear, limit }, { loaders }) => {
      let pubs = await loaders.publicationsByAuthor.load(u._id);
      if (sinceYear) pubs = pubs.filter((p) => p.year >= sinceYear);
      return limit ? pubs.slice(0, limit) : pubs;
    },
    publicationCount: async (u, _, { loaders }) => (await loaders.publicationsByAuthor.load(u._id)).length,
    recentPublicationCount: async (u, _, { loaders }) =>
      (await loaders.publicationsByAuthor.load(u._id)).filter((p) => p.year >= thisYear() - 2).length,
    isActiveResearcher: async (u, _, { loaders }) =>
      (await loaders.publicationsByAuthor.load(u._id)).some((p) => p.year >= thisYear() - 2),
  },

  Lab: {
    id,
    department: (l, _, { loaders }) => loaders.department.load(l.department),
    head: (l, _, { loaders }) => loaders.user.load(l.head),
    members: (l, _, { loaders }) => loadMany(loaders.user, l.members),
    memberCount: (l) => (l.members ?? []).length,
    projects: (l, _, { loaders }) => loaders.projectsByLab.load(l._id),
    grants: (l, _, { loaders }) => loaders.grantsByLab.load(l._id),
    totalActiveFunding: async (l, _, { loaders }) => {
      const now = new Date();
      const grants = await loaders.grantsByLab.load(l._id);
      return grants.filter((g) => g.startDate <= now && g.endDate >= now).reduce((s, g) => s + g.amount, 0);
    },
    pendingRequests: async (l, _, { user }) => {
      // Only the lab head (or an admin) sees the request queue.
      if (String(l.head) !== user.id && !hasRole(user, 'ADMIN')) return [];
      const projectIds = (await Project.find({ lab: l._id }).select('_id').lean().exec()).map((p) => p._id);
      return JoinRequest.find({
        status: 'PENDING',
        $or: [{ lab: l._id }, { project: { $in: projectIds } }],
      })
        .sort({ createdAt: -1 })
        .lean().exec();
    },
  },

  Project: {
    id,
    owner: (p, _, { loaders }) => loaders.user.load(p.owner),
    lab: (p, _, { loaders }) => (p.lab ? loaders.lab.load(p.lab) : null),
    members: (p, _, { loaders }) => loadMany(loaders.user, p.members),
    seatsLeft: (p) => Math.max(0, (p.maxMembers ?? 0) - (p.members ?? []).length),
    myRequestStatus: (p, _, { loaders, user }) => (user ? loaders.myRequestByProject.load(p._id) : null),
  },

  Publication: {
    id,
    authors: (p, _, { loaders }) => loadMany(loaders.user, p.authors),
  },

  Grant: {
    id,
    isActive: (g) => {
      const now = new Date();
      return g.startDate <= now && g.endDate >= now;
    },
    lab: (g, _, { loaders }) => loaders.lab.load(g.lab),
    principalInvestigator: (g, _, { loaders }) => loaders.user.load(g.principalInvestigator),
  },

  JoinRequest: {
    id,
    requester: (r, _, { loaders }) => loaders.user.load(r.requester),
    recipient: (r, _, { loaders }) => loaders.user.load(r.recipient),
    project: (r, _, { loaders }) => (r.project ? loaders.project.load(r.project) : null),
    lab: (r, _, { loaders }) => (r.lab ? loaders.lab.load(r.lab) : null),
  },

  Notification: {
    id,
    actor: (n, _, { loaders }) => (n.actor ? loaders.user.load(n.actor) : null),
    project: (n, _, { loaders }) => (n.project ? loaders.project.load(n.project) : null),
    lab: (n, _, { loaders }) => (n.lab ? loaders.lab.load(n.lab) : null),
    joinRequest: (n, _, { loaders }) => (n.joinRequest ? loaders.joinRequest.load(n.joinRequest) : null),
  },
};
