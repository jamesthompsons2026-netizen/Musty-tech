const express = require('express');
const { pool } = require('../db');
const { requireAdminPin } = require('../middleware/auth');

const router = express.Router();

// Every route below requires the admin PIN sent as header x-admin-pin.
router.use(requireAdminPin);

router.get('/users', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const params = [];
    let sql = `SELECT id, username, bio, avatar_url, verified, is_admin, banned, restricted, created_at,
      (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS post_count
      FROM users`;
    if (q) {
      params.push(`%${q}%`);
      sql += ' WHERE username ILIKE $1';
    }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    res.json({ users: rows });
  } catch (err) {
    console.error('admin list users error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/users/:id/verify', async (req, res) => {
  try {
    const { verified } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE users SET verified = $1 WHERE id = $2 RETURNING id, username, verified',
      [!!verified, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('admin verify error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/users/:id/ban', async (req, res) => {
  try {
    const { banned } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE users SET banned = $1 WHERE id = $2 RETURNING id, username, banned',
      [!!banned, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('admin ban error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/users/:id/restrict', async (req, res) => {
  try {
    const { restricted } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE users SET restricted = $1 WHERE id = $2 RETURNING id, username, restricted',
      [!!restricted, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('admin restrict error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.reason, r.resolved, r.created_at,
        p.id AS post_id, p.media_url, p.caption, p.hidden AS post_hidden,
        reporter.username AS reporter_username,
        author.id AS author_id, author.username AS author_username
       FROM reports r
       JOIN posts p ON p.id = r.post_id
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users author ON author.id = p.user_id
       ORDER BY r.resolved ASC, r.created_at DESC LIMIT 200`
    );
    res.json({ reports: rows });
  } catch (err) {
    console.error('admin reports error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/reports/:id/resolve', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE reports SET resolved = TRUE WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('admin resolve report error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/posts/:id/hide', async (req, res) => {
  try {
    const { hidden } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE posts SET hidden = $1 WHERE id = $2 RETURNING id, hidden',
      [!!hidden, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found.' });
    res.json({ post: rows[0] });
  } catch (err) {
    console.error('admin hide post error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
