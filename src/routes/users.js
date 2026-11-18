const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, Project, Task } = require('../models');
const { HttpError, wrap, oid, requireRole, publicUser, pick, log } = require('../lib');
const { validatePassword } = require('./auth');

router.get('/', wrap(async (req, res) => {
  const users = await User.find(req.tenant()).sort({ name: 1 }).lean();
  res.json(users.map(publicUser));
}));

router.post('/', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const { name, email, password, role = 'member', jobTitle } = req.body || {};
  if (!name || !email) throw new HttpError(400, 'Nom et e-mail obligatoires');
  validatePassword(password);
  if (role === 'owner') throw new HttpError(400, "Il ne peut y avoir qu'un seul propriétaire");
  if (role === 'admin' && req.user.role !== 'owner') throw new HttpError(403, 'Seul le propriétaire peut créer un administrateur');
  if (await User.exists({ email: String(email).toLowerCase().trim() })) throw new HttpError(409, 'Cet e-mail est déjà utilisé');
  const user = await User.create({
    companyId: req.companyId, // forcé depuis le jeton
    name, email, role, jobTitle,
    passwordHash: await bcrypt.hash(password, 10),
  });
  log(req, 'user.created', { details: { userId: user._id, name } });
  res.status(201).json(publicUser(user));
}));

router.get('/:id', wrap(async (req, res) => {
  const user = await User.findOne(req.tenant({ _id: oid(req.params.id) })).lean();
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  res.json(publicUser(user));
}));

router.put('/:id', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const user = await User.findOne(req.tenant({ _id: oid(req.params.id) }));
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  const body = req.body || {};
  if (user.role === 'owner' && req.user.role !== 'owner') throw new HttpError(403, 'Impossible de modifier le propriétaire');
  if (body.role !== undefined && body.role !== user.role) {
    if (body.role === 'owner' || user.role === 'owner') throw new HttpError(400, 'Le rôle propriétaire ne peut pas être changé');
    if (req.user.role !== 'owner') throw new HttpError(403, 'Seul le propriétaire peut changer les rôles');
  }
  if (body.active === false && user._id.equals(req.user._id)) throw new HttpError(400, 'Vous ne pouvez pas vous désactiver vous-même');
  Object.assign(user, pick(body, ['name', 'role', 'jobTitle', 'active']));
  if (body.email) user.email = body.email;
  if (body.password) {
    validatePassword(body.password);
    user.passwordHash = await bcrypt.hash(body.password, 10);
  }
  await user.save();
  log(req, 'user.updated', { details: { userId: user._id, name: user.name } });
  res.json(publicUser(user));
}));

router.delete('/:id', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const id = oid(req.params.id);
  const user = await User.findOne(req.tenant({ _id: id }));
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  if (user.role === 'owner') throw new HttpError(400, 'Le propriétaire ne peut pas être supprimé');
  if (user._id.equals(req.user._id)) throw new HttpError(400, 'Vous ne pouvez pas vous supprimer vous-même');
  await Promise.all([
    Project.updateMany(req.tenant({ memberIds: id }), { $pull: { memberIds: id } }),
    Task.updateMany(req.tenant({ assigneeId: id }), { $set: { assigneeId: null } }),
  ]);
  await user.deleteOne();
  log(req, 'user.deleted', { details: { name: user.name } });
  res.status(204).end();
}));

module.exports = router;
