import DataLoader from 'dataloader';
import { User, Lab, Department, Project, Publication, Grant, JoinRequest } from '../models/index.js';

/**
 * Per-request DataLoaders — the N+1 fix.
 *
 * Without them, rendering 20 faculty cards that each show { department, lab { members }, publications }
 * fires 1 + 20 + 20 + 20 + (20 × members) queries. With them every field of the same type in one tick of
 * the event loop is collapsed into a single `$in` query, so the whole tree costs ~1 query per *type*.
 *
 * Loaders are created fresh for every request (in context) so the cache never leaks data between users.
 *
 * `batching: false` keeps the exact same code path but sends one query per key — handy for demonstrating
 * the difference (see `extensions.dbQueries` in the response, or set header `x-dataloader: off`).
 */

const toKey = (id) => String(id);

/** Batch fn for "load documents by _id" — must return results in the same order as keys. */
function byIdLoader(Model, opts) {
  return new DataLoader(async (ids) => {
    const docs = await Model.find({ _id: { $in: ids } }).lean();
    const map = new Map(docs.map((d) => [toKey(d._id), d]));
    return ids.map((id) => map.get(toKey(id)) ?? null);
  }, { cacheKeyFn: toKey, ...opts });
}

/** Batch fn for one-to-many: load all docs whose `field` contains/equals one of the keys, grouped per key. */
function groupedLoader(Model, field, { sort, project } = {}, opts) {
  return new DataLoader(async (keys) => {
    let q = Model.find({ [field]: { $in: keys } });
    if (sort) q = q.sort(sort);
    if (project) q = q.select(project);
    const docs = await q.lean();
    const groups = new Map(keys.map((k) => [toKey(k), []]));
    for (const d of docs) {
      const vals = Array.isArray(d[field]) ? d[field] : [d[field]];
      for (const v of vals) groups.get(toKey(v))?.push(d);
    }
    return keys.map((k) => groups.get(toKey(k)));
  }, { cacheKeyFn: toKey, ...opts });
}

export function createLoaders({ batching = true, userId = null } = {}) {
  const opts = batching ? {} : { batch: false, cache: false };
  return {
    user: byIdLoader(User, opts),
    lab: byIdLoader(Lab, opts),
    department: byIdLoader(Department, opts),
    project: byIdLoader(Project, opts),
    joinRequest: byIdLoader(JoinRequest, opts),

    /** The current user's latest request status per project — avoids one query per project card. */
    myRequestByProject: new DataLoader(async (projectIds) => {
      if (!userId) return projectIds.map(() => null);
      const reqs = await JoinRequest.find({ requester: userId, project: { $in: projectIds } })
        .sort({ createdAt: -1 })
        .lean();
      const map = new Map();
      for (const r of reqs) if (!map.has(toKey(r.project))) map.set(toKey(r.project), r.status);
      return projectIds.map((id) => map.get(toKey(id)) ?? null);
    }, { cacheKeyFn: toKey, ...opts }),

    publicationsByAuthor: groupedLoader(Publication, 'authors', { sort: { year: -1, _id: 1 } }, opts),
    projectsByMember: groupedLoader(Project, 'members', { sort: { updatedAt: -1, _id: 1 } }, opts),
    projectsByLab: groupedLoader(Project, 'lab', { sort: { updatedAt: -1, _id: 1 } }, opts),
    grantsByLab: groupedLoader(Grant, 'lab', { sort: { startDate: -1, _id: 1 } }, opts),
    labsByDepartment: groupedLoader(Lab, 'department', { sort: { name: 1, _id: 1 } }, opts),
    facultyByDepartment: new DataLoader(async (deptIds) => {
      const docs = await User.find({ department: { $in: deptIds }, role: 'FACULTY' }).select('department').lean();
      const counts = new Map(deptIds.map((d) => [toKey(d), 0]));
      for (const d of docs) counts.set(toKey(d.department), (counts.get(toKey(d.department)) ?? 0) + 1);
      return deptIds.map((d) => counts.get(toKey(d)));
    }, { cacheKeyFn: toKey, ...opts }),
  };
}

/** Helper: load many ids through a loader, dropping nulls (deleted docs). */
export async function loadMany(loader, ids = []) {
  if (!ids?.length) return [];
  const docs = await loader.loadMany(ids.map(toKey));
  return docs.filter((d) => d && !(d instanceof Error));
}
