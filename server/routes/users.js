const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, publicPathFor } = require('../upload');

const router = express.Router();

// Search users by username (for "new message" / "add to group" / discovery)
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ users: [] });
    const { rows } = await pool.query(
      `SELECT id, username, avatar_url, verified FROM users
       WHERE banned = FALSE AND username ILIKE $1 AND id != $2
       ORDER BY username ASC LIMIT 20`,
      [`%${q}%`, req.user.id]
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('user search error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get a profile by username, including counts and whether current user follows them
router.get('/:username', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, bio, avatar_url, verified, banned, restricted, created_at FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [req.params.username]
    );
    if (!rows.length || rows[0].banned) return res.status(404).json({ error: 'User not found.' });
    const profile = rows[0];

    const [followers, following, posts, isFollowing] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM follows WHERE following_id = $1', [profile.id]),
      pool.query('SELECT COUNT(*) FROM follows WHERE follower_id = $1', [profile.id]),
      pool.query(
        `SELECT id, media_url, media_type, is_reel, caption, created_at,
          (SELECT COUNT(*) FROM likes WHERE post_id = posts.id) AS like_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = posts.id AND hidden = FALSE) AS comment_count
         FROM posts WHERE user_id = $1 AND hidden = FALSE ORDER BY created_at DESC`,
        [profile.id]
      ),
      pool.query('SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2', [req.user.id, profile.id]),
    ]);

    res.json({
      profile: {
        ...profile,
        followerCount: parseInt(followers.rows[0].count, 10),
        followingCount: parseInt(following.rows[0].count, 10),
        isFollowing: isFollowing.rows.length > 0,
        isSelf: profile.id === req.user.id,
      },
      posts: posts.rows,
    });
  } catch (err) {
    console.error('get profile error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/me/profile', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    const { bio } = req.body || {};
    const avatarUrl = req.file ? publicPathFor(req.file) : undefined;

    const fields = [];
    const values = [];
    let i = 1;
    if (bio !== undefined) { fields.push(`bio = $${i++}`); values.push(bio); }
    if (avatarUrl !== undefined) { fields.push(`avatar_url = $${i++}`); values.push(avatarUrl); }
    if (!fields.length) return res.json({ user: req.user });

    values.push(req.user.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, username, bio, avatar_url, verified, is_admin, banned, restricted, created_at`,
      values
    );
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('update profile error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:username/follow', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [req.params.username]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const targetId = rows[0].id;
    if (targetId === req.user.id) return res.status(400).json({ error: "You can't follow yourself." });

    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, targetId]
    );
    res.json({ ok: true, following: true });
  } catch (err) {
    console.error('follow error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:username/follow', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [req.params.username]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const targetId = rows[0].id;

    await pool.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [req.user.id, targetId]);
    res.json({ ok: true, following: false });
  } catch (err) {
    console.error('unfollow error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
