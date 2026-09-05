const db = require('../config/db');

async function listUsers(req, res, next) {
  try {
    const [users] = await db.query('SELECT id, name, email, role, discipline FROM users');
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  const { email, password, role } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();
  const cleanRole = (role || '').trim().toLowerCase();

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
      if (userRole !== cleanRole && userDisc !== cleanRole) {
        return res.status(401).json({
          error: `Role mismatch: This account (${user.name}) is assigned to ${user.role.toUpperCase()}${user.discipline ? ' / ' + user.discipline.toUpperCase() : ''}, which does not match "${role.toUpperCase()}".`
        });
      }
    }

    // Success: return authenticated user record
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, login };
