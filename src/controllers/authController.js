const db = require('../config/db');

async function listUsers(req, res, next) {
  try {
    const [users] = await db.query('SELECT id, name, email, role, discipline, project_id, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  const { email, password, role, project_id } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();
  const cleanRole = (role || '').trim().toLowerCase();
  const cleanProjectId = (project_id || '').trim().toUpperCase();

  if (!cleanEmail || !cleanPassword) {
    return res.status(400).json({ error: 'Please enter both your email address and password.' });
  }

  try {
    // 1. Search database for matching email
    const [rows] = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);

    if (!rows.length) {
      return res.status(401).json({ error: 'No account found with this email address. Please check your email.' });
    }

    const user = rows[0];

    // 2. Verify password match
    if (user.password && user.password !== cleanPassword) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // 3. Verify role/discipline match if role is selected
    if (cleanRole) {
      const userRole = (user.role || '').toLowerCase();
      const userDisc = (user.discipline || '').toLowerCase();
      if (cleanRole === 'general') {
        if (userRole !== 'supervisor' && userDisc !== 'general') {
          return res.status(401).json({
            error: `Role mismatch: This account (${user.name}) is assigned to ${user.role.toUpperCase()}${user.discipline ? ' / ' + user.discipline.toUpperCase() : ''}, which does not match "${role.toUpperCase()}".`
          });
        }
      } else if (userRole !== cleanRole && userDisc !== cleanRole) {
        return res.status(401).json({
          error: `Role mismatch: This account (${user.name}) is assigned to ${user.role.toUpperCase()}${user.discipline ? ' / ' + user.discipline.toUpperCase() : ''}, which does not match "${role.toUpperCase()}".`
        });
      }
    }

    // 4. Verify Project ID for Supervisors
    if (user.role === 'supervisor') {
      if (!cleanProjectId) {
        return res.status(400).json({
          error: 'Project ID is required for supervisor login. Please enter your assigned Project ID (e.g. P1).'
        });
      }
      const userProject = (user.project_id || 'P1').trim().toUpperCase();
      if (userProject !== cleanProjectId) {
        return res.status(401).json({
          error: `Project ID mismatch: Your supervisor account is assigned to Project "${userProject}", but you entered "${cleanProjectId}".`
        });
      }
    }

    // Success: return authenticated user record without exposing password
    const { password: _pwd, ...safeUser } = user;
    res.json({ ok: true, user: safeUser });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, login };
