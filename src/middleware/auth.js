const db = require('../config/db');

/**
 * Auth middleware for MySQL: extracts x-user-id header and fetches user record
 */
async function identifyUser(req, res, next) {
  const userId = req.header('x-user-id');
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id header' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(401).json({ error: 'Unknown user' });
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { identifyUser, requireRole };
