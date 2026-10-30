import mongoose from 'mongoose';
import { User, Lab, Department, Project, JoinRequest, Notification } from '../../models/index.js';
import { requireUser, forbidden, badInput, hasRole } from '../../auth.js';
import { rankCandidates, rankStudentsForProject } from '../../services/matching.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw badInput(`Invalid id: ${id}`);
  return new mongoose.Types.ObjectId(String(id));
};
const clampLimit = (n, max = 100) => Math.min(Math.max(1, n ?? 20), max);

/**
 * searchFaculty — one MongoDB aggregation pipeline:
 *   $match faculty → $lookup recent publications → $lookup labs they head → filter → $facet (page + count)
 * So "NLP faculty who published in the last 2 years with an open slot" is a single DB round-trip.
 */
async function searchFaculty(_, { input }) {
  const { area, skills, publishedWithinYears, hasOpenSlots, departmentId } = input;
  const limit = clampLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);
  const year = new Date().getFullYear();
  const minYear = publishedWithinYears != null ? year - publishedWithinYears : year - 3;

  const match = { role: 'FACULTY' };
  if (departmentId) match.department = oid(departmentId);
  if (skills?.length) match['skills.name'] = { $all: skills.map((s) => s.toLowerCase().trim()) };

  const post = [];
  if (publishedWithinYears != null) post.push({ 'recentPubs.0': { $exists: true } });
  if (hasOpenSlots) post.push({ 'headedLabs.openSlots': { $gt: 0 } });
  if (area?.trim()) {
    const re = new RegExp(escapeRegex(area.trim()), 'i');
    post.push({
      $or: [{ interests: re }, { 'headedLabs.researchAreas': re }, { 'recentPubs.keywords': re }, { bio: re }],
    });
  }

  const [res] = await User.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'publications',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$uid', '$authors'] }, year: { $gte: minYear } } },
          { $project: { keywords: 1, year: 1 } },
        ],
        as: 'recentPubs',
      },
    },
    { $lookup: { from: 'labs', localField: '_id', foreignField: 'head', as: 'headedLabs' } },
    ...(post.length ? [{ $match: { $and: post } }] : []),
    {
      $facet: {
        items: [
          { $addFields: { _recent: { $size: '$recentPubs' } } },
          { $sort: { _recent: -1, lastActiveAt: -1, _id: 1 } },
          { $skip: offset },
          { $limit: limit },
          { $project: { recentPubs: 0, headedLabs: 0, _recent: 0, passwordHash: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  return { totalCount: res.total[0]?.n ?? 0, items: res.items };
}

/** searchStudents — faculty only (enforced by @auth). */
async function searchStudents(_, { input }) {
  const { skills, unattached, interests, departmentId, program, minSkillLevel } = input;
  const limit = clampLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);

  const filter = { role: 'STUDENT' };
  if (skills?.length) {
    const names = skills.map((s) => s.toLowerCase().trim());
    if (minSkillLevel) {
      // every requested skill must be present at >= minSkillLevel
      filter.skills = { $all: names.map((name) => ({ $elemMatch: { name, level: { $gte: minSkillLevel } } })) };
    } else {
      filter['skills.name'] = { $all: names };
    }
  }
  if (unattached) filter.lab = null;
  if (interests?.length) filter.interests = { $in: interests.map((s) => s.toLowerCase().trim()) };
  if (departmentId) filter.department = oid(departmentId);
  if (program) filter.program = new RegExp(`^${escapeRegex(program)}$`, 'i');

  const [totalCount, items] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ lastActiveAt: -1, _id: 1 }).skip(offset).limit(limit).lean().exec(),
  ]);
  return { totalCount, items };
}

async function recommendedMentors(_, { limit, weights }, ctx) {
  const me = requireUser(ctx);
  const faculty = await User.find({ role: 'FACULTY', _id: { $ne: me._id } }).limit(500).lean().exec();

  // Hydrate every candidate's lab + publications through DataLoaders: 2 batched queries total.
  const [labs, pubs] = await Promise.all([
    Promise.all(faculty.map((f) => (f.lab ? ctx.loaders.lab.load(f.lab) : null))),
    Promise.all(faculty.map((f) => ctx.loaders.publicationsByAuthor.load(f._id))),
  ]);

  const candidates = faculty.map((f, i) => ({
    id: f._id,
    skills: f.skills,
    interests: [...(f.interests || []), ...(labs[i]?.researchAreas || [])],
    publications: pubs[i],
    lab: labs[i] ? { openSlots: labs[i].openSlots, capacity: labs[i].capacity } : null,
  }));

  const ranked = rankCandidates(me, candidates, { limit: clampLimit(limit, 50), weights: weights ?? undefined });
  const byId = new Map(faculty.map((f) => [String(f._id), f]));
  return ranked.map((r) => ({ ...r, faculty: byId.get(r.id) }));
}

async function recommendedStudentsForProject(_, { projectId, limit }, ctx) {
  const me = requireUser(ctx);
  const project = await Project.findById(oid(projectId)).lean().exec();
  if (!project) throw badInput('Project not found');
  if (String(project.owner) !== me.id && !hasRole(me, 'ADMIN')) throw forbidden('Only the project owner can see recommendations');

  const students = await User.find({
    role: 'STUDENT',
    _id: { $nin: [...project.members, project.owner] },
  })
    .limit(500)
    .lean().exec();
  const ranked = rankStudentsForProject(
    project,
    students.map((s) => ({ id: s._id, skills: s.skills, interests: s.interests })),
    { limit: clampLimit(limit, 50) }
  );
  const byId = new Map(students.map((s) => [String(s._id), s]));
  return ranked.map((r) => ({ ...r, student: byId.get(r.id) }));
}

export const Query = {
  me: (_, __, { user }) => user,
  user: (_, { id }, { loaders }) => loaders.user.load(oid(id)),
  departments: () => Department.find().sort({ name: 1 }).lean().exec(),

  labs: (_, { area, hasOpenSlots }) => {
    const f = {};
    if (area) f.researchAreas = new RegExp(escapeRegex(area), 'i');
    if (hasOpenSlots) f.openSlots = { $gt: 0 };
    return Lab.find(f).sort({ openSlots: -1, name: 1 }).lean().exec();
  },
  lab: (_, { id }, { loaders }) => loaders.lab.load(oid(id)),

  projects: (_, { status, openOnly, tag, limit }) => {
    const f = {};
    if (status) f.status = status;
    if (openOnly) f.isOpen = true;
    if (tag) f.$or = [{ tags: tag.toLowerCase() }, { requiredSkills: tag.toLowerCase() }];
    return Project.find(f).sort({ updatedAt: -1 }).limit(clampLimit(limit)).lean().exec();
  },
  project: (_, { id }, { loaders }) => loaders.project.load(oid(id)),

  searchFaculty,
  searchStudents,
  recommendedMentors,
  recommendedStudentsForProject,

  myJoinRequests: (_, { direction, status }, ctx) => {
    const me = requireUser(ctx);
    const f = direction === 'INCOMING' ? { recipient: me._id } : { requester: me._id };
    if (status) f.status = status;
    return JoinRequest.find(f).sort({ createdAt: -1 }).limit(100).lean().exec();
  },

  notifications: (_, { unreadOnly, limit }, ctx) => {
    const me = requireUser(ctx);
    const f = { recipient: me._id };
    if (unreadOnly) f.read = false;
    return Notification.find(f).sort({ createdAt: -1 }).limit(clampLimit(limit)).lean().exec();
  },
  unreadNotificationCount: (_, __, ctx) => {
    const me = requireUser(ctx);
    return Notification.countDocuments({ recipient: me._id, read: false }).exec();
  },

  adminStats: async () => {
    const [users, students, faculty, labs, openProjects, pendingRequests, unattachedStudents] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'STUDENT' }),
      User.countDocuments({ role: 'FACULTY' }),
      Lab.countDocuments(),
      Project.countDocuments({ isOpen: true }),
      JoinRequest.countDocuments({ status: 'PENDING' }),
      User.countDocuments({ role: 'STUDENT', lab: null }),
    ]);
    return { users, students, faculty, labs, openProjects, pendingRequests, unattachedStudents };
  },
  allUsers: (_, { role, limit }) => User.find(role ? { role } : {}).sort({ createdAt: -1 }).limit(clampLimit(limit, 500)).lean().exec(),
};
