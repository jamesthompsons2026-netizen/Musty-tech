const { pool } = require('../db');

// Attaches req.user (fresh from DB) if a session exists. Does not block.
async function loadUser(req, res, next) {
  try {
    if (req.session && req.session.userId) {
      const { rows } = await pool.query(
        'SELECT id, username, bio, avatar_url, verified, is_admin, banned, restricted, created_at FROM users WHERE id = $1',
        [req.session.userId]
      );
      if (rows.length && !rows[0].banned) {
        req.user = rows[0];
      } else if (rows.length && rows[0].banned) {
        // Banned users get their session killed on the next request.
        req.session.destroy(() => {});
      }
    }
  } catch (err) {
    console.error('loadUser error', err);
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// Blocks write actions (posting/commenting) for restricted users.
function blockIfRestricted(req, res, next) {
  if (req.user && req.user.restricted) {
    return res.status(403).json({ error: 'Your account is restricted from posting right now.' });
  }
  next();
}

function requireAdminPin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || (req.body && req.body.pin) || (req.query && req.query.pin);
  const expected = process.env.ADMIN_PIN || '2127';
  if (pin && String(pin) === String(expected)) {
    return next();
  }
  return res.status(401).json({ error: 'Invalid admin PIN' });
}

module.exports = { loadUser, requireAuth, blockIfRestricted, requireAdminPin };
