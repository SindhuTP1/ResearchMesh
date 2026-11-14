import mongoose from 'mongoose';
import { User, Lab, Department, Project, JoinRequest, Notification, Publication } from '../../models/index.js';
import { requireUser, forbidden, badInput, hasRole } from '../../auth.js';
import { rankCandidates, rankStudentsForProject } from '../../services/matching.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw badInput(`Invalid id: ${id}`);
  return new mongoose.Types.ObjectId(String(id));
};
/** Ids of everyone with a publication in the last 2 calendar years. */
const activeResearcherIds = () => Publication.distinct('authors', { year: { $gte: new Date().getFullYear() - 2 } });
const clampLimit = (n, max = 100) => Math.min(Math.max(1, n ?? 20), max);

const lower = (xs) => (xs ?? []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
const anyRegex = (terms) => terms.map((t) => new RegExp(escapeRegex(t), 'i'));

const FACULTY_SORTS = {
  RELEVANCE: { _recent2: -1, lastActiveAt: -1, _id: 1 },
  RECENT_PAPERS: { _recent2: -1, name: 1, _id: 1 },
  OPEN_SLOTS: { _openSlots: -1, _recent2: -1, _id: 1 },
  NAME: { name: 1, _id: 1 },
  RECENTLY_ACTIVE: { lastActiveAt: -1, _id: 1 },
};

/**
 * searchFaculty — one MongoDB aggregation pipeline:
 *   $match faculty → $lookup recent publications → $lookup labs they head → derived fields → filter → $facet (page + count)
 * So "NLP faculty who published in the last 2 years with an open slot" is a single DB round-trip.
 */
async function searchFaculty(_, { input }) {
  const { area, areas, skills, matchAnySkill, publishedWithinYears, hasOpenSlots, departmentId, titles, minRecentPublications, hasLab, verifiedOnly, name, sortBy } = input;
  const limit = clampLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);
  const year = new Date().getFullYear();
  const windowMin = publishedWithinYears != null ? year - publishedWithinYears : year - 3;
  const lookupMin = Math.min(windowMin, year - 2);

  const match = { role: 'FACULTY' };
  if (departmentId) match.department = oid(departmentId);
  const skillNames = lower(skills);
  if (skillNames.length) match['skills.name'] = matchAnySkill ? { $in: skillNames } : { $all: skillNames };
  if (titles?.length) match.title = { $in: titles };
  if (verifiedOnly) match.verification = { $nin: ['PENDING', 'REJECTED'] };
  if (name?.trim()) match.name = new RegExp(escapeRegex(name.trim()), 'i');

  const post = [];
  if (publishedWithinYears != null) post.push({ _inWindow: { $gt: 0 } });
  if (minRecentPublications) post.push({ _recent2: { $gte: minRecentPublications } });
  if (hasOpenSlots) post.push({ _openSlots: { $gt: 0 } });
  if (hasLab) post.push({ 'headedLabs.0': { $exists: true } });
  const areaTerms = [...new Set([...(area?.trim() ? [area.trim()] : []), ...lower(areas)])];
  if (areaTerms.length) {
    const res = anyRegex(areaTerms);
    post.push({
      $or: [{ interests: { $in: res } }, { 'headedLabs.researchAreas': { $in: res } }, { 'recentPubs.keywords': { $in: res } }, { bio: { $in: res } }],
    });
  }

  const [res] = await User.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'publications',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$uid', '$authors'] }, year: { $gte: lookupMin } } },
          { $project: { keywords: 1, year: 1 } },
        ],
        as: 'recentPubs',
      },
    },
    { $lookup: { from: 'labs', localField: '_id', foreignField: 'head', as: 'headedLabs' } },
    {
      $addFields: {
        _inWindow: { $size: { $filter: { input: '$recentPubs', cond: { $gte: ['$$this.year', windowMin] } } } },
        _recent2: { $size: { $filter: { input: '$recentPubs', cond: { $gte: ['$$this.year', year - 2] } } } },
        _openSlots: { $sum: '$headedLabs.openSlots' },
      },
    },
    ...(post.length ? [{ $match: { $and: post } }] : []),
    {
      $facet: {
        items: [
          { $sort: FACULTY_SORTS[sortBy] ?? FACULTY_SORTS.RELEVANCE },
          { $skip: offset },
          { $limit: limit },
          { $project: { recentPubs: 0, headedLabs: 0, _recent2: 0, _inWindow: 0, _openSlots: 0, passwordHash: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  return { totalCount: res.total[0]?.n ?? 0, items: res.items };
}

const STUDENT_SORTS = {
  RECENTLY_ACTIVE: { lastActiveAt: -1, _id: 1 },
  NAME: { name: 1, _id: 1 },
  YEAR: { yearOfStudy: -1, name: 1, _id: 1 },
};

/** searchStudents — faculty only (enforced by @auth). */
async function searchStudents(_, { input }) {
  const { skills, unattached, interests, departmentId, program, programs, years, lookingFor, name, minSkillLevel, sortBy } = input;
  const limit = clampLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);

  const filter = { role: 'STUDENT' };
  const names = lower(skills);
  if (names.length) {
    if (minSkillLevel) {
      // every requested skill must be present at >= minSkillLevel
      filter.skills = { $all: names.map((n) => ({ $elemMatch: { name: n, level: { $gte: minSkillLevel } } })) };
    } else {
      filter['skills.name'] = { $all: names };
    }
  }
  if (unattached) filter.lab = null;
  if (interests?.length) filter.interests = { $in: lower(interests) };
  if (departmentId) filter.department = oid(departmentId);
  if (program) filter.program = new RegExp(`^${escapeRegex(program)}$`, 'i');
  if (programs?.length) filter.program = { $in: programs };
  if (years?.length) filter.yearOfStudy = { $in: years };
  if (lookingFor?.length) filter.lookingFor = { $in: lookingFor };
  if (name?.trim()) filter.name = new RegExp(escapeRegex(name.trim()), 'i');

  const [totalCount, items] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort(STUDENT_SORTS[sortBy] ?? STUDENT_SORTS.RECENTLY_ACTIVE).skip(offset).limit(limit).lean().exec(),
  ]);
  return { totalCount, items };
}

/**
 * What the global search looks at for each kind of result. `primary` is the field that ranks first
 * when it contains the whole query (a name hit beats a bio hit); `sort` breaks ties after that.
 */
const SEARCH_SOURCES = {
  FACULTY: { key: 'faculty', countKey: 'facultyCount', model: User, base: { role: 'FACULTY' }, fields: ['name', 'title', 'bio', 'interests', 'skills.name'], primary: 'name', sort: { lastActiveAt: -1 } },
  STUDENT: { key: 'students', countKey: 'studentCount', model: User, base: { role: 'STUDENT' }, fields: ['name', 'program', 'bio', 'interests', 'skills.name'], primary: 'name', sort: { lastActiveAt: -1 } },
  PROJECT: { key: 'projects', countKey: 'projectCount', model: Project, base: {}, fields: ['title', 'description', 'tags', 'requiredSkills'], primary: 'title', sort: { isOpen: -1, updatedAt: -1 } },
  LAB: { key: 'labs', countKey: 'labCount', model: Lab, base: {}, fields: ['name', 'description', 'researchAreas'], primary: 'name', sort: { openSlots: -1, name: 1 } },
  PUBLICATION: { key: 'publications', countKey: 'publicationCount', model: Publication, base: {}, fields: ['title', 'venue', 'keywords', 'externalAuthors'], primary: 'title', sort: { year: -1 } },
};
const SEARCH_MIN_LENGTH = 2;

/**
 * search — one box for students and faculty. "python genomics" finds people/projects where BOTH words
 * appear somewhere (in any of the fields above), so adding words narrows results instead of widening them.
 */
async function search(_, { q, type, limit, offset }, ctx) {
  const me = requireUser(ctx);
  const query = (q ?? '').trim().slice(0, 100);
  const empty = Object.fromEntries(Object.values(SEARCH_SOURCES).flatMap((s) => [[s.key, []], [s.countKey, 0]]));
  if (query.length < SEARCH_MIN_LENGTH) return { query, ...empty };

  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 6);
  const take = clampLimit(limit, 50);
  const skip = Math.max(0, offset ?? 0);

  const run = async ([name, src]) => {
    const filter = {
      ...src.base,
      ...(src.model === User ? { _id: { $ne: me._id } } : {}),
      $and: terms.map((t) => {
        const re = new RegExp(escapeRegex(t), 'i');
        return { $or: src.fields.map((f) => ({ [f]: re })) };
      }),
    };
    const wantItems = !type || type === name;
    const [count, items] = await Promise.all([
      src.model.countDocuments(filter),
      wantItems
        ? src.model.aggregate([
          { $match: filter },
          { $addFields: { _hit: { $regexMatch: { input: { $ifNull: [`$${src.primary}`, ''] }, regex: escapeRegex(query), options: 'i' } } } },
          { $sort: { _hit: -1, ...src.sort, _id: 1 } },
          { $skip: type ? skip : 0 },
          { $limit: take },
          { $project: { _hit: 0, passwordHash: 0 } },
        ])
        : [],
    ]);
    return [src, items, count];
  };

  const rows = await Promise.all(Object.entries(SEARCH_SOURCES).map(run));
  const out = { query };
  for (const [src, items, count] of rows) {
    out[src.key] = items;
    out[src.countKey] = count;
  }
  return out;
}

/** Facets for filter UIs: the areas, skills, designations and programs that actually exist, most common first. */
async function filterOptions(_, { role }) {
  const toFacet = (rows) => rows.map((r) => ({ value: r._id, count: r.count }));
  const top = [{ $group: { _id: '$v', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 80 }];
  const [userAreas, labAreas, skills, titles, programs] = await Promise.all([
    User.aggregate([{ $match: { role } }, { $unwind: '$interests' }, { $project: { v: '$interests' } }, ...top]).then(toFacet),
    role === 'FACULTY' ? Lab.aggregate([{ $unwind: '$researchAreas' }, { $project: { v: '$researchAreas' } }, ...top]).then(toFacet) : [],
    User.aggregate([{ $match: { role } }, { $unwind: '$skills' }, { $project: { v: '$skills.name' } }, ...top]).then(toFacet),
    User.distinct('title', { role: 'FACULTY', title: { $nin: [null, ''] } }),
    User.distinct('program', { role: 'STUDENT', program: { $nin: [null, ''] } }),
  ]);
  const areaCounts = new Map();
  for (const { value, count } of [...userAreas, ...labAreas]) areaCounts.set(value, (areaCounts.get(value) ?? 0) + count);
  const areas = [...areaCounts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const TITLE_ORDER = ['Professor & Head', 'Professor', 'Professor Emeritus', 'Associate Professor', 'Assistant Professor', 'Adjunct Professor', 'Visiting Faculty'];
  const rank = (t) => TITLE_ORDER.indexOf(t) + 1 || 99;
  return {
    areas,
    skills,
    titles: titles.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
    programs: programs.sort(),
  };
}

/** Open projects ranked for the logged-in student by required-skill coverage and topic fit. */
async function recommendedProjects(_, { limit }, ctx) {
  const me = requireUser(ctx);
  const projects = await Project.find({ isOpen: true, owner: { $ne: me._id }, members: { $ne: me._id } }).limit(300).lean().exec();
  const seeker = [{ id: me._id, skills: me.skills, interests: me.interests }];
  return projects
    .filter((p) => (p.members?.length ?? 0) < p.maxMembers)
    .map((p) => {
      const [r] = rankStudentsForProject(p, seeker, { limit: 1 });
      return { project: p, score: r.score, reasons: r.reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, clampLimit(limit, 30));
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
  adminExists: async () => !!(await User.exists({ role: 'ADMIN' })),
  user: (_, { id }, { loaders }) => loaders.user.load(oid(id)),
  departments: () => Department.find().sort({ name: 1 }).lean().exec(),

  labs: (_, { area, hasOpenSlots }) => {
    const f = {};
    if (area) f.researchAreas = new RegExp(escapeRegex(area), 'i');
    if (hasOpenSlots) f.openSlots = { $gt: 0 };
    return Lab.find(f).sort({ openSlots: -1, name: 1 }).lean().exec();
  },
  lab: (_, { id }, { loaders }) => loaders.lab.load(oid(id)),

  projects: (_, { status, openOnly, tag, mine, limit }, ctx) => {
    const f = {};
    if (mine) f.owner = requireUser(ctx)._id;
    if (status) f.status = status;
    if (openOnly) f.isOpen = true;
    if (tag) f.$or = [{ tags: tag.toLowerCase() }, { requiredSkills: tag.toLowerCase() }];
    return Project.find(f).sort({ updatedAt: -1 }).limit(clampLimit(limit)).lean().exec();
  },
  project: (_, { id }, { loaders }) => loaders.project.load(oid(id)),

  searchFaculty,
  searchStudents,
  search,
  recommendedMentors,
  recommendedStudentsForProject,
  recommendedProjects,
  filterOptions,

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
    const [users, students, faculty, admins, labs, openProjects, unattachedStudents, pendingVerifications, reqAgg, labAgg, active] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'STUDENT' }),
      User.countDocuments({ role: 'FACULTY' }),
      User.countDocuments({ role: 'ADMIN' }),
      Lab.countDocuments(),
      Project.countDocuments({ isOpen: true }),
      User.countDocuments({ role: 'STUDENT', lab: null }),
      User.countDocuments({ role: 'FACULTY', verification: 'PENDING' }),
      JoinRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Lab.aggregate([{ $group: { _id: null, capacity: { $sum: '$capacity' }, filled: { $sum: { $size: '$members' } } } }]),
      activeResearcherIds(),
    ]);
    const req = Object.fromEntries(reqAgg.map((r) => [r._id, r.n]));
    return {
      users, students, faculty, admins, labs, openProjects, unattachedStudents, pendingVerifications,
      pendingRequests: req.PENDING ?? 0,
      activeResearchers: await User.countDocuments({ role: 'FACULTY', _id: { $in: active } }),
      totalCapacity: labAgg[0]?.capacity ?? 0,
      filledSeats: labAgg[0]?.filled ?? 0,
      requests: { pending: req.PENDING ?? 0, accepted: req.ACCEPTED ?? 0, rejected: req.REJECTED ?? 0, withdrawn: req.WITHDRAWN ?? 0 },
    };
  },

  departmentStats: async () => {
    const [departments, userAgg, labAgg, active, openProjects] = await Promise.all([
      Department.find().sort({ name: 1 }).lean().exec(),
      User.aggregate([{ $group: { _id: { d: '$department', r: '$role' }, n: { $sum: 1 } } }]),
      Lab.aggregate([{ $group: { _id: '$department', labs: { $sum: 1 }, open: { $sum: '$openSlots' } } }]),
      activeResearcherIds(),
      Project.find({ isOpen: true }).select('owner').lean().exec(),
    ]);
    const [activeFaculty, owners] = await Promise.all([
      User.find({ role: 'FACULTY', _id: { $in: active } }).select('department').lean().exec(),
      User.find({ _id: { $in: openProjects.map((p) => p.owner) } }).select('department').lean().exec(),
    ]);
    const countBy = (list) => list.reduce((m, u) => m.set(String(u.department), (m.get(String(u.department)) ?? 0) + 1), new Map());
    const activeBy = countBy(activeFaculty);
    const ownerDept = new Map(owners.map((o) => [String(o._id), String(o.department)]));
    const projBy = countBy(openProjects.map((p) => ({ department: ownerDept.get(String(p.owner)) })));
    const roleCount = (d, r) => userAgg.find((x) => String(x._id.d) === String(d) && x._id.r === r)?.n ?? 0;
    return departments.map((d) => {
      const l = labAgg.find((x) => String(x._id) === String(d._id));
      return {
        department: d,
        faculty: roleCount(d._id, 'FACULTY'),
        students: roleCount(d._id, 'STUDENT'),
        labs: l?.labs ?? 0,
        openSlots: l?.open ?? 0,
        activeResearchers: activeBy.get(String(d._id)) ?? 0,
        openProjects: projBy.get(String(d._id)) ?? 0,
      };
    });
  },

  pendingVerifications: () => User.find({ role: 'FACULTY', verification: 'PENDING' }).sort({ createdAt: 1 }).lean().exec(),
  recentJoinRequests: (_, { limit }) => JoinRequest.find().sort({ createdAt: -1 }).limit(clampLimit(limit, 100)).lean().exec(),
  allUsers: (_, { role, limit }) => User.find(role ? { role } : {}).sort({ createdAt: -1 }).limit(clampLimit(limit, 500)).lean().exec(),
};
