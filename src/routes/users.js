const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/users - Admin: all users; Member: users in shared projects
router.get('/', (req, res) => {
  let users;
  if (req.user.role === 'admin') {
    users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.avatar, u.created_at,
        (SELECT COUNT(*) FROM project_members WHERE user_id = u.id) as project_count,
        (SELECT COUNT(*) FROM tasks WHERE assignee_id = u.id) as task_count
      FROM users u ORDER BY u.created_at DESC
    `).all();
  } else {
    users = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.email, u.avatar
      FROM users u
      JOIN project_members pm ON u.id = pm.user_id
      WHERE pm.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    `).all(req.user.id);
  }
  res.json({ users });
});

// PUT /api/users/:id/role - Admin only
router.put('/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: 'Role updated' });
});

// DELETE /api/users/:id - Admin only
router.delete('/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

module.exports = router;
