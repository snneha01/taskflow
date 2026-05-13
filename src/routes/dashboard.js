const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/dashboard
router.get('/', (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  const projectFilter = isAdmin
    ? 'SELECT id FROM projects'
    : 'SELECT project_id as id FROM project_members WHERE user_id = ?';
  const projectParams = isAdmin ? [] : [userId];

  const myProjects = isAdmin
    ? db.prepare('SELECT COUNT(*) as count FROM projects').get().count
    : db.prepare('SELECT COUNT(*) as count FROM project_members WHERE user_id = ?').get(userId).count;

  const taskBase = isAdmin
    ? `SELECT t.* FROM tasks t`
    : `SELECT t.* FROM tasks t WHERE t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)`;

  const allTasks = isAdmin
    ? db.prepare(taskBase).all()
    : db.prepare(taskBase).all(userId);

  const myTasks = isAdmin
    ? db.prepare('SELECT * FROM tasks WHERE assignee_id = ?').all(userId)
    : db.prepare('SELECT * FROM tasks WHERE assignee_id = ? OR creator_id = ?').all(userId, userId);

  const now = new Date().toISOString().split('T')[0];
  const overdueTasks = allTasks.filter(t => t.due_date && t.due_date < now && t.status !== 'done');

  const statusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
  allTasks.forEach(t => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

  const priorityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  allTasks.forEach(t => { if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++; });

  // Recent activity
  const activity = db.prepare(`
    SELECT al.*, u.name as user_name, u.avatar as user_avatar
    FROM activity_log al JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 10
  `).all();

  // Upcoming tasks (due in next 7 days)
  const upcomingTasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assignee_name, u.avatar as assignee_avatar
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.due_date >= date('now') AND t.due_date <= date('now', '+7 days') AND t.status != 'done'
    ${isAdmin ? '' : `AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = '${userId}')`}
    ORDER BY t.due_date ASC LIMIT 5
  `).all();

  // Project stats
  const projectStats = db.prepare(`
    SELECT p.id, p.name, p.status, p.deadline,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_tasks
    FROM projects p
    LEFT JOIN tasks t ON p.id = t.project_id
    ${isAdmin ? '' : `WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = '${userId}')`}
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5
  `).all();

  res.json({
    summary: {
      totalProjects: myProjects,
      totalTasks: allTasks.length,
      myTasks: myTasks.length,
      overdueTasks: overdueTasks.length,
    },
    statusCounts,
    priorityCounts,
    overdueTasks: overdueTasks.slice(0, 5).map(t => ({
      ...t,
      ...db.prepare('SELECT name as project_name FROM projects WHERE id = ?').get(t.project_id)
    })),
    upcomingTasks,
    projectStats,
    recentActivity: activity
  });
});

module.exports = router;
