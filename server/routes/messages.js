const express = require('express');
const { pool } = require('../db');
const { requireAuth, blockIfRestricted } = require('../middleware/auth');
const { upload, publicPathFor } = require('../upload');

const router = express.Router();

async function assertMember(conversationId, userId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  return rows.length > 0;
}

// List all conversations (1:1 and group) the current user belongs to.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.is_group, c.name, c.photo_url, c.created_at,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = $1
       ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`,
      [req.user.id]
    );

    // For 1:1 chats, attach the other member's profile for display purposes.
    for (const convo of rows) {
      if (!convo.is_group) {
        const other = await pool.query(
          `SELECT u.id, u.username, u.avatar_url, u.verified FROM conversation_members cm
           JOIN users u ON u.id = cm.user_id
           WHERE cm.conversation_id = $1 AND cm.user_id != $2 LIMIT 1`,
          [convo.id, req.user.id]
        );
        convo.other_user = other.rows[0] || null;
      } else {
        const members = await pool.query(
          `SELECT u.id, u.username FROM conversation_members cm JOIN users u ON u.id = cm.user_id
           WHERE cm.conversation_id = $1`,
          [convo.id]
        );
        convo.member_count = members.rows.length;
      }
    }

    res.json({ conversations: rows });
  } catch (err) {
    console.error('list conversations error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Start (or fetch existing) 1:1 DM with another user by username.
router.post('/dm', requireAuth, async (req, res) => {
  try {
    const { username } = req.body || {};
    const target = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND banned = FALSE', [username]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found.' });
    const targetId = target.rows[0].id;
    if (targetId === req.user.id) return res.status(400).json({ error: "You can't message yourself." });

    const existing = await pool.query(
      `SELECT c.id FROM conversations c
       JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = $1
       JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = $2
       WHERE c.is_group = FALSE LIMIT 1`,
      [req.user.id, targetId]
    );
    if (existing.rows.length) {
      return res.json({ conversationId: existing.rows[0].id });
    }

    const convo = await pool.query(
      'INSERT INTO conversations (is_group, created_by) VALUES (FALSE, $1) RETURNING id',
      [req.user.id]
    );
    const conversationId = convo.rows[0].id;
    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [conversationId, req.user.id, targetId]
    );
    res.json({ conversationId });
  } catch (err) {
    console.error('dm start error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create a group chat.
router.post('/groups', requireAuth, upload.single('groupPhoto'), async (req, res) => {
  try {
    const { name } = req.body || {};
    let usernames = req.body.usernames || [];
    if (typeof usernames === 'string') {
      try { usernames = JSON.parse(usernames); } catch { usernames = usernames.split(',').map((s) => s.trim()); }
    }
    if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required.' });

    const photoUrl = req.file ? publicPathFor(req.file) : null;
    const convo = await pool.query(
      'INSERT INTO conversations (is_group, name, photo_url, created_by) VALUES (TRUE, $1, $2, $3) RETURNING id, name, photo_url, created_at',
      [name.trim().slice(0, 60), photoUrl, req.user.id]
    );
    const conversationId = convo.rows[0].id;

    const memberIds = new Set([req.user.id]);
    if (usernames.length) {
      const found = await pool.query('SELECT id FROM users WHERE username = ANY($1)', [usernames]);
      found.rows.forEach((r) => memberIds.add(r.id));
    }
    const values = [...memberIds].map((_, idx) => `($1, $${idx + 2})`).join(', ');
    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ${values}`,
      [conversationId, ...memberIds]
    );

    res.json({ conversation: convo.rows[0] });
  } catch (err) {
    console.error('create group error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/groups/:id/members', requireAuth, async (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!(await assertMember(conversationId, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this group.' });
    }
    const { username } = req.body || {};
    const user = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found.' });

    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [conversationId, user.rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('add member error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/groups/:id/members/:username', requireAuth, async (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!(await assertMember(conversationId, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this group.' });
    }
    const user = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [req.params.username]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found.' });

    await pool.query('DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [
      conversationId, user.rows[0].id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('remove member error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    if (!(await assertMember(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this conversation.' });
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.avatar_url, u.verified FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = $1 ORDER BY u.username`,
      [req.params.id]
    );
    res.json({ members: rows });
  } catch (err) {
    console.error('list members error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!(await assertMember(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this conversation.' });
    }
    const { rows } = await pool.query(
      `SELECT m.id, m.content, m.media_url, m.created_at, u.id AS user_id, u.username, u.avatar_url, u.verified
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at ASC LIMIT 500`,
      [req.params.id]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error('get messages error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:id/messages', requireAuth, blockIfRestricted, upload.single('media'), async (req, res) => {
  try {
    if (!(await assertMember(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this conversation.' });
    }
    const { content } = req.body || {};
    const mediaUrl = req.file ? publicPathFor(req.file) : null;
    if (!content && !mediaUrl) return res.status(400).json({ error: 'Message cannot be empty.' });

    const { rows } = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, media_url)
       VALUES ($1, $2, $3, $4) RETURNING id, content, media_url, created_at`,
      [req.params.id, req.user.id, (content || '').slice(0, 2000), mediaUrl]
    );
    res.json({
      message: {
        ...rows[0],
        user_id: req.user.id,
        username: req.user.username,
        avatar_url: req.user.avatar_url,
        verified: req.user.verified,
      },
    });
  } catch (err) {
    console.error('send message error', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
