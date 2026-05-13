const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/projects - list projects the user is part of
router.get('/', (req, res) => {
  let projects;
  if (req.user.role === 'admin') {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name, u.avatar as owner_avatar,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count
      FROM projects p JOIN users u ON p.owner_id = u.id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name, u.avatar as owner_avatar,
        pm.role as my_role,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      JOIN users u ON p.owner_id = u.id
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  }
  res.json({ projects });
});

// POST /api/projects
router.post('/', (req, res) => {
  const { name, description, deadline } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, name, description, owner_id, deadline) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, description || null, req.user.id, deadline || null);

  // Add creator as project admin
  db.prepare('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), id, req.user.id, 'admin');

  logActivity(req.user.id, 'created', 'project', id, { name });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json({ project });
});

// GET /api/projects/:projectId
router.get('/:projectId', requireProjectAccess(), (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name, u.avatar as owner_avatar
    FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?
  `).get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, pm.role, pm.joined_at
    FROM project_members pm JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ? ORDER BY pm.joined_at ASC
  `).all(req.params.projectId);

  const taskStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
  `).all(req.params.projectId);

  res.json({ project, members, taskStats });
});

// PUT /api/projects/:projectId
router.put('/:projectId', requireProjectAccess('admin'), (req, res) => {
  const { name, description, status, deadline } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare('UPDATE projects SET name=?, description=?, status=?, deadline=? WHERE id=?')
    .run(name || project.name, description ?? project.description, status || project.status, deadline ?? project.deadline, req.params.projectId);

  logActivity(req.user.id, 'updated', 'project', req.params.projectId, { name });
  res.json({ project: db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) });
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', requireProjectAccess('admin'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  // Only owner or global admin can delete
  if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the project owner can delete it' });
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:projectId/members
router.post('/:projectId/members', requireProjectAccess('admin'), (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found. They must register first.' });

  const existing = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, user.id);
  if (existing) return res.status(409).json({ error: 'User is already a member' });

  db.prepare('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), req.params.projectId, user.id, role || 'member');

  logActivity(req.user.id, 'added_member', 'project', req.params.projectId, { userId: user.id, email });
  res.status(201).json({ message: 'Member added', user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: role || 'member' } });
});

// PUT /api/projects/:projectId/members/:userId
router.put('/:projectId/members/:userId', requireProjectAccess('admin'), (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?')
    .run(role, req.params.projectId, req.params.userId);
  res.json({ message: 'Member role updated' });
});

// DELETE /api/projects/:projectId/members/:userId
router.delete('/:projectId/members/:userId', requireProjectAccess('admin'), (req, res) => {
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
    .run(req.params.projectId, req.params.userId);
  res.json({ message: 'Member removed' });
});

function logActivity(userId, action, entityType, entityId, meta = {}) {
  db.prepare('INSERT INTO activity_log (id, user_id, action, entity_type, entity_id, meta) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), userId, action, entityType, entityId, JSON.stringify(meta));
}

module.exports = router;
