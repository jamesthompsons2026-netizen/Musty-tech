const express = require('express');
const { pool } = require('../db');
const { requireAuth, blockIfRestricted } = require('../middleware/auth');
const { upload, publicPathFor } = require('../upload');

const router = express.Router();

const POST_SELECT = (viewerId) => `
  SELECT p.id, p.user_id, p.media_url, p.media_type, p.is_reel, p.caption, p.created_at,
    u.username, u.avatar_url, u.verified,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND hidden = FALSE) AS comment_count,
    EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ${viewerId}) AS liked_by_me
  FROM posts p JOIN users u ON u.id = p.user_id
  WHERE p.hidden = FALSE AND u.banned = FALSE
`;

// Feed: posts from people you follow + your own, newest first. Falls back to
// everyone's public posts if you don't follow anyone yet, so new accounts
// aren't staring at an empty feed.
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const reelsOnly = req.query.reels === '1';
    const followingRes = await pool.query('SELECT following_id FROM follows WHERE follower_id = $1', [req.user.id]);
    const followingIds = followingRes.rows.map((r) => r.following_id);
    const audience = [...followingIds, req.user.id];

    let sql = POST_SELECT(req.user.id);
    const params = [];
    if (audience.length && followingIds.length) {
      params.push(audience);
      sql += ` AND p.user_id = ANY($${params.length})`;
    }
    if (reelsOnly) {
      sql += ' AND p.is_reel = TRUE';
    }
    sql += ' ORDER BY p.created_at DESC LIMIT 100';

    const { rows } = await pool.query(sql, params);
    res.json({ posts: rows });
  } catch (err) {
    console.error('feed error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/', requireAuth, blockIfRestricted, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A photo or video is required.' });
    const { caption } = req.body || {};
    const isReel = req.body.isReel === 'true' || req.body.isReel === true;
    const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    const mediaUrl = publicPathFor(req.file);

    const { rows } = await pool.query(
      `INSERT INTO posts (user_id, media_url, media_type, is_reel, caption)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [req.user.id, mediaUrl, mediaType, !!isReel && mediaType === 'video', caption || '']
    );

    res.json({
      post: {
        id: rows[0].id,
        user_id: req.user.id,
        media_url: mediaUrl,
        media_type: mediaType,
        is_reel: !!isReel && mediaType === 'video',
        caption: caption || '',
        created_at: rows[0].created_at,
        username: req.user.username,
        avatar_url: req.user.avatar_url,
        verified: req.user.verified,
        like_count: 0,
        comment_count: 0,
        liked_by_me: false,
      },
    });
  } catch (err) {
    console.error('create post error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found.' });
    if (rows[0].user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Not your post.' });
    }
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete post error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );
    const { rows } = await pool.query('SELECT COUNT(*) FROM likes WHERE post_id = $1', [req.params.id]);
    res.json({ liked: true, likeCount: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error('like error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:id/like', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const { rows } = await pool.query('SELECT COUNT(*) FROM likes WHERE post_id = $1', [req.params.id]);
    res.json({ liked: false, likeCount: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error('unlike error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.username, u.avatar_url, u.verified
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1 AND c.hidden = FALSE AND u.banned = FALSE
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json({ comments: rows });
  } catch (err) {
    console.error('get comments error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:id/comments', requireAuth, blockIfRestricted, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });

    const { rows } = await pool.query(
      `INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [req.params.id, req.user.id, content.trim().slice(0, 1000)]
    );
    res.json({
      comment: {
        ...rows[0],
        username: req.user.username,
        avatar_url: req.user.avatar_url,
        verified: req.user.verified,
      },
    });
  } catch (err) {
    console.error('comment error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:id/report', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    await pool.query(
      'INSERT INTO reports (post_id, reporter_id, reason) VALUES ($1, $2, $3)',
      [req.params.id, req.user.id, (reason || '').slice(0, 500)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('report error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
