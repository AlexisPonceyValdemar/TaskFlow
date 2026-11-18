const router = require('express').Router();
const { Project, Task, User, Company, DEFAULT_COLUMNS } = require('../models');
const { HttpError, wrap, oid, requireRole, isAdmin, loadProject, assertUsersInCompany, pick, log, publicUser } = require('../lib');

function normalizeColumns(cols) {
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > 10) throw new HttpError(400, 'Un tableau doit avoir entre 2 et 10 colonnes');
  const seen = new Set();
  return cols.map((c, i) => {
    const label = String(c.label || '').trim();
    if (!label) throw new HttpError(400, 'Chaque colonne doit avoir un libellé');
    let key = String(c.key || '').trim() || label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `col_${i}`;
    while (seen.has(key)) key += '_';
    seen.add(key);
    return { key, label, color: c.color || '#94a3b8' };
  });
}

router.get('/', wrap(async (req, res) => {
  const filter = req.tenant({ status: req.query.status === 'archived' ? 'archived' : 'active' });
  if (!isAdmin(req.user)) filter.memberIds = req.user._id;
  const projects = await Project.find(filter).sort({ name: 1 }).lean();
  const ids = projects.map((p) => p._id);
  const [totals, dones] = await Promise.all([
    Task.aggregate([{ $match: req.tenant({ projectId: { $in: ids } }) }, { $group: { _id: '$projectId', n: { $sum: 1 } } }]),
    Task.aggregate([{ $match: req.tenant({ projectId: { $in: ids }, completedAt: { $ne: null } }) }, { $group: { _id: '$projectId', n: { $sum: 1 } } }]),
  ]);
  const map = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  const [t, d] = [map(totals), map(dones)];
  res.json(projects.map((p) => ({ ...p, taskCount: t[p._id] || 0, doneCount: d[p._id] || 0 })));
}));

router.post('/', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) throw new HttpError(400, 'Nom du projet obligatoire');
  const memberIds = await assertUsersInCompany(req, [...(body.memberIds || []), req.user._id]);
  const company = await Company.findById(req.companyId).lean();
  const project = await Project.create({
    ...pick(body, ['name', 'description', 'color', 'startDate', 'endDate']),
    companyId: req.companyId,
    memberIds,
    columns: body.columns ? normalizeColumns(body.columns) : company?.settings?.defaultColumns?.length ? company.settings.defaultColumns : DEFAULT_COLUMNS,
    createdBy: req.user._id,
  });
  log(req, 'project.created', { projectId: project._id, details: { name: project.name } });
  res.status(201).json(project);
}));

router.get('/:id', wrap(async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const members = await User.find(req.tenant({ _id: { $in: project.memberIds } })).sort({ name: 1 }).lean();
  res.json({ ...project.toObject(), members: members.map(publicUser) });
}));

router.put('/:id', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const body = req.body || {};
  Object.assign(project, pick(body, ['name', 'description', 'color', 'status', 'startDate', 'endDate']));

  if (body.memberIds) {
    const newIds = await assertUsersInCompany(req, body.memberIds);
    const removed = project.memberIds.filter((id) => !newIds.some((n) => n.equals(id)));
    project.memberIds = newIds;
    if (removed.length) {
      // un utilisateur retiré du projet n'est plus assigné à ses tâches
      await Task.updateMany(req.tenant({ projectId: project._id, assigneeId: { $in: removed } }), { $set: { assigneeId: null } });
    }
  }

  if (body.columns) {
    const columns = normalizeColumns(body.columns);
    const keys = columns.map((c) => c.key);
    const orphan = await Task.countDocuments(req.tenant({ projectId: project._id, status: { $nin: keys } }));
    if (orphan) throw new HttpError(400, `Impossible de supprimer une colonne qui contient encore ${orphan} tâche(s)`);
    project.columns = columns;
  }
  await project.save();
  log(req, 'project.updated', { projectId: project._id, details: { name: project.name } });
  res.json(project);
}));

router.delete('/:id', requireRole('owner', 'admin'), wrap(async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { deletedCount } = await Task.deleteMany(req.tenant({ projectId: project._id }));
  await project.deleteOne();
  log(req, 'project.deleted', { details: { name: project.name, deletedTasks: deletedCount } });
  res.status(204).end();
}));

router.get('/:id/stats', wrap(async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const match = { $match: req.tenant({ projectId: project._id }) };
  const [byStatus, byAssignee, openByAssignee, byPriority, overdue] = await Promise.all([
    Task.aggregate([match, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.aggregate([match, { $group: { _id: '$assigneeId', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: req.tenant({ projectId: project._id, completedAt: null }) }, { $group: { _id: '$assigneeId', count: { $sum: 1 } } }]),
    Task.aggregate([match, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Task.countDocuments(req.tenant({ projectId: project._id, completedAt: null, dueDate: { $lt: new Date() } })),
  ]);
  const open = Object.fromEntries(openByAssignee.map((r) => [String(r._id), r.count]));
  res.json({
    byStatus,
    byAssignee: byAssignee.map((r) => ({ ...r, open: open[String(r._id)] || 0 })),
    byPriority,
    overdue,
  });
}));

router.get('/:id/activity', wrap(async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { Activity } = require('../models');
  const items = await Activity.find(req.tenant({ projectId: project._id })).sort({ createdAt: -1 }).limit(50).lean();
  res.json(items);
}));

module.exports = router;
