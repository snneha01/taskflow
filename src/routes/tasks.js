const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/tasks?projectId=&assignee=&status=&priority=
router.get('/', (req, res) => {
  const { projectId, assigneeId, status, priority, overdue } = req.query;
  let query = `
    SELECT t.*, 
      u.name as assignee_name, u.avatar as assignee_avatar,
      c.name as creator_name,
      p.name as project_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN users c ON t.creator_id = c.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role !== 'admin') {
    query += ` AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)`;
    params.push(req.user.id);
  }
  if (projectId) { query += ' AND t.project_id = ?'; params.push(projectId); }
  if (assigneeId) { query += ' AND t.assignee_id = ?'; params.push(assigneeId); }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (overdue === 'true') { query += ` AND t.due_date < date('now') AND t.status != 'done'`; }

  query += " ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.created_at DESC";

  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, description, project_id, assignee_id, priority, due_date, tags, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title is required' });
  if (!project_id) return res.status(400).json({ error: 'Project ID is required' });

  // Check project access
  if (req.user.role !== 'admin') {
    const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(project_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a project member' });
  }

  if (assignee_id) {
    const assigneeMember = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(project_id, assignee_id);
    if (!assigneeMember && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Assignee must be a project member' });
    }
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO tasks (id, title, description, project_id, assignee_id, creator_id, priority, due_date, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, description || null, project_id, assignee_id || null, req.user.id,
      priority || 'medium', due_date || null, JSON.stringify(tags || []), status || 'todo');

  logActivity(req.user.id, 'created', 'task', id, { title, project_id });
  const task = getFullTask(id);
  res.status(201).json({ task });
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const task = getFullTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'admin') {
    const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(task.project_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Access denied' });
  }

  const comments = db.prepare(`
    SELECT tc.*, u.name as user_name, u.avatar as user_avatar
    FROM task_comments tc JOIN users u ON tc.user_id = u.id
    WHERE tc.task_id = ? ORDER BY tc.created_at ASC
  `).all(req.params.id);

  res.json({ task, comments });
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'admin') {
    const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(task.project_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Access denied' });
    // Members can only update status of their own tasks; admins can update anything
    if (member.role !== 'admin' && task.assignee_id !== req.user.id && task.creator_id !== req.user.id) {
      // Allow status updates only
      const { status } = req.body;
      if (status) {
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
        logActivity(req.user.id, 'updated_status', 'task', req.params.id, { status });
        return res.json({ task: getFullTask(req.params.id) });
      }
      return res.status(403).json({ error: 'Can only update tasks you created or are assigned to' });
    }
  }

  const { title, description, status, priority, assignee_id, due_date, tags } = req.body;
  db.prepare(`UPDATE tasks SET 
    title = COALESCE(?, title),
    description = COALESCE(?, description),
    status = COALESCE(?, status),
    priority = COALESCE(?, priority),
    assignee_id = ?,
    due_date = COALESCE(?, due_date),
    tags = COALESCE(?, tags)
    WHERE id = ?`)
    .run(title, description, status, priority,
      assignee_id !== undefined ? assignee_id : task.assignee_id,
      due_date, tags ? JSON.stringify(tags) : null, req.params.id);

  logActivity(req.user.id, 'updated', 'task', req.params.id, { title, status });
  res.json({ task: getFullTask(req.params.id) });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'admin') {
    const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(task.project_id, req.user.id);
    if (!member || (member.role !== 'admin' && task.creator_id !== req.user.id)) {
      return res.status(403).json({ error: 'Only task creator or project admin can delete' });
    }
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Comment content required' });
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'admin') {
    const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(task.project_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Access denied' });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, content);

  const comment = db.prepare(`
    SELECT tc.*, u.name as user_name, u.avatar as user_avatar
    FROM task_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.id = ?
  `).get(id);
  res.status(201).json({ comment });
});

function getFullTask(id) {
  return db.prepare(`
    SELECT t.*, 
      u.name as assignee_name, u.avatar as assignee_avatar,
      c.name as creator_name,
      p.name as project_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN users c ON t.creator_id = c.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(id);
}

function logActivity(userId, action, entityType, entityId, meta = {}) {
  db.prepare('INSERT INTO activity_log (id, user_id, action, entity_type, entity_id, meta) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), userId, action, entityType, entityId, JSON.stringify(meta));
}

module.exports = router;
