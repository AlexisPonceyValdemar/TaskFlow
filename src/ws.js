const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Extraction du jeton depuis la query string (?token=...)
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentification requise');
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret);
      ws.userId = String(payload.sub);
      ws.companyId = String(payload.companyId);
      ws.role = payload.role;
      ws.currentProjectId = null;
    } catch {
      ws.close(4001, 'Session expirée ou invalide');
      return;
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'subscribe:project') {
          ws.currentProjectId = msg.projectId ? String(msg.projectId) : null;
        } else if (msg.type === 'unsubscribe:project') {
          ws.currentProjectId = null;
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // Message non JSON ignoré silencieusement
      }
    });

    ws.on('error', (err) => {
      console.warn('[ws] erreur socket :', err.message);
    });
  });

  // Heartbeat pour purger les connexions silencieusement interrompues
  const interval = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('[ws] serveur WebSocket initialisé sur /ws');
  return wss;
}

/**
 * Diffuse un événement temps réel aux clients connectés de la même entreprise.
 * Garantit l'étanchéité multi-tenant absolue.
 *
 * @param {string|import('mongoose').Types.ObjectId} companyId
 * @param {string} event - ex: 'task.moved', 'task.created', 'task.updated', 'task.deleted'
 * @param {object} payload
 * @param {object} [options]
 * @param {string|import('mongoose').Types.ObjectId} [options.projectId] - Filtrage par projet
 * @param {string|import('mongoose').Types.ObjectId} [options.excludeUserId] - Ne pas renvoyer à l'émetteur
 */
function broadcast(companyId, event, payload = {}, { projectId = null, excludeUserId = null } = {}) {
  if (!wss) return;
  const targetCompany = String(companyId);
  const targetProject = projectId ? String(projectId) : null;
  const excludeUser = excludeUserId ? String(excludeUserId) : null;

  const msg = JSON.stringify({ type: event, data: payload, projectId: targetProject });

  for (const client of wss.clients) {
    if (client.readyState === 1 && client.companyId === targetCompany) {
      if (excludeUser && client.userId === excludeUser) continue;
      if (targetProject && client.currentProjectId && client.currentProjectId !== targetProject) continue;
      client.send(msg);
    }
  }
}

module.exports = { initWebSocket, broadcast };
