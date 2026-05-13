const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow-super-secret-key-change-in-prod';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireProjectAccess = (role = null) => (req, res, next) => {
  const projectId = req.params.projectId || req.body.project_id;
  if (!projectId) return res.status(400).json({ error: 'Project ID required' });

  // Global admins always have access
  if (req.user.role === 'admin') return next();

  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, req.user.id);

  if (!member) return res.status(403).json({ error: 'Not a project member' });
  if (role === 'admin' && member.role !== 'admin') {
    return res.status(403).json({ error: 'Project admin access required' });
  }
  req.projectMember = member;
  next();
};

module.exports = { authenticate, requireAdmin, requireProjectAccess, JWT_SECRET };
