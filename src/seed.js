const bcrypt = require('bcryptjs');
const { Company, User, Project, Task, DEFAULT_COLUMNS } = require('./models');

const DEMO_PASSWORD = 'TaskFlow2026!';

/** Jeu de démonstration : 2 entreprises distinctes pour illustrer l'isolation. Exécuté seulement si la base est vide. */
async function seed() {
  if (await Company.estimatedDocumentCount()) return false;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const day = 86400000;

  // ---------- Acme ----------
  const acme = await Company.create({ name: 'Acme Corp', slug: 'acme-corp', plan: 'pro', settings: { defaultColumns: DEFAULT_COLUMNS } });
  const [alice, bob, chloe] = await User.create([
    { companyId: acme._id, name: 'Alice Martin', email: 'alice@acme.test', passwordHash: hash, role: 'owner', jobTitle: 'CEO' },
    { companyId: acme._id, name: 'Bob Durand', email: 'bob@acme.test', passwordHash: hash, role: 'admin', jobTitle: 'Chef de projet' },
    { companyId: acme._id, name: 'Chloé Petit', email: 'chloe@acme.test', passwordHash: hash, role: 'member', jobTitle: 'Développeuse' },
  ]);
  const site = await Project.create({
    companyId: acme._id, name: 'Refonte du site web', description: 'Nouvelle version du site vitrine et du tunnel de commande.',
    color: '#6366f1', memberIds: [alice._id, bob._id, chloe._id], columns: DEFAULT_COLUMNS, createdBy: alice._id,
    startDate: new Date(Date.now() - 10 * day), endDate: new Date(Date.now() + 30 * day),
  });
  const app = await Project.create({
    companyId: acme._id, name: 'Application mobile', description: 'MVP de l’application iOS / Android.',
    color: '#ec4899', memberIds: [alice._id, bob._id], columns: DEFAULT_COLUMNS, createdBy: bob._id,
  });
  const t = (project, title, status, position, extra = {}) => ({
    companyId: acme._id, projectId: project._id, title, status, position, reporterId: bob._id,
    completedAt: status === 'done' ? new Date() : null, ...extra,
  });
  await Task.create([
    t(site, 'Maquettes de la page d’accueil', 'done', 0, { assigneeId: chloe._id, priority: 'high', tags: ['design'] }),
    t(site, 'Choisir l’hébergeur', 'done', 1, { assigneeId: bob._id, tags: ['infra'] }),
    t(site, 'Intégrer le header et le footer', 'in_progress', 0, {
      assigneeId: chloe._id, priority: 'medium', tags: ['front'], dueDate: new Date(Date.now() + 3 * day),
      checklist: [{ text: 'Header desktop', done: true }, { text: 'Header mobile', done: false }, { text: 'Footer', done: false }],
      comments: [{ authorId: bob._id, authorName: 'Bob Durand', text: 'Pense à reprendre les couleurs de la charte.' }],
    }),
    t(site, 'Tunnel de paiement Stripe', 'todo', 0, { assigneeId: bob._id, priority: 'urgent', tags: ['back', 'paiement'], dueDate: new Date(Date.now() - 1 * day) }),
    t(site, 'Rédaction des pages légales', 'todo', 1, { priority: 'low', tags: ['contenu'] }),
    t(site, 'Optimisation SEO', 'review', 0, { assigneeId: alice._id, priority: 'medium', tags: ['seo'] }),
    t(app, 'Choix du framework (Flutter / React Native)', 'in_progress', 0, { assigneeId: bob._id, priority: 'high' }),
    t(app, 'Écran de connexion', 'todo', 0, { assigneeId: alice._id }),
  ]);

  // ---------- Globex (autre locataire, invisible pour Acme) ----------
  const globex = await Company.create({ name: 'Globex', slug: 'globex', settings: { defaultColumns: DEFAULT_COLUMNS } });
  const dave = await User.create({ companyId: globex._id, name: 'Dave Leroy', email: 'dave@globex.test', passwordHash: hash, role: 'owner', jobTitle: 'Directeur' });
  const crm = await Project.create({
    companyId: globex._id, name: 'Migration CRM', description: 'Données confidentielles de Globex.', color: '#10b981',
    memberIds: [dave._id], columns: DEFAULT_COLUMNS, createdBy: dave._id,
  });
  await Task.create([
    { companyId: globex._id, projectId: crm._id, title: 'Export des contacts', status: 'todo', position: 0, assigneeId: dave._id, reporterId: dave._id },
    { companyId: globex._id, projectId: crm._id, title: 'Audit RGPD', status: 'in_progress', position: 0, reporterId: dave._id, priority: 'high' },
  ]);
  return true;
}

module.exports = { seed, DEMO_PASSWORD };
