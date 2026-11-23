/* TaskFlow – front-end (SPA vanilla JS, aucune dépendance) */
(() => {
  'use strict';

  // ---------------------------------------------------------------- état
  const state = { token: null, user: null, company: null, users: [], projects: [] };
  try { state.token = localStorage.getItem('tf_token'); } catch { /* stockage indisponible */ }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const main = () => $('#main');

  const PRIORITY = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' };
  const ROLE = { owner: 'Propriétaire', admin: 'Admin', member: 'Membre' };
  const isAdmin = () => ['owner', 'admin'].includes(state.user?.role);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function colorFor(str) {
    let h = 0;
    for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 48%)`;
  }
  function initials(name) {
    return String(name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }
  function avatar(user, size = 26) {
    if (!user) return `<span class="avatar empty" style="width:${size}px;height:${size}px" title="Non assignée">?</span>`;
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:${colorFor(user.email || user.name)}" title="${esc(user.name)}">${esc(initials(user.name))}</span>`;
  }
  const userById = (id) => state.users.find((u) => u._id === id);
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '');
  const fmtDateTime = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const isLate = (t) => t.dueDate && !t.completedAt && new Date(t.dueDate) < new Date(new Date().toDateString());
  const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  function toast(msg, err = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast show${err ? ' err' : ''}`;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.className = 'toast'), 2600);
  }

  // ---------------------------------------------------------------- API
  async function api(method, url, body) {
    const res = await fetch(`/api${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && state.token) { logout(); throw new Error('Session expirée'); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }
  const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

  // ---------------------------------------------------------------- sécurité mot de passe
  function evaluatePassword(pwd) {
    const p = String(pwd || '');
    return {
      length: p.length >= 12,
      upper: /[A-Z]/.test(p),
      lower: /[a-z]/.test(p),
      digit: /[0-9]/.test(p),
      special: /[^A-Za-z0-9]/.test(p),
    };
  }

  function setupPasswordMeter(inputEl, containerEl) {
    if (!inputEl || !containerEl) return;
    const rulesDef = [
      { key: 'length', label: '12 caractères min.' },
      { key: 'upper', label: '1 majuscule' },
      { key: 'lower', label: '1 minuscule' },
      { key: 'digit', label: '1 chiffre' },
      { key: 'special', label: '1 symbole' },
    ];

    containerEl.className = 'pwd-feedback hidden';
    containerEl.innerHTML = `
      <div class="pwd-header">
        <span>Sécurité du mot de passe</span>
        <span class="pwd-status danger">Trop court</span>
      </div>
      <div class="pwd-meter"><div class="pwd-meter-bar lvl-0"></div></div>
      <ul class="pwd-rules">
        ${rulesDef.map((r) => `<li class="pwd-rule" data-rule="${r.key}"><span class="pwd-rule-icon">✕</span><span>${r.label}</span></li>`).join('')}
      </ul>
    `;

    const bar = $('.pwd-meter-bar', containerEl);
    const statusText = $('.pwd-status', containerEl);
    const ruleEls = Object.fromEntries(rulesDef.map((r) => [r.key, $(`[data-rule="${r.key}"]`, containerEl)]));

    const update = (forceVisible = false) => {
      const val = inputEl.value;
      if (!val && !forceVisible) {
        containerEl.classList.add('hidden');
        return;
      }
      containerEl.classList.remove('hidden');
      const evalRes = evaluatePassword(val);
      let passedCount = 0;
      for (const r of rulesDef) {
        const ok = evalRes[r.key];
        if (ok) passedCount++;
        const el = ruleEls[r.key];
        el.classList.toggle('valid', ok);
        $('.pwd-rule-icon', el).textContent = ok ? '✓' : '✕';
      }

      bar.className = `pwd-meter-bar lvl-${passedCount}`;
      if (passedCount === 5) {
        statusText.textContent = 'Conforme (100%)';
        statusText.className = 'pwd-status ok';
      } else if (passedCount >= 4) {
        statusText.textContent = 'Presque conforme';
        statusText.className = 'pwd-status info';
      } else if (passedCount >= 2) {
        statusText.textContent = 'Moyen';
        statusText.className = 'pwd-status warn';
      } else {
        statusText.textContent = val ? 'Trop faible' : 'En attente de saisie';
        statusText.className = 'pwd-status danger';
      }
    };

    inputEl.addEventListener('input', () => update(true));
    inputEl.addEventListener('focus', () => update(true));
    inputEl.addEventListener('blur', () => {
      if (!inputEl.value) containerEl.classList.add('hidden');
    });
    update(false);
  }

  const EYE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_OFF_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 2 20 20"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/></svg>`;

  function setupPasswordToggle(inputEl) {
    if (!inputEl || inputEl.dataset.hasToggle) return;
    inputEl.dataset.hasToggle = 'true';

    let wrap = inputEl.parentElement;
    if (!wrap.classList.contains('pwd-input-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'pwd-input-wrap';
      inputEl.parentNode.insertBefore(wrap, inputEl);
      wrap.appendChild(inputEl);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pwd-toggle-btn';
    btn.tabIndex = -1;
    btn.title = 'Afficher le mot de passe';
    btn.setAttribute('aria-label', 'Afficher le mot de passe');
    btn.innerHTML = EYE_OFF_ICON;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPwd = inputEl.type === 'password';
      inputEl.type = isPwd ? 'text' : 'password';
      btn.innerHTML = isPwd ? EYE_ICON : EYE_OFF_ICON;
      const label = isPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      inputEl.focus();
    });

    wrap.appendChild(btn);
  }

  // ---------------------------------------------------------------- temps réel (WebSockets)
  let socket = null;
  let wsRetryTimer = null;

  function initRealtime() {
    if (!state.token || (socket && socket.readyState === WebSocket.OPEN)) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws?token=${encodeURIComponent(state.token)}`;
    try {
      socket = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('[ws] connexion échouée :', e.message);
      return;
    }

    socket.addEventListener('open', () => {
      console.log('[ws] connecté au canal temps réel');
      if (currentBoard?._id) {
        socket.send(JSON.stringify({ type: 'subscribe:project', projectId: currentBoard._id }));
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleRealtimeEvent(msg);
      } catch {
        // message ignoré
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      if (state.token) {
        clearTimeout(wsRetryTimer);
        wsRetryTimer = setTimeout(initRealtime, 3000);
      }
    });
  }

  function closeRealtime() {
    clearTimeout(wsRetryTimer);
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  function handleRealtimeEvent(msg) {
    if (!msg || !msg.type) return;
    // Si l'utilisateur consulte le projet concerné
    if (currentBoard && String(msg.projectId) === String(currentBoard._id)) {
      if (['task:moved', 'task:created', 'task:updated', 'task:deleted'].includes(msg.type)) {
        loadBoardTasks();
      }
    }
  }

  // ---------------------------------------------------------------- auth
  function setSession({ token, user, company }) {
    state.token = token;
    state.user = user;
    state.company = company;
    try { localStorage.setItem('tf_token', token); } catch { /* ignore */ }
  }
  function logout() {
    closeRealtime();
    state.token = null; state.user = null;
    try { localStorage.removeItem('tf_token'); } catch { /* ignore */ }
    showAuth();
  }
  function showAuth() {
    $('#app-view').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
  }

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $('#login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
    $('#register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
    $('#auth-error').textContent = '';
  }));
  for (const [id, url] of [['#login-form', '/auth/login'], ['#register-form', '/auth/register']]) {
    $(id).addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#auth-error').textContent = '';
      try {
        setSession(await api('POST', url, Object.fromEntries(new FormData(e.target))));
        e.target.reset();
        location.hash = '#/dashboard';
        await boot();
      } catch (err) { $('#auth-error').textContent = err.message; }
    });
  }
  setupPasswordToggle($('#login-form input[name="password"]'));
  setupPasswordToggle($('#register-form input[name="password"]'));
  setupPasswordMeter($('#login-form input[name="password"]'), $('#login-pwd-feedback'));
  setupPasswordMeter($('#register-form input[name="password"]'), $('#register-pwd-feedback'));
  $('#logout-btn').addEventListener('click', logout);
  $('#me').addEventListener('click', () => openProfileModal());
  $('#new-project-btn').addEventListener('click', () => openProjectModal());

  // ---------------------------------------------------------------- shell
  async function loadShared() {
    [state.users, state.projects] = await Promise.all([api('GET', '/users'), api('GET', '/projects')]);
  }
  function renderShell() {
    $('#company-name').textContent = state.company?.name || '';
    $('#me').innerHTML = `${avatar(state.user)}<span>${esc(state.user.name)}<br><small class="muted">${ROLE[state.user.role]} · Mon profil</small></span>`;
    $('#me').title = 'Voir mon profil et modifier mon mot de passe';
    $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin()));
    $('#project-nav').innerHTML = state.projects.length
      ? state.projects.map((p) => `<a href="#/project/${p._id}" data-nav="project/${p._id}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</a>`).join('')
      : '<span class="muted" style="padding:6px 10px;font-size:12px">Aucun projet</span>';
    highlightNav();
  }
  function highlightNav() {
    const route = location.hash.replace(/^#\//, '');
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route));
  }

  async function boot() {
    if (!state.token) return showAuth();
    try {
      const me = await api('GET', '/auth/me');
      state.user = me.user; state.company = me.company;
      await loadShared();
    } catch { return showAuth(); }
    $('#auth-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    renderShell();
    initRealtime();
    route();
  }

  window.addEventListener('hashchange', () => state.user && route());
  function route() {
    highlightNav();
    const [view, id] = location.hash.replace(/^#\//, '').split('/');
    if (view !== 'project') {
      currentBoard = null;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'unsubscribe:project' }));
      }
    }
    const r = { dashboard: renderDashboard, mine: renderMine, team: renderTeam, company: renderCompany, project: () => renderBoard(id) }[view];
    safe(r || renderDashboard)();
  }

  // ---------------------------------------------------------------- tableau de bord
  async function renderDashboard() {
    const [company, mine, activity, archived] = await Promise.all([
      api('GET', '/company'), api('GET', '/tasks/mine'), api('GET', '/company/activity?limit=15'), api('GET', '/projects?status=archived'),
    ]);
    const s = company.stats;
    main().innerHTML = `
      <div class="page-head"><div><h1>Bonjour ${esc(state.user.name.split(' ')[0])} 👋</h1>
        <div class="desc muted">${esc(company.name)} · plan ${esc(company.plan)}</div></div></div>
      <div class="stats">
        ${[['Projets actifs', s.projects], ['Tâches ouvertes', s.openTasks], ['Tâches au total', s.tasks], ['Membres', s.users]]
          .map(([l, n]) => `<div class="card stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}
      </div>
      <div class="grid2">
        <div class="card"><h2>Projets</h2><div style="margin-top:8px">
          ${state.projects.map((p) => {
            const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
            return `<a class="list-item" href="#/project/${p._id}" style="color:inherit;text-decoration:none">
              <span class="dot" style="background:${esc(p.color)}"></span>
              <div style="flex:1"><div style="font-weight:600">${esc(p.name)}</div>
              <div class="progress" style="margin-top:6px"><div style="width:${pct}%"></div></div></div>
              <small class="muted">${p.doneCount}/${p.taskCount}</small></a>`;
          }).join('') || '<div class="empty-state">Aucun projet pour le moment.</div>'}
          ${archived.length ? `<div class="muted" style="font-size:12px;margin-top:12px">Archivés : ${archived.map((p) =>
            `<a href="#/project/${p._id}" style="color:inherit">${esc(p.name)}</a>`).join(', ')}</div>` : ''}
        </div></div>
        <div class="card"><h2>Mes tâches à venir</h2><div style="margin-top:8px">
          ${mine.slice(0, 8).map(taskListItem).join('') || '<div class="empty-state">Rien à faire, profitez-en ☕</div>'}
        </div></div>
      </div>
      <div class="card"><h2>Activité récente</h2><div style="margin-top:8px">
        ${activity.map(activityItem).join('') || '<div class="muted">Aucune activité.</div>'}
      </div></div>`;
    bindTaskListItems(mine);
  }

  function taskListItem(t) {
    const col = t.project?.columns?.find((c) => c.key === t.status);
    return `<div class="list-item" data-task="${t._id}">
      <span class="dot" style="background:${esc(t.project?.color || '#999')}"></span>
      <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(t.title)}</div>
        <small class="muted">${esc(t.project?.name || '')} · ${esc(col?.label || t.status)}</small></div>
      <span class="badge ${t.priority}">${PRIORITY[t.priority]}</span>
      ${t.dueDate ? `<small class="due ${isLate(t) ? 'late' : ''}">📅 ${fmtDate(t.dueDate)}</small>` : ''}
    </div>`;
  }
  function bindTaskListItems(tasks) {
    $$('[data-task]', main()).forEach((el) => el.addEventListener('click', safe(async () => {
      const t = tasks.find((x) => x._id === el.dataset.task);
      const project = await api('GET', `/projects/${t.projectId}`);
      openTaskModal(project, t, route);
    })));
  }

  const ACTIONS = {
    'task.created': 'a créé la tâche', 'task.updated': 'a modifié la tâche', 'task.deleted': 'a supprimé la tâche',
    'task.moved': 'a déplacé la tâche', 'task.commented': 'a commenté la tâche', 'project.created': 'a créé le projet',
    'project.updated': 'a modifié le projet', 'project.deleted': 'a supprimé le projet', 'user.created': 'a ajouté',
    'user.updated': 'a modifié le profil de', 'user.deleted': 'a supprimé', 'company.updated': "a modifié l'entreprise",
  };
  function activityItem(a) {
    const d = a.details || {};
    const target = d.title || d.name || '';
    const move = a.action === 'task.moved' ? ` de <b>${esc(d.from)}</b> vers <b>${esc(d.to)}</b>` : '';
    return `<div class="activity"><b>${esc(a.actorName)}</b> ${ACTIONS[a.action] || esc(a.action)} ${target ? `« ${esc(target)} »` : ''}${move}
      <time>${fmtDateTime(a.createdAt)}</time></div>`;
  }

  // ---------------------------------------------------------------- mes tâches
  async function renderMine() {
    const tasks = await api('GET', '/tasks/mine');
    main().innerHTML = `<div class="page-head"><h1>Mes tâches</h1></div>
      <div class="card">${tasks.map(taskListItem).join('') || '<div class="empty-state">Aucune tâche ouverte ne vous est assignée.</div>'}</div>`;
    bindTaskListItems(tasks);
  }

  // ---------------------------------------------------------------- Kanban
  const boardFilters = { q: '', assigneeId: '', priority: '' };
  let currentBoard = null;

  async function renderBoard(projectId) {
    const project = await api('GET', `/projects/${projectId}`);
    currentBoard = project;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'subscribe:project', projectId }));
    }
    main().innerHTML = `
      <div class="page-head">
        <span class="dot" style="background:${esc(project.color)};width:14px;height:14px;margin-top:5px"></span>
        <div style="flex:1;min-width:200px"><h1>${esc(project.name)}</h1>
          ${project.description ? `<div class="desc muted">${esc(project.description)}</div>` : ''}</div>
        <div class="row">
          <div class="row" style="gap:0">${project.members.slice(0, 6).map((m) => `<span style="margin-left:-6px">${avatar(m)}</span>`).join('')}</div>
          <button class="btn small" id="activity-btn">Activité</button>
          ${isAdmin() ? '<button class="btn small" id="edit-project-btn">Paramètres</button>' : ''}
        </div>
      </div>
      <div class="filters">
        <input id="f-q" placeholder="🔎 Rechercher une tâche" value="${esc(boardFilters.q)}" />
        <select id="f-assignee"><option value="">Tous les membres</option><option value="none">Non assignées</option>
          ${project.members.map((m) => `<option value="${m._id}">${esc(m.name)}</option>`).join('')}</select>
        <select id="f-priority"><option value="">Toutes priorités</option>
          ${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </div>
      <div class="board" id="board"></div>`;
    $('#f-assignee').value = boardFilters.assigneeId;
    $('#f-priority').value = boardFilters.priority;
    let deb;
    $('#f-q').addEventListener('input', (e) => { clearTimeout(deb); deb = setTimeout(() => { boardFilters.q = e.target.value; safe(loadBoardTasks)(); }, 250); });
    $('#f-assignee').addEventListener('change', (e) => { boardFilters.assigneeId = e.target.value; safe(loadBoardTasks)(); });
    $('#f-priority').addEventListener('change', (e) => { boardFilters.priority = e.target.value; safe(loadBoardTasks)(); });
    $('#edit-project-btn')?.addEventListener('click', () => openProjectModal(project));
    $('#activity-btn').addEventListener('click', safe(async () => {
      const items = await api('GET', `/projects/${project._id}/activity`);
      modal(`<div class="modal-head"><h2>Activité du projet</h2><span class="spacer"></span><button class="icon-btn" data-close>✕</button></div>
        ${items.map(activityItem).join('') || '<div class="muted">Aucune activité.</div>'}`);
    }));
    await loadBoardTasks();
  }

  async function loadBoardTasks() {
    const project = currentBoard;
    const qs = new URLSearchParams(Object.entries(boardFilters).filter(([, v]) => v)).toString();
    const tasks = await api('GET', `/projects/${project._id}/tasks${qs ? `?${qs}` : ''}`);
    const members = Object.fromEntries(project.members.map((m) => [m._id, m]));
    const board = $('#board');
    board.innerHTML = project.columns.map((c) => {
      const colTasks = tasks.filter((t) => t.status === c.key).sort((a, b) => a.position - b.position);
      return `<div class="column" data-status="${esc(c.key)}">
        <div class="col-head"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.label)}<span class="count">${colTasks.length}</span></div>
        <div class="col-body" data-status="${esc(c.key)}">${colTasks.map((t) => taskCard(t, members)).join('')}</div>
        <button class="add-task" data-status="${esc(c.key)}">＋ Ajouter une tâche</button>
      </div>`;
    }).join('');

    $$('.task-card', board).forEach((card) => {
      card.addEventListener('click', () => openTaskModal(project, tasks.find((t) => t._id === card.dataset.id), loadBoardTasks));
      card.addEventListener('dragstart', (e) => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', card.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    $$('.add-task', board).forEach((b) => b.addEventListener('click', () => openTaskModal(project, { status: b.dataset.status }, loadBoardTasks)));
    $$('.col-body', board).forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
        const dragging = $('.task-card.dragging');
        if (!dragging) return;
        const after = dropTarget(col, e.clientY);
        if (after) col.insertBefore(dragging, after); else col.appendChild(dragging);
      });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', safe(async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const index = $$('.task-card', col).findIndex((c) => c.dataset.id === id);
        await api('PATCH', `/tasks/${id}/move`, { status: col.dataset.status, index: Math.max(index, 0) });
        await loadBoardTasks();
      }));
    });
  }
  function dropTarget(col, y) {
    return $$('.task-card:not(.dragging)', col).find((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
  }
  function taskCard(t, members) {
    const done = t.checklist?.filter((i) => i.done).length || 0;
    return `<div class="task-card p-${t.priority}" draggable="true" data-id="${t._id}">
      ${t.tags?.length ? `<div class="tags">${t.tags.map((g) => `<span class="tag">${esc(g)}</span>`).join('')}</div>` : ''}
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        <span class="badge ${t.priority}">${PRIORITY[t.priority]}</span>
        ${t.dueDate ? `<span class="due ${isLate(t) ? 'late' : ''}">📅 ${fmtDate(t.dueDate)}</span>` : ''}
        ${t.checklist?.length ? `<span>☑ ${done}/${t.checklist.length}</span>` : ''}
        ${t.comments?.length ? `<span>💬 ${t.comments.length}</span>` : ''}
        <span class="spacer"></span>${avatar(members[t.assigneeId])}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- modales
  function modal(html, { wide = false } = {}) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="overlay"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
    const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    $('.overlay', root).addEventListener('mousedown', (e) => e.target.classList.contains('overlay') && close());
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', close));
    return { el: $('.modal', root), close };
  }

  function openTaskModal(project, task, onChange) {
    const isNew = !task._id;
    let checklist = (task.checklist || []).map((i) => ({ ...i }));
    const members = project.members || [];
    const { el, close } = modal(`
      <div class="modal-head"><h2>${isNew ? 'Nouvelle tâche' : 'Tâche'}</h2><span class="spacer"></span><button class="icon-btn" data-close>✕</button></div>
      <form class="stack" id="task-form">
        <label>Titre<input name="title" required maxlength="200" value="${esc(task.title)}" /></label>
        <label>Description<textarea name="description" maxlength="5000">${esc(task.description)}</textarea></label>
        <div class="grid2">
          <label>Statut<select name="status">${project.columns.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')}</select></label>
          <label>Priorité<select name="priority">${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Assignée à<select name="assigneeId"><option value="">— Personne —</option>
            ${members.map((m) => `<option value="${m._id}">${esc(m.name)}</option>`).join('')}</select></label>
          <label>Échéance<input type="date" name="dueDate" value="${toInputDate(task.dueDate)}" /></label>
        </div>
        <label>Étiquettes (séparées par des virgules)<input name="tags" value="${esc((task.tags || []).join(', '))}" placeholder="front, bug, client" /></label>
        <div><div style="font-weight:500;font-size:13px;margin-bottom:6px">Checklist</div>
          <div class="stack" id="checklist" style="gap:6px"></div>
          <button type="button" class="btn small ghost" id="add-check" style="margin-top:6px">＋ Élément</button></div>
        <div class="modal-foot">
          ${!isNew ? '<button type="button" class="btn danger" id="del-task">Supprimer</button><span class="spacer"></span>' : ''}
          <button type="button" class="btn" data-close>Annuler</button>
          <button class="btn primary" type="submit">${isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>
      ${!isNew ? `<hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
        <h2 style="margin-bottom:10px">Commentaires</h2>
        <div class="stack" id="comments" style="gap:8px"></div>
        <form id="comment-form" class="row" style="margin-top:10px"><input name="text" placeholder="Écrire un commentaire…" style="flex:1" required /><button class="btn">Envoyer</button></form>` : ''}
    `, { wide: true });
    const f = $('#task-form', el);
    f.status.value = task.status || project.columns[0].key;
    f.priority.value = task.priority || 'medium';
    f.assigneeId.value = task.assigneeId || '';

    const renderChecklist = () => {
      $('#checklist', el).innerHTML = checklist.map((i, idx) => `<div class="checklist-item">
        <input type="checkbox" data-i="${idx}" ${i.done ? 'checked' : ''} /><input type="text" data-t="${idx}" value="${esc(i.text)}" />
        <button type="button" class="icon-btn" data-rm="${idx}">✕</button></div>`).join('');
      $$('[data-i]', el).forEach((c) => c.addEventListener('change', () => (checklist[c.dataset.i].done = c.checked)));
      $$('[data-t]', el).forEach((c) => c.addEventListener('input', () => (checklist[c.dataset.t].text = c.value)));
      $$('[data-rm]', el).forEach((c) => c.addEventListener('click', () => { checklist.splice(c.dataset.rm, 1); renderChecklist(); }));
    };
    renderChecklist();
    $('#add-check', el).addEventListener('click', () => { checklist.push({ text: '', done: false }); renderChecklist(); $$('[data-t]', el).pop().focus(); });

    f.addEventListener('submit', safe(async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const body = {
        title: d.title, description: d.description, status: d.status, priority: d.priority,
        assigneeId: d.assigneeId || null, dueDate: d.dueDate || null,
        tags: d.tags.split(',').map((s) => s.trim()).filter(Boolean),
        checklist: checklist.filter((i) => i.text.trim()).map(({ text, done }) => ({ text, done })),
      };
      if (isNew) await api('POST', `/projects/${project._id}/tasks`, body);
      else await api('PUT', `/tasks/${task._id}`, body);
      close();
      toast(isNew ? 'Tâche créée' : 'Tâche enregistrée');
      await onChange();
    }));

    if (!isNew) {
      $('#del-task', el).addEventListener('click', safe(async () => {
        if (!confirm('Supprimer définitivement cette tâche ?')) return;
        await api('DELETE', `/tasks/${task._id}`);
        close(); toast('Tâche supprimée'); await onChange();
      }));
      const renderComments = (t) => {
        $('#comments', el).innerHTML = (t.comments || []).map((c) => `<div class="comment">
          <div class="who">${esc(c.authorName)} <time>${fmtDateTime(c.createdAt)}</time>
          ${c.authorId === state.user._id || isAdmin() ? `<span class="spacer"></span><button class="icon-btn" data-dc="${c._id}" title="Supprimer">✕</button>` : ''}</div>
          <div style="white-space:pre-wrap">${esc(c.text)}</div></div>`).join('') || '<div class="muted">Aucun commentaire.</div>';
        $$('[data-dc]', el).forEach((b) => b.addEventListener('click', safe(async () => {
          renderComments(await api('DELETE', `/tasks/${t._id}/comments/${b.dataset.dc}`));
        })));
      };
      renderComments(task);
      $('#comment-form', el).addEventListener('submit', safe(async (e) => {
        e.preventDefault();
        const updated = await api('POST', `/tasks/${task._id}/comments`, { text: e.target.text.value });
        e.target.reset();
        renderComments(updated);
        onChange();
      }));
    }
  }

  function openProjectModal(project) {
    const isNew = !project;
    project = project || { name: '', description: '', color: '#6366f1', memberIds: [state.user._id], columns: null };
    let columns = (project.columns || [
      { key: 'todo', label: 'À faire', color: '#94a3b8' }, { key: 'in_progress', label: 'En cours', color: '#3b82f6' },
      { key: 'review', label: 'En revue', color: '#f59e0b' }, { key: 'done', label: 'Terminé', color: '#10b981' },
    ]).map((c) => ({ ...c }));
    const { el, close } = modal(`
      <div class="modal-head"><h2>${isNew ? 'Nouveau projet' : 'Paramètres du projet'}</h2><span class="spacer"></span><button class="icon-btn" data-close>✕</button></div>
      <form class="stack" id="project-form">
        <div class="row" style="align-items:flex-end">
          <label style="flex:1">Nom<input name="name" required maxlength="120" value="${esc(project.name)}" /></label>
          <label>Couleur<input type="color" name="color" value="${esc(project.color)}" style="width:56px;height:38px;padding:2px" /></label>
        </div>
        <label>Description<textarea name="description" maxlength="2000">${esc(project.description)}</textarea></label>
        ${!isNew ? `<label>État<select name="status"><option value="active">Actif</option><option value="archived">Archivé</option></select></label>` : ''}
        <div class="grid2">
          <label>Début<input type="date" name="startDate" value="${toInputDate(project.startDate)}" /></label>
          <label>Fin prévue<input type="date" name="endDate" value="${toInputDate(project.endDate)}" /></label>
        </div>
        <div><div style="font-weight:500;font-size:13px;margin-bottom:6px">Membres du projet</div>
          <div class="member-pick">${state.users.filter((u) => u.active !== false).map((u) => `<label>
            <input type="checkbox" name="members" value="${u._id}" ${project.memberIds.includes(u._id) ? 'checked' : ''} />
            ${avatar(u, 22)} <span>${esc(u.name)}</span></label>`).join('')}</div></div>
        <div><div style="font-weight:500;font-size:13px;margin-bottom:6px">Colonnes du Kanban (la dernière = « terminé »)</div>
          <div class="stack" id="cols" style="gap:6px"></div>
          <button type="button" class="btn small ghost" id="add-col" style="margin-top:6px">＋ Colonne</button></div>
        <div class="modal-foot">
          ${!isNew ? '<button type="button" class="btn danger" id="del-project">Supprimer le projet</button><span class="spacer"></span>' : ''}
          <button type="button" class="btn" data-close>Annuler</button>
          <button class="btn primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>`, { wide: true });

    const renderCols = () => {
      $('#cols', el).innerHTML = columns.map((c, i) => `<div class="col-editor">
        <input type="color" data-cc="${i}" value="${esc(c.color || '#94a3b8')}" />
        <input type="text" data-cl="${i}" value="${esc(c.label)}" required />
        <button type="button" class="icon-btn" data-up="${i}" title="Monter">↑</button>
        <button type="button" class="icon-btn" data-crm="${i}" title="Supprimer">✕</button></div>`).join('');
      $$('[data-cc]', el).forEach((x) => x.addEventListener('input', () => (columns[x.dataset.cc].color = x.value)));
      $$('[data-cl]', el).forEach((x) => x.addEventListener('input', () => (columns[x.dataset.cl].label = x.value)));
      $$('[data-crm]', el).forEach((x) => x.addEventListener('click', () => { columns.splice(x.dataset.crm, 1); renderCols(); }));
      $$('[data-up]', el).forEach((x) => x.addEventListener('click', () => {
        const i = +x.dataset.up; if (!i) return;
        [columns[i - 1], columns[i]] = [columns[i], columns[i - 1]]; renderCols();
      }));
    };
    renderCols();
    if (!isNew) $('#project-form', el).status.value = project.status || 'active';
    $('#add-col', el).addEventListener('click', () => { columns.push({ label: 'Nouvelle colonne', color: '#94a3b8' }); renderCols(); });

    $('#project-form', el).addEventListener('submit', safe(async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get('name'), description: fd.get('description'), color: fd.get('color'),
        startDate: fd.get('startDate') || null, endDate: fd.get('endDate') || null,
        memberIds: fd.getAll('members'), columns,
      };
      if (fd.get('status')) body.status = fd.get('status');
      const saved = isNew ? await api('POST', '/projects', body) : await api('PUT', `/projects/${project._id}`, body);
      close();
      toast(isNew ? 'Projet créé' : 'Projet mis à jour');
      await loadShared(); renderShell();
      if (location.hash === `#/project/${saved._id}`) route(); else location.hash = `#/project/${saved._id}`;
    }));
    $('#del-project', el)?.addEventListener('click', safe(async () => {
      if (!confirm(`Supprimer le projet « ${project.name} » et toutes ses tâches ?`)) return;
      await api('DELETE', `/projects/${project._id}`);
      close(); toast('Projet supprimé');
      await loadShared(); renderShell(); location.hash = '#/dashboard';
    }));
  }

  // ---------------------------------------------------------------- équipe
  async function renderTeam() {
    state.users = await api('GET', '/users');
    main().innerHTML = `
      <div class="page-head"><div style="flex:1"><h1>Équipe</h1><div class="desc muted">${state.users.length} membre(s) dans ${esc(state.company.name)}</div></div>
        ${isAdmin() ? '<button class="btn primary" id="add-user">＋ Ajouter un membre</button>' : ''}</div>
      <div class="card" style="overflow-x:auto"><table>
        <thead><tr><th></th><th>Nom</th><th>E-mail</th><th>Poste</th><th>Rôle</th><th>Projets</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
        <tbody>${state.users.map((u) => {
          const nb = state.projects.filter((p) => p.memberIds.includes(u._id)).length;
          return `<tr style="${u.active === false ? 'opacity:.5' : ''}"><td>${avatar(u)}</td><td><b>${esc(u.name)}</b>${u.active === false ? ' <small class="muted">(désactivé)</small>' : ''}</td>
            <td>${esc(u.email)}</td><td>${esc(u.jobTitle || '')}</td><td><span class="role ${u.role}">${ROLE[u.role]}</span></td><td>${nb}</td>
            ${isAdmin() ? `<td style="text-align:right">${u.role !== 'owner' || state.user.role === 'owner' ? `<button class="btn small" data-edit="${u._id}">Modifier</button>` : ''}</td>` : ''}</tr>`;
        }).join('')}</tbody></table></div>`;
    $('#add-user')?.addEventListener('click', () => openUserModal());
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openUserModal(userById(b.dataset.edit))));
  }

  function openUserModal(user) {
    const isNew = !user;
    user = user || { name: '', email: '', role: 'member', jobTitle: '', active: true };
    const canRole = state.user.role === 'owner' && user.role !== 'owner';
    const { el, close } = modal(`
      <div class="modal-head"><h2>${isNew ? 'Ajouter un membre' : 'Modifier le membre'}</h2><span class="spacer"></span><button class="icon-btn" data-close>✕</button></div>
      <form class="stack" id="user-form">
        <div class="grid2">
          <label>Nom<input name="name" required value="${esc(user.name)}" /></label>
          <label>E-mail<input name="email" type="email" required value="${esc(user.email)}" /></label>
          <label>Poste<input name="jobTitle" value="${esc(user.jobTitle || '')}" /></label>
          <label>Rôle<select name="role" ${canRole || isNew ? '' : 'disabled'}>
            <option value="member">Membre</option>${state.user.role === 'owner' ? '<option value="admin">Admin</option>' : ''}
            ${user.role === 'owner' ? '<option value="owner">Propriétaire</option>' : ''}</select></label>
        </div>
        <label>${isNew ? 'Mot de passe initial (12 carac. min.)' : 'Nouveau mot de passe (12 carac. min. ou laisser vide)'}
          <input name="password" type="password" minlength="12" ${isNew ? 'required' : ''} autocomplete="new-password" /></label>
        <div class="pwd-feedback" id="user-pwd-feedback"></div>
        ${!isNew && user._id !== state.user._id && user.role !== 'owner' ? `<label style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" name="active" style="width:auto" ${user.active !== false ? 'checked' : ''} /> Compte actif</label>` : ''}
        <div class="modal-foot">
          ${!isNew && user.role !== 'owner' && user._id !== state.user._id ? '<button type="button" class="btn danger" id="del-user">Supprimer</button><span class="spacer"></span>' : ''}
          <button type="button" class="btn" data-close>Annuler</button><button class="btn primary">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
        </div>
      </form>`);
    const f = $('#user-form', el);
    f.role.value = user.role;
    setupPasswordToggle(f.password);
    setupPasswordMeter(f.password, $('#user-pwd-feedback', el));
    f.addEventListener('submit', safe(async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const body = { name: d.name, email: d.email, jobTitle: d.jobTitle };
      if (!f.role.disabled) body.role = f.role.value;
      if (d.password) body.password = d.password;
      if (f.active) body.active = f.active.checked;
      if (isNew) await api('POST', '/users', body); else await api('PUT', `/users/${user._id}`, body);
      close(); toast('Membre enregistré'); await loadShared(); renderTeam();
    }));
    $('#del-user', el)?.addEventListener('click', safe(async () => {
      if (!confirm(`Supprimer ${user.name} ? Ses tâches seront désassignées.`)) return;
      await api('DELETE', `/users/${user._id}`);
      close(); toast('Membre supprimé'); await loadShared(); renderTeam();
    }));
  }

  // ---------------------------------------------------------------- profil utilisateur
  function openProfileModal() {
    const u = state.user;
    const { el, close } = modal(`
      <div class="modal-head"><h2>Mon profil</h2><span class="spacer"></span><button class="icon-btn" data-close>✕</button></div>
      <form class="stack" id="profile-form">
        <div class="row" style="gap:12px;padding:6px 0 10px;border-bottom:1px solid var(--border)">
          ${avatar(u, 40)}
          <div style="min-width:0;flex:1">
            <div style="font-weight:700;font-size:15px">${esc(u.name)} <span class="role ${u.role}">${ROLE[u.role]}</span></div>
            <div class="muted" style="font-size:12px">${esc(u.email)} · ${esc(state.company?.name || '')}</div>
          </div>
        </div>
        <div class="grid2">
          <label>Nom complet<input name="name" required value="${esc(u.name)}" /></label>
          <label>Poste / Fonction<input name="jobTitle" value="${esc(u.jobTitle || '')}" placeholder="ex. Développeur Full-Stack" /></label>
        </div>

        <div style="margin-top:4px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">Modifier mon mot de passe</div>
          <div class="muted" style="font-size:12px;margin-bottom:10px">Laissez vide si vous ne souhaitez pas modifier votre mot de passe.</div>
          <div class="stack" style="gap:10px">
            <label>Mot de passe actuel
              <input name="currentPassword" type="password" autocomplete="current-password" placeholder="Mot de passe actuel" />
            </label>
            <label>Nouveau mot de passe (12 carac. min.)
              <input name="newPassword" type="password" minlength="12" autocomplete="new-password" placeholder="12+ carac., majuscule, chiffre, symbole" />
            </label>
            <div class="pwd-feedback" id="profile-pwd-feedback"></div>
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn" data-close>Annuler</button>
          <button class="btn primary" type="submit">Enregistrer les modifications</button>
        </div>
      </form>`);

    const f = $('#profile-form', el);
    setupPasswordToggle(f.currentPassword);
    setupPasswordToggle(f.newPassword);
    setupPasswordMeter(f.newPassword, $('#profile-pwd-feedback', el));

    f.addEventListener('submit', safe(async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const name = fd.get('name').trim();
      const jobTitle = fd.get('jobTitle').trim();
      const currentPassword = fd.get('currentPassword');
      const newPassword = fd.get('newPassword');

      const body = { name, jobTitle };
      if (newPassword) {
        if (!currentPassword) {
          throw new Error('Veuillez renseigner votre mot de passe actuel pour définir un nouveau mot de passe');
        }
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const updated = await api('PUT', '/auth/me', body);
      state.user = { ...state.user, ...updated };
      close();
      toast('Profil mis à jour avec succès');
      renderShell();
      if (location.hash === '#/team') renderTeam();
    }));
  }

  // ---------------------------------------------------------------- entreprise
  async function renderCompany() {
    if (!isAdmin()) { location.hash = '#/dashboard'; return; }
    const c = await api('GET', '/company');
    main().innerHTML = `
      <div class="page-head"><h1>Entreprise</h1></div>
      <div class="card"><form class="stack" id="company-form" style="max-width:480px">
        <label>Nom de l'entreprise<input name="name" required value="${esc(c.name)}" /></label>
        <label>Plan<select name="plan"><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
        <div class="muted" style="font-size:12px">Identifiant : <code>${esc(c.slug)}</code> · créée le ${new Date(c.createdAt).toLocaleDateString('fr-FR')}</div>
        <div><button class="btn primary">Enregistrer</button></div>
      </form></div>
      ${state.user.role === 'owner' ? `<div class="card" style="border-color:color-mix(in srgb, var(--danger) 40%, var(--border))">
        <h2 style="color:var(--danger)">Zone de danger</h2>
        <p class="muted">Supprimer l'entreprise efface définitivement tous ses projets, tâches et utilisateurs.</p>
        <button class="btn danger" id="del-company">Supprimer l'entreprise</button></div>` : ''}`;
    $('#company-form').plan.value = c.plan;
    $('#company-form').addEventListener('submit', safe(async (e) => {
      e.preventDefault();
      state.company = await api('PUT', '/company', Object.fromEntries(new FormData(e.target)));
      renderShell(); toast('Entreprise mise à jour');
    }));
    $('#del-company')?.addEventListener('click', safe(async () => {
      const v = prompt('Tapez SUPPRIMER pour confirmer la suppression définitive :');
      if (v !== 'SUPPRIMER') return;
      await api('DELETE', '/company', { confirm: 'SUPPRIMER' });
      logout(); toast('Entreprise supprimée');
    }));
  }

  boot();
})();
