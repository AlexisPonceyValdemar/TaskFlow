const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const { connect } = require('./db');
const { auth, HttpError } = require('./lib');
const { seed } = require('./seed');
const { initWebSocket } = require('./ws');

const app = express();
const server = http.createServer(app);
initWebSocket(server);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Santé (utilisée par le healthcheck Docker)
app.get('/api/health', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'db-unavailable' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/company', auth, require('./routes/company'));
app.use('/api/users', auth, require('./routes/users'));
app.use('/api/projects', auth, require('./routes/projects'));
app.use('/api', auth, require('./routes/tasks'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Front-end (SPA statique)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Gestion centralisée des erreurs
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: `Valeur invalide pour ${err.path}` });
  if (err.code === 11000) return res.status(409).json({ error: 'Doublon : cette valeur existe déjà' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
  console.error(err);
  res.status(500).json({ error: 'Erreur interne' });
});

(async () => {
  try {
    await connect();
    if (config.seedDemo && (await seed())) console.log('[seed] données de démonstration créées');
    server.listen(config.port, () => console.log(`[app] TaskFlow écoute sur le port ${config.port}`));
  } catch (err) {
    console.error('[app] démarrage impossible :', err.message);
    process.exit(1);
  }
})();

const shutdown = async () => {
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
