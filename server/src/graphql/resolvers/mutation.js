import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Lab, Project, Publication, Grant, JoinRequest, Notification, Department } from '../../models/index.js';
import { signToken, requireUser, forbidden, badInput, hasRole } from '../../auth.js';
import { notify, publishJoinRequest, notifyMatchingStudents } from '../../services/notify.js';

const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw badInput(`Invalid id: ${id}`);
  return new mongoose.Types.ObjectId(String(id));
};
const isOwnerOrAdmin = (ownerId, user) => String(ownerId) === user.id || hasRole(user, 'ADMIN');
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/** Run background work (notifications) without blocking the mutation response. */
const background = (promise) => promise.catch((e) => console.error('background task failed:', e));

export const Mutation = {
  /* ------------------------------- auth ------------------------------- */
  async register(_, { input }) {
    const { name, email, password, role, departmentId, program, title } = input;
    if (role === 'ADMIN') throw forbidden('Admins cannot self-register');
    if (password.length < 8) throw badInput('Password must be at least 8 characters');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw badInput('Invalid email');
    if (await User.exists({ email: email.toLowerCase() })) throw badInput('Email already registered');
    if (departmentId && !(await Department.exists({ _id: oid(departmentId) }))) throw badInput('Unknown department');

    const user = await User.create({
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      department: departmentId ? oid(departmentId) : undefined,
      program,
      title,
    });
    return { token: signToken(user), user: user.toObject() };
  },

  async login(_, { email, password }) {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw badInput('Invalid email or password');
    user.lastActiveAt = new Date();
    await user.save();
    const plain = user.toObject();
    delete plain.passwordHash;
    return { token: signToken(user), user: plain };
  },

  /* ------------------------------ profile ----------------------------- */
  async updateProfile(_, { input }, ctx) {
    const me = requireUser(ctx);
    const update = pick(input, ['name', 'bio', 'skills', 'interests', 'yearOfStudy', 'program', 'lookingFor', 'title']);
    if (input.departmentId) update.department = oid(input.departmentId);
    if (update.skills) {
      // de-duplicate by name, keep highest level, clamp 1..5
      const m = new Map();
      for (const s of update.skills) {
        const name = s.name.toLowerCase().trim();
        if (!name) continue;
        m.set(name, Math.max(m.get(name) ?? 0, Math.min(5, Math.max(1, s.level ?? 3))));
      }
      update.skills = [...m].map(([name, level]) => ({ name, level }));
    }
    update.lastActiveAt = new Date();
    return User.findByIdAndUpdate(me._id, update, { new: true, runValidators: true }).lean().exec();
  },

  async connect(_, { userId }, ctx) {
    const me = requireUser(ctx);
    const other = oid(userId);
    if (String(other) === me.id) throw badInput("You can't connect with yourself");
    if (!(await User.exists({ _id: other }))) throw badInput('User not found');
    const already = (me.connections ?? []).some((c) => String(c) === String(other));
    await User.updateOne({ _id: me._id }, { $addToSet: { connections: other } });
    await User.updateOne({ _id: other }, { $addToSet: { connections: me._id } });
    if (!already) {
      background(notify({ recipient: other, type: 'NEW_CONNECTION', message: `${me.name} connected with you`, actor: me._id }));
    }
    return User.findById(other).lean().exec();
  },

  /* ------------------------------ projects ---------------------------- */
  async createProject(_, { input }, ctx) {
    const me = requireUser(ctx);
    let lab = null;
    if (input.labId) {
      lab = await Lab.findById(oid(input.labId)).lean().exec();
      if (!lab) throw badInput('Lab not found');
      const inLab = String(lab.head) === me.id || lab.members.some((m) => String(m) === me.id);
      if (!inLab && !hasRole(me, 'ADMIN')) throw forbidden('You can only create projects in a lab you belong to');
    }
    const project = await Project.create({
      ...pick(input, ['title', 'description', 'requiredSkills', 'tags', 'status', 'isOpen', 'maxMembers']),
      owner: me._id,
      lab: lab?._id ?? null,
      members: [me._id],
    });
    if (project.isOpen) {
      background(
        notifyMatchingStudents({
          areas: project.tags,
          requiredSkills: project.requiredSkills,
          message: `New project "${project.title}" is looking for members`,
          project: project._id,
          lab: lab?._id,
          actor: me._id,
          excludeIds: [me._id],
        })
      );
    }
    return project.toObject();
  },

  async updateProject(_, { id, input }, ctx) {
    const me = requireUser(ctx);
    const project = await Project.findById(oid(id));
    if (!project) throw badInput('Project not found');
    if (!isOwnerOrAdmin(project.owner, me)) throw forbidden('Only the owner can edit this project');
    const wasOpen = project.isOpen;
    Object.assign(project, pick(input, ['title', 'description', 'requiredSkills', 'tags', 'status', 'isOpen', 'maxMembers']));
    await project.save();
    if (!wasOpen && project.isOpen) {
      background(
        notifyMatchingStudents({
          areas: project.tags,
          requiredSkills: project.requiredSkills,
          message: `Project "${project.title}" re-opened for members`,
          project: project._id,
          actor: me._id,
          excludeIds: project.members,
        })
      );
    }
    return project.toObject();
  },

  /* -------------------------------- labs ------------------------------ */
  async createLab(_, { input }, ctx) {
    const me = ctx.user; // @auth(FACULTY) already enforced
    if (!(await Department.exists({ _id: oid(input.departmentId) }))) throw badInput('Unknown department');
    if (!hasRole(me, 'ADMIN') && (await Lab.exists({ head: me._id }))) throw badInput('You already head a lab');
    const lab = await Lab.create({
      ...pick(input, ['name', 'description', 'researchAreas', 'capacity', 'openSlots']),
      department: oid(input.departmentId),
      head: me._id,
      members: [],
    });
    await User.updateOne({ _id: me._id }, { lab: lab._id });
    if (lab.openSlots > 0) {
      background(
        notifyMatchingStudents({
          areas: lab.researchAreas,
          message: `New lab "${lab.name}" has ${lab.openSlots} open slot(s)`,
          lab: lab._id,
          actor: me._id,
        })
      );
    }
    return lab.toObject();
  },

  async updateLab(_, { id, input }, ctx) {
    const me = ctx.user;
    const lab = await Lab.findById(oid(id));
    if (!lab) throw badInput('Lab not found');
    if (!isOwnerOrAdmin(lab.head, me)) throw forbidden('Only the lab head can edit this lab');
    const prevSlots = lab.openSlots;
    Object.assign(lab, pick(input, ['name', 'description', 'researchAreas', 'capacity', 'openSlots']));
    await lab.save();
    if (lab.openSlots > prevSlots) {
      background(
        notifyMatchingStudents({
          areas: lab.researchAreas,
          message: `"${lab.name}" opened ${lab.openSlots - prevSlots} new slot(s)`,
          lab: lab._id,
          actor: me._id,
        })
      );
    }
    return lab.toObject();
  },

  /* ---------------------------- publications -------------------------- */
  async addPublication(_, { input }, ctx) {
    const me = requireUser(ctx);
    const year = new Date().getFullYear();
    if (input.year < 1950 || input.year > year + 1) throw badInput('Invalid publication year');
    const authors = [me._id, ...(input.coAuthorIds ?? []).map(oid)];
    const pub = await Publication.create({
      ...pick(input, ['title', 'venue', 'year', 'doi', 'url', 'externalAuthors', 'keywords']),
      authors: [...new Map(authors.map((a) => [String(a), a])).values()],
    });
    await User.updateMany({ _id: { $in: pub.authors } }, { lastActiveAt: new Date() });
    return pub.toObject();
  },

  async addGrant(_, { input }, ctx) {
    const me = ctx.user;
    const lab = await Lab.findById(oid(input.labId)).lean().exec();
    if (!lab) throw badInput('Lab not found');
    if (!isOwnerOrAdmin(lab.head, me)) throw forbidden('Only the lab head can add grants');
    if (new Date(input.endDate) <= new Date(input.startDate)) throw badInput('endDate must be after startDate');
    const grant = await Grant.create({
      ...pick(input, ['title', 'agency', 'amount', 'currency', 'startDate', 'endDate']),
      lab: lab._id,
      principalInvestigator: me._id,
    });
    return grant.toObject();
  },

  /* ---------------------------- join requests ------------------------- */
  async requestToJoin(_, { targetType, targetId, message }, ctx) {
    const me = requireUser(ctx);
    const target = oid(targetId);
    let recipient;
    let label;
    const doc = { requester: me._id, targetType, message: message ?? '' };

    if (targetType === 'PROJECT') {
      const p = await Project.findById(target).lean().exec();
      if (!p) throw badInput('Project not found');
      if (!p.isOpen) throw badInput('This project is not accepting members');
      if (p.members.some((m) => String(m) === me.id)) throw badInput('You are already a member');
      if (p.members.length >= p.maxMembers) throw badInput('Project is full');
      recipient = p.owner;
      label = `project "${p.title}"`;
      doc.project = p._id;
      doc.lab = p.lab ?? null;
    } else {
      if (me.role !== 'STUDENT') throw forbidden('Only students can request to join a lab');
      if (me.lab) throw badInput('You are already in a lab');
      const l = await Lab.findById(target).lean().exec();
      if (!l) throw badInput('Lab not found');
      if (l.openSlots <= 0) throw badInput('This lab has no open slots');
      recipient = l.head;
      label = `lab "${l.name}"`;
      doc.lab = l._id;
    }

    const dupFilter = { requester: me._id, status: 'PENDING', ...(targetType === 'PROJECT' ? { project: doc.project } : { lab: doc.lab, targetType: 'LAB' }) };
    if (await JoinRequest.exists(dupFilter)) throw badInput('You already have a pending request');

    const jr = await JoinRequest.create({ ...doc, recipient });
    await notify({
      recipient,
      type: 'JOIN_REQUEST',
      message: `${me.name} requested to join your ${label}`,
      actor: me._id,
      project: doc.project,
      lab: doc.lab,
      joinRequest: jr._id,
    });
    await publishJoinRequest(jr);
    return jr.toObject();
  },

  async respondToJoinRequest(_, { id, accept }, ctx) {
    const me = requireUser(ctx);
    const jr = await JoinRequest.findById(oid(id));
    if (!jr) throw badInput('Request not found');
    if (!isOwnerOrAdmin(jr.recipient, me)) throw forbidden('Only the recipient can respond');
    if (jr.status !== 'PENDING') throw badInput(`Request already ${jr.status.toLowerCase()}`);

    let label = 'your request';
    if (accept) {
      if (jr.targetType === 'PROJECT') {
        // Atomic seat check: only add if still under maxMembers.
        const p = await Project.findOneAndUpdate(
          { _id: jr.project, $expr: { $lt: [{ $size: '$members' }, '$maxMembers'] } },
          { $addToSet: { members: jr.requester } },
          { new: true }
        );
        if (!p) throw badInput('Project is full');
        label = `project "${p.title}"`;
      } else {
        // Atomic slot check: decrement openSlots only if > 0.
        const l = await Lab.findOneAndUpdate(
          { _id: jr.lab, openSlots: { $gt: 0 } },
          { $addToSet: { members: jr.requester }, $inc: { openSlots: -1 } },
          { new: true }
        );
        if (!l) throw badInput('Lab has no open slots left');
        await User.updateOne({ _id: jr.requester }, { lab: l._id });
        // Withdraw the student's other pending lab requests — they're attached now.
        const others = await JoinRequest.find({ requester: jr.requester, targetType: 'LAB', status: 'PENDING', _id: { $ne: jr._id } });
        for (const o of others) {
          o.status = 'WITHDRAWN';
          await o.save();
          await publishJoinRequest(o);
        }
        label = `lab "${l.name}"`;
      }
    } else {
      const target = jr.project ? await Project.findById(jr.project).lean().exec() : await Lab.findById(jr.lab).lean().exec();
      label = jr.project ? `project "${target?.title}"` : `lab "${target?.name}"`;
    }

    jr.status = accept ? 'ACCEPTED' : 'REJECTED';
    await jr.save();
    await notify({
      recipient: jr.requester,
      type: accept ? 'REQUEST_ACCEPTED' : 'REQUEST_REJECTED',
      message: accept ? `${me.name} accepted you into ${label} 🎉` : `${me.name} declined your request to join ${label}`,
      actor: me._id,
      project: jr.project,
      lab: jr.lab,
      joinRequest: jr._id,
    });
    await publishJoinRequest(jr);
    return jr.toObject();
  },

  async withdrawJoinRequest(_, { id }, ctx) {
    const me = requireUser(ctx);
    const jr = await JoinRequest.findById(oid(id));
    if (!jr) throw badInput('Request not found');
    if (String(jr.requester) !== me.id) throw forbidden('Not your request');
    if (jr.status !== 'PENDING') throw badInput('Only pending requests can be withdrawn');
    jr.status = 'WITHDRAWN';
    await jr.save();
    await publishJoinRequest(jr);
    return jr.toObject();
  },

  /* ---------------------------- notifications ------------------------- */
  async markNotificationsRead(_, { ids }, ctx) {
    const me = requireUser(ctx);
    const f = { recipient: me._id, read: false };
    if (ids?.length) f._id = { $in: ids.map(oid) };
    const r = await Notification.updateMany(f, { read: true });
    return r.modifiedCount;
  },

  /* -------------------------------- admin ----------------------------- */
  async setUserRole(_, { userId, role }) {
    const u = await User.findByIdAndUpdate(oid(userId), { role }, { new: true }).lean().exec();
    if (!u) throw badInput('User not found');
    return u;
  },

  async deleteUser(_, { userId }, ctx) {
    const id = oid(userId);
    if (String(id) === ctx.user.id) throw badInput("You can't delete yourself");
    const res = await User.deleteOne({ _id: id });
    if (!res.deletedCount) return false;
    await Promise.all([
      User.updateMany({ connections: id }, { $pull: { connections: id } }),
      Lab.updateMany({ members: id }, { $pull: { members: id } }),
      Project.updateMany({ members: id }, { $pull: { members: id } }),
      JoinRequest.deleteMany({ $or: [{ requester: id }, { recipient: id }] }),
      Notification.deleteMany({ recipient: id }),
    ]);
    return true;
  },
};
