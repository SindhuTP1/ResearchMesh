import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

/* ------------------------------------------------------------------ */
/* Department                                                          */
/* ------------------------------------------------------------------ */
const departmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* User — students, faculty and admins share one collection.           */
/* Skills & interests are embedded (flexible, always read together).   */
/* Relations to other aggregates are stored as references.             */
/* ------------------------------------------------------------------ */
const skillSchema = new Schema(
  {
    name: { type: String, required: true, lowercase: true, trim: true },
    level: { type: Number, min: 1, max: 5, default: 3 }, // 1 = beginner, 5 = expert
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['STUDENT', 'FACULTY', 'ADMIN'], required: true, index: true },
    department: { type: ObjectId, ref: 'Department', index: true },
    bio: { type: String, default: '' },
    skills: { type: [skillSchema], default: [] },
    interests: { type: [String], default: [], set: (v) => v.map((s) => s.toLowerCase().trim()) },
    lab: { type: ObjectId, ref: 'Lab', default: null, index: true }, // the lab a student belongs to / faculty heads
    connections: [{ type: ObjectId, ref: 'User' }],
    // Student-only
    yearOfStudy: { type: Number, min: 1, max: 8 },
    program: { type: String }, // e.g. "MCA", "PhD", "B.Tech"
    lookingFor: { type: [String], enum: ['MENTOR', 'LAB', 'COLLABORATOR', 'PROJECT'], default: [] },
    // Faculty-only
    title: { type: String }, // e.g. "Associate Professor"
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
userSchema.index({ 'skills.name': 1 });
userSchema.index({ interests: 1 });
userSchema.index({ name: 'text', bio: 'text', interests: 'text' });

/* ------------------------------------------------------------------ */
/* Lab                                                                 */
/* ------------------------------------------------------------------ */
const labSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    department: { type: ObjectId, ref: 'Department', required: true, index: true },
    head: { type: ObjectId, ref: 'User', required: true, index: true },
    members: [{ type: ObjectId, ref: 'User' }],
    researchAreas: { type: [String], default: [], set: (v) => v.map((s) => s.toLowerCase().trim()) },
    capacity: { type: Number, default: 8, min: 1 },
    openSlots: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);
labSchema.index({ researchAreas: 1, openSlots: 1 });

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */
const projectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner: { type: ObjectId, ref: 'User', required: true, index: true },
    lab: { type: ObjectId, ref: 'Lab', default: null, index: true },
    members: [{ type: ObjectId, ref: 'User' }],
    requiredSkills: { type: [String], default: [], set: (v) => v.map((s) => s.toLowerCase().trim()) },
    tags: { type: [String], default: [], set: (v) => v.map((s) => s.toLowerCase().trim()) },
    status: { type: String, enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'], default: 'PLANNING', index: true },
    isOpen: { type: Boolean, default: true, index: true }, // accepting join requests
    maxMembers: { type: Number, default: 5 },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Publication                                                         */
/* ------------------------------------------------------------------ */
const publicationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    venue: { type: String, default: '' },
    year: { type: Number, required: true, index: true },
    doi: { type: String },
    url: { type: String },
    authors: [{ type: ObjectId, ref: 'User', index: true }],
    externalAuthors: { type: [String], default: [] },
    keywords: { type: [String], default: [], set: (v) => v.map((s) => s.toLowerCase().trim()) },
  },
  { timestamps: true }
);
publicationSchema.index({ authors: 1, year: -1 });

/* ------------------------------------------------------------------ */
/* Grant                                                               */
/* ------------------------------------------------------------------ */
const grantSchema = new Schema(
  {
    title: { type: String, required: true },
    agency: { type: String, required: true }, // e.g. DST, SERB, AICTE
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    lab: { type: ObjectId, ref: 'Lab', required: true, index: true },
    principalInvestigator: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* JoinRequest — student → project or student → lab                    */
/* ------------------------------------------------------------------ */
const joinRequestSchema = new Schema(
  {
    requester: { type: ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['PROJECT', 'LAB'], required: true },
    project: { type: ObjectId, ref: 'Project', default: null, index: true },
    lab: { type: ObjectId, ref: 'Lab', default: null, index: true },
    recipient: { type: ObjectId, ref: 'User', required: true, index: true }, // owner / lab head
    message: { type: String, default: '' },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'], default: 'PENDING', index: true },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Notification — persisted so users see them after reconnecting       */
/* ------------------------------------------------------------------ */
const notificationSchema = new Schema(
  {
    recipient: { type: ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['JOIN_REQUEST', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'MATCHING_OPENING', 'NEW_CONNECTION'],
      required: true,
    },
    message: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
    joinRequest: { type: ObjectId, ref: 'JoinRequest' },
    project: { type: ObjectId, ref: 'Project' },
    lab: { type: ObjectId, ref: 'Lab' },
    actor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
notificationSchema.index({ recipient: 1, createdAt: -1 });

export const Department = model('Department', departmentSchema);
export const User = model('User', userSchema);
export const Lab = model('Lab', labSchema);
export const Project = model('Project', projectSchema);
export const Publication = model('Publication', publicationSchema);
export const Grant = model('Grant', grantSchema);
export const JoinRequest = model('JoinRequest', joinRequestSchema);
export const Notification = model('Notification', notificationSchema);

export const models = { Department, User, Lab, Project, Publication, Grant, JoinRequest, Notification };
