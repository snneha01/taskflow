// ===== STATE =====
let currentUser = null;
let token = localStorage.getItem('tf_token');
let currentProjectId = null;
let currentProjectTab = 'board';
let allProjects = [];
let allTasks = [];
let taskDetailCurrent = null;

const API = '/api';

// ===== API HELPER =====
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
  if (token) {
    try {
      const data = await api('GET', '/auth/me');
      currentUser = data.user;
      showApp();
    } catch {
      token = null;
      localStorage.removeItem('tf_token');
      showAuth();
    }
  } else {
    showAuth();
  }
});

function showAuth() {
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('authContainer').style.display = 'block';
  document.getElementById('appContainer').style.display = 'none';
  showPage('login');
}

function showApp() {
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  updateSidebar();
  navigateTo('dashboard');
}

// ===== AUTH =====
function showPage(page) {
  document.getElementById('loginPage').style.display = page === 'login' ? 'flex' : 'none';
  document.getElementById('signupPage').style.display = page === 'signup' ? 'flex' : 'none';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  err.textContent = '';
  if (!email || !password) { err.textContent = 'Please fill in all fields'; return; }
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Signing in...';
  try {
    const data = await api('POST', '/auth/login', { email, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('tf_token', token);
    showApp();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const err = document.getElementById('signupError');
  const btn = document.getElementById('signupBtn');
  err.textContent = '';
  if (!name || !email || !password) { err.textContent = 'Please fill in all fields'; return; }
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Creating...';
  try {
    const data = await api('POST', '/auth/signup', { name, email, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('tf_token', token);
    showApp();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('tf_token');
  showAuth();
}

// ===== SIDEBAR =====
function updateSidebar() {
  if (!currentUser) return;
  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarAvatar').src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=6c63ff&color=fff`;
  const roleEl = document.getElementById('sidebarRole');
  roleEl.textContent = currentUser.role;
  roleEl.className = `role-badge ${currentUser.role}`;
  document.getElementById('adminNav').style.display = currentUser.role === 'admin' ? 'flex' : 'none';
}

// ===== NAVIGATION =====
function navigateTo(page, projectId = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  if (page === 'project-detail') {
    document.getElementById('page-project-detail').classList.add('active');
    currentProjectId = projectId;
    loadProjectDetail(projectId);
    return;
  }

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'projects': loadProjects(); break;
    case 'tasks': loadTasks(); break;
    case 'team': loadTeam(); break;
    case 'admin': loadAdmin(); break;
    case 'profile': loadProfile(); break;
  }
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const data = await api('GET', '/dashboard');
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('dashboardGreeting').textContent = `${greeting}, ${currentUser.name.split(' ')[0]}! 👋`;

    // Stats
    const s = data.summary;
    document.getElementById('dashboardStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📁</div>
        <div class="stat-label">Projects</div>
        <div class="stat-value">${s.totalProjects}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-label">Total Tasks</div>
        <div class="stat-value">${s.totalTasks}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👤</div>
        <div class="stat-label">My Tasks</div>
        <div class="stat-value">${s.myTasks}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-label">Overdue</div>
        <div class="stat-value" style="color:${s.overdueTasks > 0 ? 'var(--red)' : 'inherit'}">${s.overdueTasks}</div>
      </div>
    `;

    // Status chart
    const sc = data.statusCounts;
    const totalS = Object.values(sc).reduce((a, b) => a + b, 0) || 1;
    document.getElementById('statusChart').innerHTML = [
      ['Todo', sc.todo, '#94a3b8'],
      ['In Progress', sc.in_progress, 'var(--blue)'],
      ['Review', sc.review, 'var(--yellow)'],
      ['Done', sc.done, 'var(--green)'],
    ].map(([label, val, color]) => `
      <div class="chart-bar">
        <div class="chart-bar-label">${label}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width:${(val/totalS*100).toFixed(0)}%;background:${color}">${val > 0 ? val : ''}</div>
        </div>
        <div class="chart-bar-value">${val}</div>
      </div>
    `).join('');

    // Priority chart
    const pc = data.priorityCounts;
    const totalP = Object.values(pc).reduce((a, b) => a + b, 0) || 1;
    document.getElementById('priorityChart').innerHTML = [
      ['Critical', pc.critical, 'var(--red)'],
      ['High', pc.high, 'var(--orange)'],
      ['Medium', pc.medium, 'var(--yellow)'],
      ['Low', pc.low, 'var(--green)'],
    ].map(([label, val, color]) => `
      <div class="chart-bar">
        <div class="chart-bar-label">${label}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width:${(val/totalP*100).toFixed(0)}%;background:${color}">${val > 0 ? val : ''}</div>
        </div>
        <div class="chart-bar-value">${val}</div>
      </div>
    `).join('');

    // Overdue
    document.getElementById('overdueList').innerHTML = data.overdueTasks.length
      ? data.overdueTasks.map(t => `
        <div class="activity-item" onclick="openTaskDetail('${t.id}')" style="cursor:pointer">
          <div class="activity-content">
            <div style="font-weight:600;font-size:13px">${esc(t.title)}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(t.project_name || '')} • Due ${formatDate(t.due_date)}</div>
          </div>
          <span class="overdue-tag">Overdue</span>
        </div>
      `).join('')
      : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px">🎉 No overdue tasks!</div>';

    // Upcoming
    document.getElementById('upcomingList').innerHTML = data.upcomingTasks.length
      ? data.upcomingTasks.map(t => `
        <div class="activity-item" onclick="openTaskDetail('${t.id}')" style="cursor:pointer">
          <div class="activity-content">
            <div style="font-weight:600;font-size:13px">${esc(t.title)}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(t.project_name || '')} • Due ${formatDate(t.due_date)}</div>
          </div>
          <span class="due-soon">${daysUntil(t.due_date)}d</span>
        </div>
      `).join('')
      : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px">No upcoming deadlines</div>';

    // Project progress
    document.getElementById('projectProgress').innerHTML = data.projectStats.length
      ? data.projectStats.map(p => {
          const pct = p.total_tasks > 0 ? Math.round(p.done_tasks / p.total_tasks * 100) : 0;
          return `
            <div style="margin-bottom:14px;cursor:pointer" onclick="navigateTo('project-detail','${p.id}')">
              <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                <span style="font-size:13px;font-weight:600">${esc(p.name)}</span>
                <span style="font-size:12px;color:var(--text2)">${p.done_tasks}/${p.total_tasks} tasks · ${pct}%</span>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')
      : '<div style="color:var(--text3);font-size:13px">No projects yet</div>';

    // Activity
    document.getElementById('activityFeed').innerHTML = data.recentActivity.length
      ? data.recentActivity.map(a => `
        <div class="activity-item">
          <img class="avatar avatar-sm" src="${a.user_avatar || ''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.user_name)}&size=24&background=6c63ff&color=fff'">
          <div class="activity-content">
            <span style="font-weight:600">${esc(a.user_name)}</span>
            <span style="color:var(--text2)"> ${formatAction(a.action)} a ${a.entity_type}</span>
            <div class="activity-time">${timeAgo(a.created_at)}</div>
          </div>
        </div>
      `).join('')
      : '<div style="color:var(--text3);font-size:13px">No activity yet</div>';
  } catch (e) {
    toast('Failed to load dashboard', 'error');
  }
}

// ===== PROJECTS =====
async function loadProjects() {
  try {
    const data = await api('GET', '/projects');
    allProjects = data.projects;
    const el = document.getElementById('projectsList');
    if (!allProjects.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div><p>No projects yet. Create your first one!</p><button class="btn btn-primary" onclick="openModal('createProjectModal')">+ New Project</button></div>`;
      return;
    }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${allProjects.map(p => `
        <div class="card card-clickable" onclick="navigateTo('project-detail','${p.id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div style="font-weight:700;font-size:15px">${esc(p.name)}</div>
            <span class="status ${p.status}">${p.status.replace('_', ' ')}</span>
          </div>
          <div style="color:var(--text2);font-size:13px;margin-bottom:14px;min-height:18px">${esc(p.description || 'No description')}</div>
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:5px">
              <span>Progress</span>
              <span>${p.done_count}/${p.task_count} tasks</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${p.task_count > 0 ? Math.round(p.done_count/p.task_count*100) : 0}%"></div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:6px">
              <img class="avatar avatar-sm" src="${p.owner_avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.owner_name)}&size=24&background=6c63ff&color=fff'">
              <span style="font-size:12px;color:var(--text2)">${esc(p.owner_name)}</span>
            </div>
            <div style="display:flex;gap:10px;font-size:12px;color:var(--text2)">
              <span>👥 ${p.member_count}</span>
              ${p.deadline ? `<span>📅 ${formatDate(p.deadline)}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
  } catch (e) { toast('Failed to load projects', 'error'); }
}

async function createProject() {
  const name = document.getElementById('newProjectName').value.trim();
  const desc = document.getElementById('newProjectDesc').value.trim();
  const deadline = document.getElementById('newProjectDeadline').value;
  const err = document.getElementById('createProjectError');
  const btn = document.getElementById('createProjectBtn');
  err.textContent = '';
  if (!name) { err.textContent = 'Project name is required'; return; }
  btn.disabled = true;
  try {
    const data = await api('POST', '/projects', { name, description: desc, deadline: deadline || null });
    closeModal('createProjectModal');
    document.getElementById('newProjectName').value = '';
    document.getElementById('newProjectDesc').value = '';
    document.getElementById('newProjectDeadline').value = '';
    toast('Project created!', 'success');
    navigateTo('project-detail', data.project.id);
  } catch (e) {
    err.textContent = e.message;
  } finally { btn.disabled = false; }
}

// ===== PROJECT DETAIL =====
async function loadProjectDetail(projectId) {
  try {
    const data = await api('GET', `/projects/${projectId}`);
    const { project, members, taskStats } = data;
    document.getElementById('projectDetailName').textContent = project.name;
    document.getElementById('projectDetailDesc').textContent = project.description || '';

    const isMemberAdmin = currentUser.role === 'admin' ||
      members.find(m => m.id === currentUser.id)?.role === 'admin';

    document.getElementById('projectDetailActions').innerHTML = `
      ${isMemberAdmin ? `<button class="btn btn-secondary btn-sm" onclick="openAddMember()">+ Member</button>` : ''}
      ${isMemberAdmin ? `<button class="btn btn-secondary btn-sm" onclick="openEditProject('${projectId}')">Edit</button>` : ''}
      <button class="btn btn-primary btn-sm" onclick="openCreateTaskForProject('${projectId}')">+ Task</button>
    `;

    await renderProjectTab(projectId, currentProjectTab, members, isMemberAdmin);
  } catch (e) { toast('Failed to load project', 'error'); }
}

function switchProjectTab(tab) {
  currentProjectTab = tab;
  document.querySelectorAll('#projectDetailTabs .tab').forEach((el, i) => {
    el.classList.toggle('active', ['board', 'list', 'members'][i] === tab);
  });
  renderProjectTab(currentProjectId, tab);
}

async function renderProjectTab(projectId, tab, members, isMemberAdmin) {
  const content = document.getElementById('projectDetailContent');
  if (tab === 'board' || tab === 'list') {
    const data = await api('GET', `/tasks?projectId=${projectId}`);
    if (tab === 'board') {
      const cols = { todo: [], in_progress: [], review: [], done: [] };
      data.tasks.forEach(t => cols[t.status]?.push(t));
      content.innerHTML = `<div class="board">
        ${[['todo', 'Todo', '#94a3b8'], ['in_progress', 'In Progress', 'var(--blue)'], ['review', 'Review', 'var(--yellow)'], ['done', 'Done', 'var(--green)']].map(([status, label, color]) => `
          <div class="board-col">
            <div class="board-col-header">
              <div class="board-col-title"><span class="col-dot" style="background:${color}"></span>${label}</div>
              <span class="col-count">${cols[status].length}</span>
            </div>
            ${cols[status].map(t => renderTaskCard(t)).join('') || `<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">No tasks</div>`}
          </div>
        `).join('')}
      </div>`;
    } else {
      content.innerHTML = `<div class="table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead>
          <tbody>${data.tasks.map(t => `
            <tr onclick="openTaskDetail('${t.id}')" style="cursor:pointer">
              <td style="font-weight:500">${esc(t.title)}</td>
              <td>${t.assignee_name ? `<div style="display:flex;align-items:center;gap:6px"><img class="avatar avatar-sm" src="${t.assignee_avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(t.assignee_name)}&size=24&background=6c63ff&color=fff'"><span>${esc(t.assignee_name)}</span></div>` : '<span style="color:var(--text3)">—</span>'}</td>
              <td><span class="priority ${t.priority}">${t.priority}</span></td>
              <td><span class="status ${t.status}">${t.status.replace('_', ' ')}</span></td>
              <td>${t.due_date ? `<span style="${isOverdue(t) ? 'color:var(--red)' : ''}">${formatDate(t.due_date)}</span>` : '—'}</td>
              <td onclick="event.stopPropagation()">
                <select style="background:transparent;border:none;color:var(--text2);font-size:12px;cursor:pointer" onchange="quickUpdateStatus('${t.id}', this.value)">
                  <option value="todo" ${t.status==='todo'?'selected':''}>Todo</option>
                  <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
                  <option value="review" ${t.status==='review'?'selected':''}>Review</option>
                  <option value="done" ${t.status==='done'?'selected':''}>Done</option>
                </select>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:32px">No tasks yet</td></tr>'}</tbody>
        </table>
      </div>`;
    }
  } else if (tab === 'members') {
    if (!members) {
      const res = await api('GET', `/projects/${projectId}`);
      members = res.members;
      isMemberAdmin = currentUser.role === 'admin' || members.find(m => m.id === currentUser.id)?.role === 'admin';
    }
    content.innerHTML = `<div class="table-wrap">
      <table>
        <thead><tr><th>Member</th><th>Email</th><th>Project Role</th><th>Joined</th>${isMemberAdmin ? '<th></th>' : ''}</tr></thead>
        <tbody>${members.map(m => `
          <tr>
            <td><div style="display:flex;align-items:center;gap:8px"><img class="avatar" src="${m.avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&size=32&background=6c63ff&color=fff'"><span style="font-weight:500">${esc(m.name)}</span></div></td>
            <td style="color:var(--text2)">${esc(m.email)}</td>
            <td><span class="role-badge ${m.role}">${m.role}</span></td>
            <td style="color:var(--text2)">${formatDate(m.joined_at)}</td>
            ${isMemberAdmin && m.id !== currentUser.id ? `<td>
              <button class="btn btn-danger btn-sm" onclick="removeMember('${projectId}','${m.id}')">Remove</button>
            </td>` : isMemberAdmin ? '<td></td>' : ''}
          </tr>
        `).join('')}</tbody>
      </table>
    </div>`;
  }
}

function renderTaskCard(t) {
  return `<div class="task-card" onclick="openTaskDetail('${t.id}')">
    <div class="task-card-title">${esc(t.title)}</div>
    <div class="task-card-meta">
      <span class="priority ${t.priority}">${t.priority}</span>
      ${t.due_date ? `<span class="${isOverdue(t) ? 'overdue-tag' : 'due-soon'}">${formatDate(t.due_date)}</span>` : ''}
    </div>
    <div class="task-card-footer">
      ${t.assignee_name ? `<div style="display:flex;align-items:center;gap:5px"><img class="avatar avatar-sm" src="${t.assignee_avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(t.assignee_name)}&size=24&background=6c63ff&color=fff'"><span style="font-size:11px;color:var(--text2)">${esc(t.assignee_name)}</span></div>` : '<span></span>'}
    </div>
  </div>`;
}

async function openTaskDetail(taskId) {
  try {
    const data = await api('GET', `/tasks/${taskId}`);
    taskDetailCurrent = data.task;
    document.getElementById('taskDetailTitle').textContent = data.task.title;
    document.getElementById('taskDetailBody').innerHTML = renderTaskDetail(data.task, data.comments);
    openModal('taskDetailModal');
  } catch (e) { toast('Failed to load task', 'error'); }
}

function renderTaskDetail(t, comments) {
  const isOwner = t.creator_id === currentUser.id || t.assignee_id === currentUser.id || currentUser.role === 'admin';
  return `
    <div style="display:grid;grid-template-columns:1fr 240px;gap:20px">
      <div>
        ${t.description ? `<div style="color:var(--text2);margin-bottom:16px;font-size:13px;line-height:1.6">${esc(t.description)}</div>` : ''}
        <div style="font-size:13px;font-weight:700;margin-bottom:10px">Comments</div>
        <div id="commentsList">
          ${comments.map(c => `
            <div class="comment">
              <img class="avatar avatar-sm" src="${c.user_avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(c.user_name)}&size=24&background=6c63ff&color=fff'">
              <div class="comment-bubble">
                <div class="comment-meta"><strong>${esc(c.user_name)}</strong> · ${timeAgo(c.created_at)}</div>
                <div style="font-size:13px">${esc(c.content)}</div>
              </div>
            </div>
          `).join('') || '<div style="color:var(--text3);font-size:13px;margin-bottom:12px">No comments yet</div>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <textarea class="form-control" id="newComment" placeholder="Add a comment..." style="height:60px"></textarea>
          <button class="btn btn-primary btn-sm" onclick="addComment('${t.id}')" style="align-self:flex-end">Post</button>
        </div>
      </div>
      <div style="border-left:1px solid var(--border);padding-left:16px">
        <div style="margin-bottom:14px">
          <div class="form-label">Status</div>
          <select class="form-control" id="detailStatus" onchange="quickUpdateStatus('${t.id}', this.value)">
            <option value="todo" ${t.status==='todo'?'selected':''}>Todo</option>
            <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
            <option value="review" ${t.status==='review'?'selected':''}>Review</option>
            <option value="done" ${t.status==='done'?'selected':''}>Done</option>
          </select>
        </div>
        <div style="margin-bottom:10px"><div class="form-label">Priority</div><span class="priority ${t.priority}">${t.priority}</span></div>
        <div style="margin-bottom:10px"><div class="form-label">Project</div><div style="font-size:13px">${esc(t.project_name||'')}</div></div>
        <div style="margin-bottom:10px"><div class="form-label">Assigned To</div><div style="font-size:13px">${t.assignee_name ? esc(t.assignee_name) : '<span style="color:var(--text3)">Unassigned</span>'}</div></div>
        <div style="margin-bottom:10px"><div class="form-label">Created By</div><div style="font-size:13px">${esc(t.creator_name||'')}</div></div>
        <div style="margin-bottom:10px"><div class="form-label">Due Date</div><div style="font-size:13px;${isOverdue(t)?'color:var(--red)':''}">${t.due_date ? formatDate(t.due_date) : '—'}</div></div>
        <div style="margin-bottom:10px"><div class="form-label">Created</div><div style="font-size:12px;color:var(--text2)">${timeAgo(t.created_at)}</div></div>
        ${isOwner ? `<hr class="divider"><button class="btn btn-danger btn-sm" style="width:100%" onclick="deleteTask('${t.id}')">Delete Task</button>` : ''}
      </div>
    </div>
  `;
}

async function quickUpdateStatus(taskId, status) {
  try {
    await api('PUT', `/tasks/${taskId}`, { status });
    toast('Status updated', 'success');
    if (currentProjectId) loadProjectDetail(currentProjectId);
    if (document.getElementById('page-tasks').classList.contains('active')) loadTasks();
  } catch (e) { toast(e.message, 'error'); }
}

async function addComment(taskId) {
  const content = document.getElementById('newComment').value.trim();
  if (!content) return;
  try {
    const data = await api('POST', `/tasks/${taskId}/comments`, { content });
    document.getElementById('newComment').value = '';
    // Refresh task detail
    openTaskDetail(taskId);
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await api('DELETE', `/tasks/${taskId}`);
    closeModal('taskDetailModal');
    toast('Task deleted', 'success');
    if (currentProjectId) loadProjectDetail(currentProjectId);
    if (document.getElementById('page-tasks').classList.contains('active')) loadTasks();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== TASKS PAGE =====
async function loadTasks() {
  try {
    const [tasksData, projectsData] = await Promise.all([
      api('GET', `/tasks?assigneeId=${currentUser.id}`),
      api('GET', '/projects')
    ]);
    allTasks = tasksData.tasks;
    allProjects = projectsData.projects;

    const sel = document.getElementById('taskProjectFilter');
    sel.innerHTML = '<option value="">All Projects</option>' +
      allProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    filterTasks();
  } catch (e) { toast('Failed to load tasks', 'error'); }
}

function filterTasks() {
  const search = document.getElementById('taskSearch').value.toLowerCase();
  const status = document.getElementById('taskStatusFilter').value;
  const priority = document.getElementById('taskPriorityFilter').value;
  const project = document.getElementById('taskProjectFilter').value;

  let filtered = allTasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search)) return false;
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (project && t.project_id !== project) return false;
    return true;
  });

  const el = document.getElementById('tasksList');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No tasks found</p></div>';
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Title</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
    <tbody>${filtered.map(t => `
      <tr onclick="openTaskDetail('${t.id}')" style="cursor:pointer">
        <td style="font-weight:500;max-width:200px" class="truncate">${esc(t.title)}</td>
        <td style="color:var(--text2)">${esc(t.project_name||'')}</td>
        <td>${t.assignee_name ? esc(t.assignee_name) : '<span style="color:var(--text3)">—</span>'}</td>
        <td><span class="priority ${t.priority}">${t.priority}</span></td>
        <td><span class="status ${t.status}">${t.status.replace('_',' ')}</span></td>
        <td style="${isOverdue(t)?'color:var(--red)':''}">${t.due_date ? formatDate(t.due_date) : '—'}</td>
      </tr>
    `).join('')}</tbody>
  </table></div>`;
}

// ===== CREATE TASK =====
async function openCreateTaskForProject(projectId) {
  await loadProjectsIntoSelect();
  document.getElementById('newTaskProject').value = projectId;
  await loadProjectMembers();
  openModal('createTaskModal');
}

async function loadProjectsIntoSelect() {
  try {
    if (!allProjects.length) {
      const data = await api('GET', '/projects');
      allProjects = data.projects;
    }
    const sel = document.getElementById('newTaskProject');
    sel.innerHTML = '<option value="">Select project...</option>' +
      allProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  } catch (e) {}
}

async function loadProjectMembers() {
  const projectId = document.getElementById('newTaskProject').value;
  const sel = document.getElementById('newTaskAssignee');
  sel.innerHTML = '<option value="">Unassigned</option>';
  if (!projectId) return;
  try {
    const data = await api('GET', `/projects/${projectId}`);
    data.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === currentUser.id) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (e) {}
}

async function createTask() {
  const title = document.getElementById('newTaskTitle').value.trim();
  const desc = document.getElementById('newTaskDesc').value.trim();
  const project_id = document.getElementById('newTaskProject').value;
  const assignee_id = document.getElementById('newTaskAssignee').value;
  const priority = document.getElementById('newTaskPriority').value;
  const due_date = document.getElementById('newTaskDue').value;
  const status = document.getElementById('newTaskStatus').value;
  const err = document.getElementById('createTaskError');
  const btn = document.getElementById('createTaskBtn');
  err.textContent = '';
  if (!title) { err.textContent = 'Task title is required'; return; }
  if (!project_id) { err.textContent = 'Please select a project'; return; }
  btn.disabled = true;
  try {
    await api('POST', '/tasks', { title, description: desc, project_id, assignee_id: assignee_id||null, priority, due_date: due_date||null, status });
    closeModal('createTaskModal');
    document.getElementById('newTaskTitle').value = '';
    document.getElementById('newTaskDesc').value = '';
    document.getElementById('newTaskDue').value = '';
    toast('Task created!', 'success');
    if (currentProjectId) loadProjectDetail(currentProjectId);
    if (document.getElementById('page-tasks').classList.contains('active')) loadTasks();
  } catch (e) {
    err.textContent = e.message;
  } finally { btn.disabled = false; }
}

// ===== TEAM =====
async function loadTeam() {
  try {
    const data = await api('GET', '/users');
    const el = document.getElementById('teamList');
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Member</th><th>Email</th><th>Role</th>${currentUser.role==='admin'?'<th>Projects</th><th>Tasks</th><th></th>':''}</tr></thead>
      <tbody>${data.users.map(u => `
        <tr>
          <td><div style="display:flex;align-items:center;gap:10px"><img class="avatar" src="${u.avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&size=32&background=6c63ff&color=fff'"><span style="font-weight:500">${esc(u.name)}</span></div></td>
          <td style="color:var(--text2)">${esc(u.email)}</td>
          <td><span class="role-badge ${u.role}">${u.role}</span></td>
          ${currentUser.role==='admin'?`<td>${u.project_count??'—'}</td><td>${u.task_count??'—'}</td><td>
            ${u.id!==currentUser.id?`
              <button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${u.id}','${u.role}')">${u.role==='admin'?'Make Member':'Make Admin'}</button>
            `:'' }</td>`:''}
        </tr>
      `).join('')}</tbody>
    </table></div>`;
  } catch (e) { toast('Failed to load team', 'error'); }
}

async function toggleUserRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'member' : 'admin';
  if (!confirm(`Change role to ${newRole}?`)) return;
  try {
    await api('PUT', `/users/${userId}/role`, { role: newRole });
    toast('Role updated', 'success');
    loadTeam();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== ADMIN =====
async function loadAdmin() {
  if (currentUser.role !== 'admin') { navigateTo('dashboard'); return; }
  try {
    const data = await api('GET', '/users');
    document.getElementById('adminUserList').innerHTML = `
      <div style="font-size:15px;font-weight:700;margin-bottom:16px">All Users (${data.users.length})</div>
      <div class="table-wrap"><table>
        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Projects</th><th>Tasks</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>${data.users.map(u => `
          <tr>
            <td><div style="display:flex;align-items:center;gap:10px"><img class="avatar" src="${u.avatar||''}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&size=32&background=6c63ff&color=fff'"><span style="font-weight:500">${esc(u.name)}</span></div></td>
            <td style="color:var(--text2);font-size:13px">${esc(u.email)}</td>
            <td><span class="role-badge ${u.role}">${u.role}</span></td>
            <td>${u.project_count}</td>
            <td>${u.task_count}</td>
            <td style="font-size:12px;color:var(--text2)">${formatDate(u.created_at)}</td>
            <td>
              <div style="display:flex;gap:6px">
                ${u.id!==currentUser.id?`
                  <button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${u.id}','${u.role}')">${u.role==='admin'?'→ Member':'→ Admin'}</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Delete</button>
                `:' <span style="color:var(--text3);font-size:12px">You</span>'}
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>`;
  } catch (e) { toast('Failed to load users', 'error'); }
}

async function deleteUser(userId) {
  if (!confirm('Permanently delete this user and all their data?')) return;
  try {
    await api('DELETE', `/users/${userId}`);
    toast('User deleted', 'success');
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== PROFILE =====
function loadProfile() {
  document.getElementById('profileName').value = currentUser.name;
  document.getElementById('profileEmail').value = currentUser.email;
  document.getElementById('profileRole').value = currentUser.role;
}

async function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  try {
    const data = await api('PUT', '/auth/profile', { name });
    currentUser = data.user;
    updateSidebar();
    toast('Profile saved!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ===== PROJECT MEMBERS =====
function openAddMember() { openModal('addMemberModal'); }

async function addMember() {
  const email = document.getElementById('addMemberEmail').value.trim();
  const role = document.getElementById('addMemberRole').value;
  const err = document.getElementById('addMemberError');
  err.textContent = '';
  if (!email) { err.textContent = 'Email is required'; return; }
  try {
    await api('POST', `/projects/${currentProjectId}/members`, { email, role });
    closeModal('addMemberModal');
    document.getElementById('addMemberEmail').value = '';
    toast('Member added!', 'success');
    loadProjectDetail(currentProjectId);
  } catch (e) { err.textContent = e.message; }
}

async function removeMember(projectId, userId) {
  if (!confirm('Remove this member from the project?')) return;
  try {
    await api('DELETE', `/projects/${projectId}/members/${userId}`);
    toast('Member removed', 'success');
    loadProjectDetail(projectId);
  } catch (e) { toast(e.message, 'error'); }
}

// ===== EDIT PROJECT =====
async function openEditProject(projectId) {
  try {
    const data = await api('GET', `/projects/${projectId}`);
    const p = data.project;
    document.getElementById('editProjectId').value = p.id;
    document.getElementById('editProjectName').value = p.name;
    document.getElementById('editProjectDesc').value = p.description || '';
    document.getElementById('editProjectStatus').value = p.status;
    document.getElementById('editProjectDeadline').value = p.deadline || '';
    openModal('editProjectModal');
  } catch (e) { toast('Failed to load project', 'error'); }
}

async function updateProject() {
  const id = document.getElementById('editProjectId').value;
  const name = document.getElementById('editProjectName').value.trim();
  const description = document.getElementById('editProjectDesc').value.trim();
  const status = document.getElementById('editProjectStatus').value;
  const deadline = document.getElementById('editProjectDeadline').value;
  const err = document.getElementById('editProjectError');
  err.textContent = '';
  if (!name) { err.textContent = 'Name is required'; return; }
  try {
    await api('PUT', `/projects/${id}`, { name, description, status, deadline: deadline||null });
    closeModal('editProjectModal');
    toast('Project updated!', 'success');
    loadProjectDetail(id);
  } catch (e) { err.textContent = e.message; }
}

// ===== MODAL HELPERS =====
function openModal(id) {
  if (id === 'createTaskModal') loadProjectsIntoSelect();
  document.getElementById(id).classList.add('open');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    closeModal(e.target.id);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

// Enter key for auth forms
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('loginPage')?.style.display !== 'none' && document.getElementById('loginEmail')?.matches(':focus, :focus-within')) handleLogin();
    if (document.getElementById('signupPage')?.style.display !== 'none') handleSignup();
  }
});

// ===== TOAST =====
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ===== UTILS =====
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
}

function isOverdue(task) {
  return task.due_date && task.due_date < new Date().toISOString().split('T')[0] && task.status !== 'done';
}

function formatAction(action) {
  const map = { created: 'created', updated: 'updated', deleted: 'deleted', updated_status: 'updated status of', added_member: 'added a member to' };
  return map[action] || action;
}
