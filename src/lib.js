const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('./config');
const { User, Project, Activity } = require('./models');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function oid(value, label = 'identifiant') {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `${label} invalide`);
  return new mongoose.Types.ObjectId(String(value));
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), companyId: String(user.companyId), role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Authentification + contexte locataire (tenant).
 * Le companyId utilisé dans TOUTES les requêtes provient exclusivement du jeton signé,
 * jamais du corps ou des paramètres de la requête : c'est la base de l'isolation entre entreprises.
 */
const auth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentification requise');
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new HttpError(401, 'Session expirée ou invalide');
  }
  const user = await User.findOne({ _id: payload.sub, companyId: payload.companyId, active: true }).lean();
  if (!user) throw new HttpError(401, 'Utilisateur introuvable ou désactivé');
  req.user = user;
  req.companyId = user.companyId;
  req.tenant = (filter = {}) => ({ ...filter, companyId: user.companyId });
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Droits insuffisants'));
  next();
};

const isAdmin = (user) => user.role === 'owner' || user.role === 'admin';

/** Charge un projet de l'entreprise courante et vérifie que l'utilisateur y a accès. */
async function loadProject(req, projectId) {
  const project = await Project.findOne(req.tenant({ _id: oid(projectId, 'projet') }));
  if (!project) throw new HttpError(404, 'Projet introuvable');
  if (!isAdmin(req.user) && !project.memberIds.some((id) => id.equals(req.user._id))) {
    throw new HttpError(403, "Vous n'êtes pas membre de ce projet");
  }
  return project;
}

/** Vérifie que des utilisateurs appartiennent bien à l'entreprise courante. */
async function assertUsersInCompany(req, ids) {
  const unique = [...new Set(ids.map(String))].map((id) => oid(id, 'utilisateur'));
  if (!unique.length) return [];
  const count = await User.countDocuments(req.tenant({ _id: { $in: unique } }));
  if (count !== unique.length) throw new HttpError(400, "Un ou plusieurs utilisateurs n'appartiennent pas à l'entreprise");
  return unique;
}

function log(req, action, { projectId = null, taskId = null, details = {} } = {}) {
  // fire & forget : le journal ne doit pas bloquer la requête
  Activity.create({
    companyId: req.companyId,
    projectId,
    taskId,
    actorId: req.user._id,
    actorName: req.user.name,
    action,
    details,
  }).catch((e) => console.warn('[activity]', e.message));
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u.toObject ? u.toObject() : u;
  return rest;
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50) || 'entreprise';
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

module.exports = { HttpError, wrap, oid, signToken, auth, requireRole, isAdmin, loadProject, assertUsersInCompany, log, publicUser, slugify, pick };
