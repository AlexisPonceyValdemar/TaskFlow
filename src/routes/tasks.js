const router = require('express').Router();
const { Task, Project } = require('../models');
const { HttpError, wrap, oid, isAdmin, loadProject, pick, log } = require('../lib');
const { broadcast } = require('../ws');

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertAssignee(project, assigneeId) {
  if (assigneeId === null || assigneeId === '' || assigneeId === undefined) return null;
  const id = oid(assigneeId, 'assigné');
  if (!project.memberIds.some((m) => m.equals(id))) throw new HttpError(400, "L'utilisateur assigné doit être membre du projet");
  return id;
}

function assertStatus(project, status) {
  if (!project.columns.some((c) => c.key === status)) throw new HttpError(400, `Statut inconnu : ${status}`);
  return status;
}

const doneKey = (project) => project.columns[project.columns.length - 1].key;

function cleanTags(tags) {
  if (!Array.isArray(tags)) return undefined;
  return [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

/** Charge une tâche de l'entreprise courante + son projet (avec contrôle d'accès). */
async function loadTask(req) {
  const task = await Task.findOne(req.tenant({ _id: oid(req.params.id, 'tâche') }));
  if (!task) throw new HttpError(404, 'Tâche introuvable');
  const project = await loadProject(req, task.projectId);
  return { task, project };
}

// ----- Liste des tâches d'un projet (Kanban) -----
router.get('/projects/:projectId/tasks', wrap(async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const filter = req.tenant({ projectId: project._id });
  const { q, assigneeId, priority, tag } = req.query;
  if (q) filter.title = { $regex: escapeRegex(String(q)), $options: 'i' };
  if (assigneeId === 'none') filter.assigneeId = null;
  else if (assigneeId) filter.assigneeId = oid(assigneeId);
  if (priority && PRIORITIES.includes(priority)) filter.priority = priority;
  if (tag) filter.tags = String(tag).toLowerCase();
  const tasks = await Task.find(filter).sort({ status: 1, position: 1 }).lean();
  res.json(tasks);
}));

router.post('/projects/:projectId/tasks', wrap(async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const body = req.body || {};
  if (!body.title || !String(body.title).trim()) throw new HttpError(400, 'Titre obligatoire');
  const status = assertStatus(project, body.status || project.columns[0].key);
  const last = await Task.findOne(req.tenant({ projectId: project._id, status })).sort({ position: -1 }).lean();
  const task = await Task.create({
    ...pick(body, ['title', 'description', 'priority', 'dueDate']),
    tags: cleanTags(body.tags) || [],
    checklist: Array.isArray(body.checklist) ? body.checklist : [],
    companyId: req.companyId,
    projectId: project._id,
    status,
    assigneeId: assertAssignee(project, body.assigneeId),
    reporterId: req.user._id,
    position: last ? last.position + 1 : 0,
    completedAt: status === doneKey(project) ? new Date() : null,
  });
  log(req, 'task.created', { projectId: project._id, taskId: task._id, details: { title: task.title } });
  broadcast(req.companyId, 'task:created', task, { projectId: project._id, excludeUserId: req.user._id });
  res.status(201).json(task);
}));

// ----- Mes tâches (toutes les tâches assignées à l'utilisateur courant) -----
router.get('/tasks/mine', wrap(async (req, res) => {
  const filter = req.tenant({ assigneeId: req.user._id });
  if (req.query.open !== 'false') filter.completedAt = null;
  const tasks = await Task.find(filter).sort({ dueDate: 1, priority: -1 }).limit(200).lean();
  const projects = await Project.find(req.tenant({ _id: { $in: [...new Set(tasks.map((t) => String(t.projectId)))] } }))
    .select('name color columns').lean();
  const pById = Object.fromEntries(projects.map((p) => [String(p._id), p]));
  res.json(tasks.map((t) => ({ ...t, project: pById[t.projectId] || null })));
}));

router.get('/tasks/:id', wrap(async (req, res) => {
  const { task } = await loadTask(req);
  res.json(task);
}));

router.put('/tasks/:id', wrap(async (req, res) => {
  const { task, project } = await loadTask(req);
  const body = req.body || {};
  Object.assign(task, pick(body, ['title', 'description', 'priority', 'dueDate']));
  if (body.tags !== undefined) task.tags = cleanTags(body.tags) || [];
  if (body.checklist !== undefined) task.checklist = Array.isArray(body.checklist) ? body.checklist : [];
  if (body.assigneeId !== undefined) task.assigneeId = assertAssignee(project, body.assigneeId);
  if (body.status !== undefined && body.status !== task.status) {
    task.status = assertStatus(project, body.status);
    const last = await Task.findOne(req.tenant({ projectId: project._id, status: task.status })).sort({ position: -1 }).lean();
    task.position = last ? last.position + 1 : 0;
  }
  task.completedAt = task.status === doneKey(project) ? task.completedAt || new Date() : null;
  await task.save();
  log(req, 'task.updated', { projectId: project._id, taskId: task._id, details: { title: task.title } });
  broadcast(req.companyId, 'task:updated', task, { projectId: project._id, excludeUserId: req.user._id });
  res.json(task);
}));

// ----- Déplacement dans le Kanban (changement de colonne et/ou d'ordre) -----
router.patch('/tasks/:id/move', wrap(async (req, res) => {
  const { task, project } = await loadTask(req);
  const { status, index } = req.body || {};
  const target = assertStatus(project, status || task.status);
  const previous = task.status;

  const siblings = await Task.find(req.tenant({ projectId: project._id, status: target, _id: { $ne: task._id } }))
    .sort({ position: 1 }).select('_id').lean();
  const i = Math.max(0, Math.min(Number.isInteger(index) ? index : siblings.length, siblings.length));
  const ordered = [...siblings.slice(0, i).map((s) => s._id), task._id, ...siblings.slice(i).map((s) => s._id)];

  await Task.bulkWrite(ordered.map((id, pos) => ({
    updateOne: {
      filter: req.tenant({ _id: id }),
      update: id.equals(task._id)
        ? { $set: { position: pos, status: target, completedAt: target === doneKey(project) ? task.completedAt || new Date() : null } }
        : { $set: { position: pos } },
    },
  })));

  if (previous !== target) {
    const labels = Object.fromEntries(project.columns.map((c) => [c.key, c.label]));
    log(req, 'task.moved', { projectId: project._id, taskId: task._id, details: { title: task.title, from: labels[previous], to: labels[target] } });
  }
  const updatedTask = await Task.findOne(req.tenant({ _id: task._id })).lean();
  broadcast(req.companyId, 'task:moved', { taskId: task._id, status: target, index: i, task: updatedTask }, { projectId: project._id, excludeUserId: req.user._id });
  res.json(updatedTask);
}));

router.delete('/tasks/:id', wrap(async (req, res) => {
  const { task, project } = await loadTask(req);
  if (!isAdmin(req.user) && !(task.reporterId && task.reporterId.equals(req.user._id))) {
    throw new HttpError(403, 'Seuls les administrateurs ou le créateur de la tâche peuvent la supprimer');
  }
  await task.deleteOne();
  log(req, 'task.deleted', { projectId: project._id, details: { title: task.title } });
  broadcast(req.companyId, 'task:deleted', { taskId: task._id }, { projectId: project._id, excludeUserId: req.user._id });
  res.status(204).end();
}));

// ----- Commentaires -----
router.post('/tasks/:id/comments', wrap(async (req, res) => {
  const { task, project } = await loadTask(req);
  const text = String((req.body || {}).text || '').trim();
  if (!text) throw new HttpError(400, 'Commentaire vide');
  task.comments.push({ authorId: req.user._id, authorName: req.user.name, text });
  await task.save();
  log(req, 'task.commented', { projectId: project._id, taskId: task._id, details: { title: task.title } });
  broadcast(req.companyId, 'task:updated', task, { projectId: project._id, excludeUserId: req.user._id });
  res.status(201).json(task);
}));

router.delete('/tasks/:id/comments/:commentId', wrap(async (req, res) => {
  const { task } = await loadTask(req);
  const c = task.comments.id(oid(req.params.commentId, 'commentaire'));
  if (!c) throw new HttpError(404, 'Commentaire introuvable');
  if (!c.authorId.equals(req.user._id) && !isAdmin(req.user)) throw new HttpError(403, 'Droits insuffisants');
  c.deleteOne();
  await task.save();
  broadcast(req.companyId, 'task:updated', task, { projectId: project._id, excludeUserId: req.user._id });
  res.json(task);
}));

module.exports = router;
