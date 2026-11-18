const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const opts = { timestamps: true, versionKey: false };

// ---------- companies ----------
const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    settings: {
      defaultColumns: {
        type: [{ _id: false, key: String, label: String, color: String }],
        default: undefined,
      },
    },
  },
  opts
);

// ---------- users ----------
const userSchema = new Schema(
  {
    companyId: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    jobTitle: { type: String, trim: true, maxlength: 120 },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  opts
);
userSchema.index({ email: 1 }, { unique: true });

// ---------- projects ----------
const columnSchema = new Schema(
  { key: { type: String, required: true }, label: { type: String, required: true }, color: String },
  { _id: false }
);

const projectSchema = new Schema(
  {
    companyId: { type: Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    color: { type: String, default: '#6366f1' },
    memberIds: [{ type: Types.ObjectId, ref: 'User' }],
    columns: { type: [columnSchema], default: undefined },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    startDate: Date,
    endDate: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' },
  },
  opts
);
projectSchema.index({ companyId: 1, status: 1, name: 1 });
projectSchema.index({ companyId: 1, memberIds: 1 });

// ---------- tasks ----------
const commentSchema = new Schema(
  {
    authorId: { type: Types.ObjectId, ref: 'User', required: true },
    authorName: String, // dénormalisé pour l'affichage
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

const checklistItemSchema = new Schema(
  { text: { type: String, required: true, trim: true, maxlength: 300 }, done: { type: Boolean, default: false } },
  { versionKey: false }
);

const taskSchema = new Schema(
  {
    companyId: { type: Types.ObjectId, ref: 'Company', required: true },
    projectId: { type: Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    status: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    assigneeId: { type: Types.ObjectId, ref: 'User', default: null },
    reporterId: { type: Types.ObjectId, ref: 'User' },
    dueDate: { type: Date, default: null },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
    position: { type: Number, default: 0 },
    checklist: [checklistItemSchema],
    comments: [commentSchema],
    completedAt: { type: Date, default: null },
  },
  opts
);
// Index alignés sur la future clé de sharding { companyId, projectId }
taskSchema.index({ companyId: 1, projectId: 1, status: 1, position: 1 });
taskSchema.index({ companyId: 1, assigneeId: 1, status: 1 });

// ---------- activities (journal d'activité) ----------
const activitySchema = new Schema(
  {
    companyId: { type: Types.ObjectId, required: true },
    projectId: { type: Types.ObjectId, default: null },
    taskId: { type: Types.ObjectId, default: null },
    actorId: { type: Types.ObjectId, required: true },
    actorName: String,
    action: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
activitySchema.index({ companyId: 1, projectId: 1, createdAt: -1 });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }); // purge à 180 jours

const DEFAULT_COLUMNS = [
  { key: 'todo', label: 'À faire', color: '#94a3b8' },
  { key: 'in_progress', label: 'En cours', color: '#3b82f6' },
  { key: 'review', label: 'En revue', color: '#f59e0b' },
  { key: 'done', label: 'Terminé', color: '#10b981' },
];

module.exports = {
  Company: mongoose.model('Company', companySchema, 'companies'),
  User: mongoose.model('User', userSchema, 'users'),
  Project: mongoose.model('Project', projectSchema, 'projects'),
  Task: mongoose.model('Task', taskSchema, 'tasks'),
  Activity: mongoose.model('Activity', activitySchema, 'activities'),
  DEFAULT_COLUMNS,
};
