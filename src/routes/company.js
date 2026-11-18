const router = require('express').Router();
const { Company, User, Project, Task, Activity } = require('../models');
const { HttpError, wrap, requireRole, pick, log } = require('../lib');

// L'utilisateur ne voit / modifie QUE son entreprise : l'id vient du jeton, pas de l'URL.
router.get('/', wrap(async (req, res) => {
  const company = await Company.findById(req.companyId).lean();
  const [users, projects, tasks, openTasks] = await Promise.all([
    User.countDocuments(req.tenant()),
    Project.countDocuments(req.tenant({ status: 'active' })),
    Task.countDocuments(req.tenant()),
    Task.countDocuments(req.tenant({ completedAt: null })),
  ]);
  res.json({ ...company, stats: { users, projects, tasks, openTasks } });
}));

router.put('/', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const update = pick(req.body || {}, ['name', 'plan']);
  if (update.name !== undefined && !String(update.name).trim()) throw new HttpError(400, 'Nom obligatoire');
  const company = await Company.findByIdAndUpdate(req.companyId, update, { new: true, runValidators: true }).lean();
  log(req, 'company.updated', { details: update });
  res.json(company);
}));

// Suppression complète de l'entreprise et de toutes ses données (réservé au propriétaire)
router.delete('/', requireRole('owner'), wrap(async (req, res) => {
  if ((req.body || {}).confirm !== 'SUPPRIMER') throw new HttpError(400, 'Confirmation requise : envoyer { "confirm": "SUPPRIMER" }');
  const f = req.tenant();
  await Promise.all([Task.deleteMany(f), Project.deleteMany(f), Activity.deleteMany(f)]);
  await User.deleteMany(f);
  await Company.deleteOne({ _id: req.companyId });
  res.status(204).end();
}));

router.get('/activity', wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const items = await Activity.find(req.tenant()).sort({ createdAt: -1 }).limit(limit).lean();
  res.json(items);
}));

module.exports = router;
