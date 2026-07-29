/* Musty — vanilla JS SPA */

const state = {
  user: null,
  view: 'loading',
  authMode: 'login',
  viewParams: {},
  adminPin: sessionStorage.getItem('musty_admin_pin') || null,
};

const app = document.getElementById('app');
const bottomNav = document.getElementById('bottom-nav');

/* ---------------- API helper ---------------- */
async function api(path, { method = 'GET', body, isForm = false, adminPin } = {}) {
  const headers = {};
  if (adminPin) headers['x-admin-pin'] = adminPin;
  const opts = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`/api${path}`, opts);
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString();
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function verifiedBadge(verified) {
  if (!verified) return '';
  return `<span class="verified-badge" title="Verified"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>`;
}

function avatarEl(user, size = 'sm') {
  const cls = size === 'lg' ? 'profile-avatar-lg' : 'avatar';
  const placeholderCls = size === 'lg' ? 'profile-avatar-placeholder-lg' : 'avatar-placeholder';
  if (user && user.avatar_url) {
    return `<img class="${cls}" src="${esc(user.avatar_url)}" alt="${esc(user.username)}" />`;
  }
  const initial = user && user.username ? user.username[0].toUpperCase() : '?';
  return `<div class="${placeholderCls}">${esc(initial)}</div>`;
}

let seqCounter = 1;
function revisionStamp() {
  return `NO. ${String(seqCounter++).padStart(3, '0')}`;
}

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    const { user } = await api('/auth/me');
    state.user = user;
    navigate('feed');
  } catch {
    state.user = null;
    navigate('auth');
  }
}

function navigate(view, params = {}) {
  state.view = view;
  state.viewParams = params;
  render();
  window.scrollTo(0, 0);
}

/* ---------------- Render dispatch ---------------- */
function render() {
  seqCounter = 1;
  if (!state.user && state.view !== 'auth' && state.view !== 'admin') {
    state.view = 'auth';
  }
  bottomNav.classList.toggle('hidden', !state.user || state.view === 'auth' || state.view === 'admin');
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });

  switch (state.view) {
    case 'auth': return renderAuth();
    case 'feed': return renderFeed();
    case 'reels': return renderReels();
    case 'new-post': return renderNewPost();
    case 'messages': return renderConversationList();
    case 'chat': return renderChat(state.viewParams.conversationId);
    case 'new-group': return renderNewGroup();
    case 'group-members': return renderGroupMembers(state.viewParams.conversationId);
    case 'profile': return renderProfile(state.viewParams.username || (state.user && state.user.username));
    case 'edit-profile': return renderEditProfile();
    case 'admin': return renderAdmin();
    default: return renderFeed();
  }
}

/* ---------------- Topbar ---------------- */
function topbar(title, opts = {}) {
  return `
    <div class="topbar">
      ${opts.back
        ? `<button class="icon-btn" data-action="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>`
        : `<div class="brand"><span class="brand-mark">M</span>USTY</div>`}
      ${title ? `<div class="section-title">${esc(title)}</div>` : ''}
      <div class="topbar-actions">${opts.actions || ''}</div>
    </div>`;
}

/* ================= AUTH ================= */
function renderAuth() {
  const isLogin = state.authMode === 'login';
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo"><span class="brand-mark">M</span>USTY</div>
      <div class="auth-tag">DRAFT &middot; POST &middot; CONNECT</div>
      <div class="card auth-card">
        <div class="crop-tr"></div><div class="crop-bl"></div>
        <div class="revision-stamp" style="margin-bottom:12px;">${isLogin ? 'NO. 001 — SIGN IN' : 'NO. 002 — NEW ACCOUNT'}</div>
        <form id="auth-form">
          <div class="field">
            <label>Username</label>
            <input type="text" name="username" autocomplete="username" required maxlength="20" />
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" name="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="6" />
          </div>
          <button type="submit" class="btn btn-primary btn-block">${isLogin ? 'Sign In' : 'Create Account'}</button>
          <div id="auth-error" class="error-msg"></div>
        </form>
        <div class="auth-switch">
          ${isLogin ? "New to Musty?" : 'Already have an account?'}
          <button type="button" id="switch-mode">${isLogin ? 'Sign up' : 'Sign in'}</button>
        </div>
      </div>
    </div>`;

  document.getElementById('switch-mode').onclick = () => {
    state.authMode = isLogin ? 'signup' : 'login';
    renderAuth();
  };

  document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errBox = document.getElementById('auth-error');
    errBox.textContent = '';
    try {
      const { user } = await api(`/auth/${isLogin ? 'login' : 'signup'}`, {
        method: 'POST',
        body: { username: fd.get('username'), password: fd.get('password') },
      });
      state.user = user;
      navigate('feed');
    } catch (err) {
      errBox.textContent = err.message;
    }
  };
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  navigate('auth');
}

/* ================= FEED ================= */
async function renderFeed() {
  app.innerHTML = topbar('', {
    actions: `<button class="icon-btn" data-action="logout"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>`,
  }) + `<div id="feed-content" class="loading">Loading feed…</div>`;
  wireTopbarActions();

  try {
    const { posts } = await api('/posts/feed');
    const content = document.getElementById('feed-content');
    if (!posts.length) {
      content.innerHTML = `<div class="empty-state">NO ENTRIES YET<br/>Follow people or drop your first post.</div>`;
      return;
    }
    content.innerHTML = posts.map(postCardHTML).join('');
    wirePostCards(content);
  } catch (err) {
    document.getElementById('feed-content').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function postCardHTML(post) {
  return `
  <div class="card post-card" data-post-id="${post.id}">
    <div class="crop-tr"></div><div class="crop-bl"></div>
    ${post.is_reel ? '<span class="reel-badge">Reel</span>' : ''}
    <div class="post-header">
      <a href="#" class="profile-link" data-username="${esc(post.username)}">${avatarEl(post)}</a>
      <div class="post-meta">
        <div class="username-line"><a href="#" class="profile-link" data-username="${esc(post.username)}" style="text-decoration:none;color:inherit;">${esc(post.username)}</a>${verifiedBadge(post.verified)}</div>
        <div class="timestamp mono">${revisionStamp()} · ${timeAgo(post.created_at)}</div>
      </div>
    </div>
    ${post.media_type === 'video'
      ? `<video class="post-media" src="${esc(post.media_url)}" controls playsinline></video>`
      : `<img class="post-media" src="${esc(post.media_url)}" alt="post" />`}
    <div class="post-body">
      ${post.caption ? `<div class="post-caption"><b>${esc(post.username)}</b>${esc(post.caption)}</div>` : ''}
      <div class="post-actions">
        <button class="action-btn like-btn ${post.liked_by_me ? 'liked' : ''}" data-liked="${post.liked_by_me}">
          <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
          <span class="like-count">${post.like_count}</span>
        </button>
        <button class="action-btn comment-toggle">
          <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-4.7 7.6 8.5 8.5 0 01-9.3-1.4L3 21l1.9-5.7A8.38 8.38 0 013 11.5 8.5 8.5 0 0111.5 3h.5a8.5 8.5 0 019 8.5z"/></svg>
          <span>${post.comment_count}</span>
        </button>
        <button class="action-btn report-btn"><svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22V15"/></svg></button>
      </div>
      <div class="comment-section" style="display:none;">
        <div class="comment-list mono-list">Loading…</div>
        <form class="comment-form">
          <input type="text" name="content" placeholder="Add a comment…" maxlength="1000" required />
          <button type="submit">Post</button>
        </form>
      </div>
    </div>
  </div>`;
}

function wirePostCards(container) {
  container.querySelectorAll('.profile-link').forEach((el) => {
    el.onclick = (e) => { e.preventDefault(); navigate('profile', { username: el.dataset.username }); };
  });

  container.querySelectorAll('.post-card').forEach((card) => {
    const postId = card.dataset.postId;

    const likeBtn = card.querySelector('.like-btn');
    likeBtn.onclick = async () => {
      const liked = likeBtn.dataset.liked === 'true';
      try {
        const { likeCount, liked: nowLiked } = await api(`/posts/${postId}/like`, { method: liked ? 'DELETE' : 'POST' });
        likeBtn.dataset.liked = nowLiked;
        likeBtn.classList.toggle('liked', nowLiked);
        likeBtn.querySelector('.like-count').textContent = likeCount;
      } catch (err) { alert(err.message); }
    };

    const commentToggle = card.querySelector('.comment-toggle');
    const section = card.querySelector('.comment-section');
    let loaded = false;
    commentToggle.onclick = async () => {
      section.style.display = section.style.display === 'none' ? 'block' : 'none';
      if (section.style.display === 'block' && !loaded) {
        loaded = true;
        await loadComments(postId, section.querySelector('.comment-list'));
      }
    };

    card.querySelector('.comment-form').onsubmit = async (e) => {
      e.preventDefault();
      const input = e.target.content;
      const val = input.value.trim();
      if (!val) return;
      try {
        await api(`/posts/${postId}/comments`, { method: 'POST', body: { content: val } });
        input.value = '';
        await loadComments(postId, section.querySelector('.comment-list'));
        const countEl = commentToggle.querySelector('span');
        countEl.textContent = parseInt(countEl.textContent, 10) + 1;
      } catch (err) { alert(err.message); }
    };

    const reportBtn = card.querySelector('.report-btn');
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const reason = prompt('Why are you reporting this post? (optional)') || '';
        try {
          await api(`/posts/${postId}/report`, { method: 'POST', body: { reason } });
          alert('Reported. Thanks for flagging it.');
        } catch (err) { alert(err.message); }
      };
    }
  });
}

async function loadComments(postId, listEl) {
  listEl.innerHTML = 'Loading…';
  try {
    const { comments } = await api(`/posts/${postId}/comments`);
    if (!comments.length) { listEl.innerHTML = '<div style="color:#8896aa;font-size:12px;">No comments yet.</div>'; return; }
    listEl.innerHTML = comments.map((c) => `
      <div class="comment-row">
        ${avatarEl(c)}
        <div><b>${esc(c.username)}</b>${verifiedBadge(c.verified)} ${esc(c.content)}
        <div class="timestamp mono">${timeAgo(c.created_at)}</div></div>
      </div>`).join('');
  } catch (err) {
    listEl.innerHTML = esc(err.message);
  }
}

/* ================= REELS ================= */
async function renderReels() {
  app.innerHTML = topbar('Reels') + `<div id="reels-content" class="loading">Loading reels…</div>`;
  wireTopbarActions();
  try {
    const { posts } = await api('/posts/feed?reels=1');
    const content = document.getElementById('reels-content');
    if (!posts.length) {
      content.innerHTML = `<div class="empty-state">NO REELS YET<br/>Post a vertical video to kick things off.</div>`;
      return;
    }
    content.innerHTML = `<div class="reel-viewport">${posts.map(reelItemHTML).join('')}</div>`;
    wireReelItems(content);
  } catch (err) {
    document.getElementById('reels-content').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function reelItemHTML(post) {
  return `
  <div class="reel-item" data-post-id="${post.id}">
    <video src="${esc(post.media_url)}" loop muted playsinline autoplay></video>
    <div class="reel-overlay">
      <div class="username-line"><a href="#" class="profile-link" data-username="${esc(post.username)}" style="color:#fff;text-decoration:none;">${esc(post.username)}</a>${verifiedBadge(post.verified)}</div>
      <div class="post-caption" style="color:#fff;">${esc(post.caption || '')}</div>
    </div>
    <div class="reel-actions">
      <button class="action-btn like-btn ${post.liked_by_me ? 'liked' : ''}" data-liked="${post.liked_by_me}">
        <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
        <span class="like-count">${post.like_count}</span>
      </button>
    </div>
  </div>`;
}

function wireReelItems(container) {
  container.querySelectorAll('.profile-link').forEach((el) => {
    el.onclick = (e) => { e.preventDefault(); navigate('profile', { username: el.dataset.username }); };
  });
  container.querySelectorAll('.reel-item').forEach((item) => {
    const postId = item.dataset.postId;
    const likeBtn = item.querySelector('.like-btn');
    likeBtn.onclick = async () => {
      const liked = likeBtn.dataset.liked === 'true';
      try {
        const { likeCount, liked: nowLiked } = await api(`/posts/${postId}/like`, { method: liked ? 'DELETE' : 'POST' });
        likeBtn.dataset.liked = nowLiked;
        likeBtn.classList.toggle('liked', nowLiked);
        likeBtn.querySelector('.like-count').textContent = likeCount;
      } catch (err) { alert(err.message); }
    };
    const video = item.querySelector('video');
    video.onclick = () => (video.paused ? video.play() : video.pause());
  });
}

/* ================= NEW POST ================= */
function renderNewPost() {
  app.innerHTML = topbar('New Entry', { back: true }) + `
    <div class="new-post-form">
      <form id="post-form">
        <label class="file-drop" id="file-drop">
          <span id="drop-label">TAP TO SELECT PHOTO OR VIDEO</span>
          <input type="file" name="media" accept="image/*,video/*" required />
        </label>
        <div id="preview-wrap"></div>
        <div class="toggle-row" id="reel-toggle-row" style="display:none;">
          <div class="switch"><input type="checkbox" id="is-reel" /><span class="knob"></span></div>
          <label for="is-reel">Post as Reel (vertical video)</label>
        </div>
        <div class="field">
          <label>Caption</label>
          <textarea name="caption" maxlength="500" placeholder="Describe your drawing…"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Publish</button>
        <div id="post-error" class="error-msg" style="color:var(--amber);"></div>
      </form>
    </div>`;
  wireTopbarActions();

  const fileInput = app.querySelector('input[type=file]');
  const previewWrap = document.getElementById('preview-wrap');
  const dropLabel = document.getElementById('drop-label');
  const reelRow = document.getElementById('reel-toggle-row');

  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    dropLabel.textContent = file.name;
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    previewWrap.innerHTML = isVideo
      ? `<video class="file-preview" src="${url}" controls></video>`
      : `<img class="file-preview" src="${url}" />`;
    reelRow.style.display = isVideo ? 'flex' : 'none';
  };

  document.getElementById('post-form').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('post-error');
    errBox.textContent = '';
    const fd = new FormData(e.target);
    if (document.getElementById('is-reel').checked) fd.set('isReel', 'true');
    try {
      await api('/posts', { method: 'POST', body: fd, isForm: true });
      navigate('feed');
    } catch (err) {
      errBox.textContent = err.message;
    }
  };
}

/* ================= MESSAGES: LIST ================= */
async function renderConversationList() {
  app.innerHTML = topbar('Messages', {
    actions: `
      <button class="icon-btn" data-action="new-dm" title="New message"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
      <button class="icon-btn" data-action="new-group" title="New group"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M2 21c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><circle cx="17" cy="8" r="2.5"/><path d="M17 13c2.8 0 5 1.7 5 4.5"/></svg></button>`,
  }) + `<div id="convo-list" class="loading">Loading…</div>`;
  wireTopbarActions();

  document.querySelector('[data-action="new-dm"]').onclick = () => openNewDmModal();
  document.querySelector('[data-action="new-group"]').onclick = () => navigate('new-group');

  try {
    const { conversations } = await api('/conversations');
    const list = document.getElementById('convo-list');
    if (!conversations.length) {
      list.innerHTML = `<div class="empty-state">NO CONVERSATIONS YET<br/>Start a DM or spin up a group.</div>`;
      return;
    }
    list.innerHTML = conversations.map((c) => {
      const name = c.is_group ? c.name : (c.other_user ? c.other_user.username : 'Unknown');
      const photoUser = c.is_group ? { avatar_url: c.photo_url, username: c.name } : c.other_user;
      return `
      <div class="convo-row" data-id="${c.id}" style="cursor:pointer;">
        ${avatarEl(photoUser)}
        <div class="meta">
          <div class="name">${esc(name)}${c.is_group ? ` <span class="timestamp mono">(${c.member_count})</span>` : ''}</div>
          <div class="last">${esc(c.last_message || 'No messages yet')}</div>
        </div>
        <div class="time">${c.last_message_at ? timeAgo(c.last_message_at) : ''}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.convo-row').forEach((row) => {
      row.onclick = () => navigate('chat', { conversationId: row.dataset.id });
    });
  } catch (err) {
    document.getElementById('convo-list').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function openNewDmModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <button class="close-x">&times;</button>
      <h3 class="display" style="margin-bottom:12px;">New Message</h3>
      <div class="search-bar" style="padding:0;margin-bottom:10px;"><input type="text" id="dm-search" placeholder="Search username…" /></div>
      <div id="dm-results"></div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.close-x').onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

  const input = backdrop.querySelector('#dm-search');
  const results = backdrop.querySelector('#dm-results');
  let debounce;
  input.oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { results.innerHTML = ''; return; }
      try {
        const { users } = await api(`/users/search?q=${encodeURIComponent(q)}`);
        results.innerHTML = users.map((u) => `
          <div class="result-row" data-username="${esc(u.username)}" style="cursor:pointer;">
            ${avatarEl(u)}
            <div class="info" style="color:var(--paper);">${esc(u.username)}${verifiedBadge(u.verified)}</div>
          </div>`).join('') || '<div class="empty-state">No users found.</div>';
        results.querySelectorAll('.result-row').forEach((row) => {
          row.onclick = async () => {
            try {
              const { conversationId } = await api('/conversations/dm', { method: 'POST', body: { username: row.dataset.username } });
              backdrop.remove();
              navigate('chat', { conversationId });
            } catch (err) { alert(err.message); }
          };
        });
      } catch (err) { results.innerHTML = esc(err.message); }
    }, 250);
  };
}

/* ================= CHAT ================= */
async function renderChat(conversationId) {
  app.innerHTML = topbar('', { back: true }) + `<div id="chat-header-wrap"></div><div id="chat-body" class="chat-body loading">Loading…</div>
    <form id="msg-form" class="msg-input-bar">
      <label class="icon-btn"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg><input type="file" name="media" accept="image/*,video/*" style="display:none;" /></label>
      <input type="text" name="content" placeholder="Message…" autocomplete="off" />
      <button class="icon-btn" type="submit"><svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
    </form>`;
  wireTopbarActions();

  let members = [];
  try {
    const [convos, msgs] = await Promise.all([
      api('/conversations'),
      api(`/conversations/${conversationId}/messages`),
    ]);
    const convo = convos.conversations.find((c) => String(c.id) === String(conversationId));
    const headerWrap = document.getElementById('chat-header-wrap');
    const name = convo ? (convo.is_group ? convo.name : (convo.other_user ? convo.other_user.username : 'Chat')) : 'Chat';
    headerWrap.innerHTML = `
      <div class="chat-header">
        <div class="name">${esc(name)}</div>
        ${convo && convo.is_group ? `<button class="icon-btn" data-action="group-info"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button>` : ''}
      </div>`;
    if (convo && convo.is_group) {
      headerWrap.querySelector('[data-action="group-info"]').onclick = () => navigate('group-members', { conversationId });
    }

    renderChatMessages(msgs.messages);

    document.getElementById('msg-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const content = fd.get('content');
      const fileInput = e.target.querySelector('input[type=file]');
      if ((!content || !content.trim()) && (!fileInput.files || !fileInput.files[0])) return;
      try {
        const { message } = await api(`/conversations/${conversationId}/messages`, { method: 'POST', body: fd, isForm: true });
        appendMessage(message);
        e.target.reset();
      } catch (err) { alert(err.message); }
    };
  } catch (err) {
    document.getElementById('chat-body').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }

  function renderChatMessages(msgs) {
    const body = document.getElementById('chat-body');
    body.innerHTML = msgs.map(messageRowHTML).join('');
    body.scrollTop = body.scrollHeight;
  }

  function appendMessage(m) {
    const body = document.getElementById('chat-body');
    body.insertAdjacentHTML('beforeend', messageRowHTML(m));
    body.scrollTop = body.scrollHeight;
  }

  function messageRowHTML(m) {
    const mine = state.user && m.user_id === state.user.id;
    const media = m.media_url
      ? (/\.(mp4|webm|mov)$/i.test(m.media_url) ? `<video src="${esc(m.media_url)}" controls></video>` : `<img src="${esc(m.media_url)}" />`)
      : '';
    return `
      <div class="msg-row ${mine ? 'mine' : 'theirs'}">
        ${!mine ? `<div class="sender-label">${esc(m.username)}${verifiedBadge(m.verified)}</div>` : ''}
        <div class="msg-bubble">${esc(m.content || '')}${media}</div>
      </div>`;
  }
}

/* ================= NEW GROUP ================= */
function renderNewGroup() {
  app.innerHTML = topbar('New Group', { back: true }) + `
    <div class="new-post-form">
      <form id="group-form">
        <div class="field">
          <label>Group name</label>
          <input type="text" name="name" maxlength="60" required />
        </div>
        <label class="file-drop">
          <span>TAP TO SELECT GROUP PHOTO (optional)</span>
          <input type="file" name="groupPhoto" accept="image/*" />
        </label>
        <div class="field">
          <label>Add members (search usernames)</label>
          <input type="text" id="member-search" placeholder="Search…" />
        </div>
        <div id="member-results"></div>
        <div id="selected-members" class="mono" style="margin:10px 0;color:var(--cyan);font-size:12px;"></div>
        <button type="submit" class="btn btn-primary btn-block">Create Group</button>
        <div id="group-error" class="error-msg" style="color:var(--amber);"></div>
      </form>
    </div>`;
  wireTopbarActions();

  const selected = new Set();
  const selectedBox = document.getElementById('selected-members');
  const updateSelected = () => {
    selectedBox.textContent = selected.size ? `Selected: ${[...selected].join(', ')}` : 'No members selected yet.';
  };
  updateSelected();

  const searchInput = document.getElementById('member-search');
  const results = document.getElementById('member-results');
  let debounce;
  searchInput.oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (!q) { results.innerHTML = ''; return; }
      try {
        const { users } = await api(`/users/search?q=${encodeURIComponent(q)}`);
        results.innerHTML = users.map((u) => `
          <div class="result-row" data-username="${esc(u.username)}" style="cursor:pointer;">
            ${avatarEl(u)}
            <div class="info" style="color:var(--paper);">${esc(u.username)}</div>
            <button type="button" class="btn btn-sm btn-outline add-btn">${selected.has(u.username) ? 'Added' : 'Add'}</button>
          </div>`).join('');
        results.querySelectorAll('.result-row').forEach((row) => {
          row.querySelector('.add-btn').onclick = () => {
            selected.add(row.dataset.username);
            updateSelected();
            row.querySelector('.add-btn').textContent = 'Added';
          };
        });
      } catch (err) { results.innerHTML = esc(err.message); }
    }, 250);
  };

  document.getElementById('group-form').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('group-error');
    errBox.textContent = '';
    const fd = new FormData(e.target);
    fd.set('usernames', JSON.stringify([...selected]));
    try {
      const { conversation } = await api('/conversations/groups', { method: 'POST', body: fd, isForm: true });
      navigate('chat', { conversationId: conversation.id });
    } catch (err) { errBox.textContent = err.message; }
  };
}

/* ================= GROUP MEMBERS ================= */
async function renderGroupMembers(conversationId) {
  app.innerHTML = topbar('Group Members', { back: true }) + `<div id="members-content" class="loading">Loading…</div>`;
  wireTopbarActions();
  try {
    const { members } = await api(`/conversations/${conversationId}/members`);
    const content = document.getElementById('members-content');
    content.innerHTML = `
      <div style="padding:12px 16px;">
        <input type="text" id="add-member-input" placeholder="Add member by username…" style="width:100%;border:1px solid var(--cyan-soft);background:var(--navy-deep);color:var(--paper);border-radius:8px;padding:10px;" />
      </div>
      ${members.map((m) => `
        <div class="result-row" data-username="${esc(m.username)}">
          ${avatarEl(m)}
          <div class="info" style="color:var(--paper);">${esc(m.username)}${verifiedBadge(m.verified)}</div>
          ${state.user.username !== m.username ? `<button class="btn btn-sm btn-danger remove-btn">Remove</button>` : `<span class="timestamp mono">you</span>`}
        </div>`).join('')}
    `;
    content.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('.result-row');
        try {
          await api(`/conversations/groups/${conversationId}/members/${row.dataset.username}`, { method: 'DELETE' });
          row.remove();
        } catch (err) { alert(err.message); }
      };
    });
    const addInput = document.getElementById('add-member-input');
    addInput.onkeydown = async (e) => {
      if (e.key !== 'Enter') return;
      const username = addInput.value.trim();
      if (!username) return;
      try {
        await api(`/conversations/groups/${conversationId}/members`, { method: 'POST', body: { username } });
        addInput.value = '';
        renderGroupMembers(conversationId);
      } catch (err) { alert(err.message); }
    };
  } catch (err) {
    document.getElementById('members-content').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

/* ================= PROFILE ================= */
async function renderProfile(username) {
  app.innerHTML = topbar('', {
    actions: username === (state.user && state.user.username)
      ? `<button class="icon-btn" data-action="logout"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>`
      : '',
  }) + `<div id="profile-content" class="loading">Loading…</div>`;
  wireTopbarActions();

  try {
    const { profile, posts } = await api(`/users/${encodeURIComponent(username)}`);
    const content = document.getElementById('profile-content');
    content.innerHTML = `
      <div class="profile-header">
        ${avatarEl(profile, 'lg')}
        <div class="profile-username">${esc(profile.username)}${verifiedBadge(profile.verified)}</div>
        ${profile.bio ? `<div class="profile-bio">${esc(profile.bio)}</div>` : ''}
        <div class="profile-stats">
          <div class="profile-stat"><span class="num">${posts.length}</span><span class="lbl">Posts</span></div>
          <div class="profile-stat"><span class="num">${profile.followerCount}</span><span class="lbl">Followers</span></div>
          <div class="profile-stat"><span class="num">${profile.followingCount}</span><span class="lbl">Following</span></div>
        </div>
        <div class="profile-actions">
          ${profile.isSelf
            ? `<button class="btn btn-outline" id="edit-profile-btn">Edit Profile</button>`
            : `<button class="btn ${profile.isFollowing ? 'btn-outline active' : 'btn-primary'}" id="follow-btn">${profile.isFollowing ? 'Following' : 'Follow'}</button>
               <button class="btn btn-outline" id="message-btn">Message</button>`}
        </div>
      </div>
      <div class="post-grid">
        ${posts.map((p) => `
          <div class="post-grid-item" data-post-id="${p.id}">
            ${p.media_type === 'video' ? `<video src="${esc(p.media_url)}" muted></video>` : `<img src="${esc(p.media_url)}" />`}
            ${p.is_reel ? `<div class="reel-flag"><svg viewBox="0 0 24 24"><path d="M4 3l16 9-16 9V3z"/></svg></div>` : ''}
          </div>`).join('') || '<div class="empty-state" style="grid-column:1/-1;">No posts yet.</div>'}
      </div>`;

    if (profile.isSelf) {
      document.getElementById('edit-profile-btn').onclick = () => navigate('edit-profile');
    } else {
      const followBtn = document.getElementById('follow-btn');
      followBtn.onclick = async () => {
        try {
          if (profile.isFollowing) {
            await api(`/users/${username}/follow`, { method: 'DELETE' });
          } else {
            await api(`/users/${username}/follow`, { method: 'POST' });
          }
          renderProfile(username);
        } catch (err) { alert(err.message); }
      };
      document.getElementById('message-btn').onclick = async () => {
        try {
          const { conversationId } = await api('/conversations/dm', { method: 'POST', body: { username } });
          navigate('chat', { conversationId });
        } catch (err) { alert(err.message); }
      };
    }
  } catch (err) {
    document.getElementById('profile-content').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function renderEditProfile() {
  const u = state.user;
  app.innerHTML = topbar('Edit Profile', { back: true }) + `
    <div class="new-post-form">
      <form id="edit-form">
        <div style="text-align:center;margin-bottom:14px;">${avatarEl(u, 'lg')}</div>
        <label class="file-drop">
          <span>CHANGE AVATAR</span>
          <input type="file" name="avatar" accept="image/*" />
        </label>
        <div class="field">
          <label>Bio</label>
          <textarea name="bio" maxlength="200">${esc(u.bio || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save</button>
        <div id="edit-error" class="error-msg" style="color:var(--amber);"></div>
      </form>
    </div>`;
  wireTopbarActions();

  document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { user } = await api('/users/me/profile', { method: 'PUT', body: fd, isForm: true });
      state.user = user;
      navigate('profile', { username: user.username });
    } catch (err) { document.getElementById('edit-error').textContent = err.message; }
  };
}

/* ================= ADMIN ================= */
function renderAdmin() {
  if (!state.adminPin) return renderAdminPinGate();

  app.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-mark">M</span>USTY <span class="brand-sub" style="margin-left:8px;">ADMIN</span></div>
      <div class="topbar-actions">
        <button class="icon-btn" id="admin-exit"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="users">Users</button>
      <button class="tab-btn" data-tab="reports">Reports</button>
    </div>
    <div id="admin-content" class="admin-wrap loading">Loading…</div>`;

  document.getElementById('admin-exit').onclick = () => {
    state.adminPin = null;
    sessionStorage.removeItem('musty_admin_pin');
    navigate(state.user ? 'feed' : 'auth');
  };

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'users') loadAdminUsers(); else loadAdminReports();
    };
  });

  loadAdminUsers();
}

function renderAdminPinGate() {
  let pin = '';
  app.innerHTML = `
    <div class="admin-pin-gate">
      <div class="auth-logo" style="font-size:36px;"><span class="brand-mark">M</span>USTY ADMIN</div>
      <div class="auth-tag">ENTER PIN</div>
      <div class="pin-dots" id="pin-dots"></div>
      <input type="tel" id="pin-input" inputmode="numeric" maxlength="8" style="opacity:0;position:absolute;pointer-events:none;" autofocus />
      <div id="pin-error" class="error-msg"></div>
      <button class="btn btn-ghost" id="pin-cancel" style="margin-top:20px;">Cancel</button>
    </div>`;

  const dotsEl = document.getElementById('pin-dots');
  const input = document.getElementById('pin-input');
  const errEl = document.getElementById('pin-error');

  function renderDots() {
    dotsEl.innerHTML = Array.from({ length: Math.max(4, pin.length) }).map((_, i) =>
      `<span class="pin-dot ${i < pin.length ? 'filled' : ''}"></span>`).join('');
  }
  renderDots();
  app.querySelector('.admin-pin-gate').onclick = () => input.focus();
  input.focus();

  input.oninput = async () => {
    pin = input.value.replace(/\D/g, '').slice(0, 8);
    renderDots();
    if (pin.length >= 4) {
      try {
        await api('/admin/users', { adminPin: pin });
        state.adminPin = pin;
        sessionStorage.setItem('musty_admin_pin', pin);
        renderAdmin();
      } catch {
        errEl.textContent = 'Incorrect PIN.';
        pin = '';
        input.value = '';
        renderDots();
      }
    }
  };

  document.getElementById('pin-cancel').onclick = () => navigate(state.user ? 'feed' : 'auth');
}

async function loadAdminUsers() {
  const content = document.getElementById('admin-content');
  content.innerHTML = `
    <div class="search-bar" style="padding:0 0 12px;"><input type="text" id="admin-user-search" placeholder="Search users…" /></div>
    <div id="admin-user-list" class="loading">Loading…</div>`;

  const listEl = document.getElementById('admin-user-list');
  async function load(q = '') {
    try {
      const { users } = await api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, { adminPin: state.adminPin });
      listEl.innerHTML = users.map(adminUserRowHTML).join('') || '<div class="empty-state">No users found.</div>';
      wireAdminUserRows(listEl);
    } catch (err) { listEl.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`; }
  }
  document.getElementById('admin-user-search').oninput = (e) => load(e.target.value.trim());
  load();
}

function adminUserRowHTML(u) {
  return `
    <div class="admin-user-row" data-id="${u.id}">
      ${avatarEl(u)}
      <div class="info">
        <b>${esc(u.username)}</b>
        ${u.verified ? '<span class="tag tag-verified">Verified</span>' : ''}
        ${u.banned ? '<span class="tag tag-banned">Banned</span>' : ''}
        ${u.restricted ? '<span class="tag tag-restricted">Restricted</span>' : ''}
        <div class="timestamp mono">${u.post_count} posts</div>
      </div>
      <div class="admin-actions">
        <button class="btn btn-sm ${u.verified ? 'btn-danger' : 'btn-primary'}" data-action="verify">${u.verified ? 'Unverify' : 'Verify'}</button>
        <button class="btn btn-sm ${u.restricted ? 'btn-outline' : 'btn-ghost'}" data-action="restrict">${u.restricted ? 'Unrestrict' : 'Restrict'}</button>
        <button class="btn btn-sm btn-danger" data-action="ban">${u.banned ? 'Unban' : 'Ban'}</button>
      </div>
    </div>`;
}

function wireAdminUserRows(listEl) {
  listEl.querySelectorAll('.admin-user-row').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="verify"]').onclick = async (e) => {
      const currentlyVerified = e.target.textContent === 'Unverify';
      try {
        await api(`/admin/users/${id}/verify`, { method: 'POST', body: { verified: !currentlyVerified }, adminPin: state.adminPin });
        loadAdminUsers();
      } catch (err) { alert(err.message); }
    };
    row.querySelector('[data-action="restrict"]').onclick = async (e) => {
      const currentlyRestricted = e.target.textContent === 'Unrestrict';
      try {
        await api(`/admin/users/${id}/restrict`, { method: 'POST', body: { restricted: !currentlyRestricted }, adminPin: state.adminPin });
        loadAdminUsers();
      } catch (err) { alert(err.message); }
    };
    row.querySelector('[data-action="ban"]').onclick = async (e) => {
      const currentlyBanned = e.target.textContent === 'Unban';
      if (!currentlyBanned && !confirm('Ban this user? Their posts and comments will be hidden.')) return;
      try {
        await api(`/admin/users/${id}/ban`, { method: 'POST', body: { banned: !currentlyBanned }, adminPin: state.adminPin });
        loadAdminUsers();
      } catch (err) { alert(err.message); }
    };
  });
}

async function loadAdminReports() {
  const content = document.getElementById('admin-content');
  content.innerHTML = `<div id="admin-report-list" class="loading">Loading…</div>`;
  const listEl = document.getElementById('admin-report-list');
  try {
    const { reports } = await api('/admin/reports', { adminPin: state.adminPin });
    listEl.innerHTML = reports.map((r) => `
      <div class="admin-user-row" data-id="${r.id}" data-post-id="${r.post_id}">
        <img src="${esc(r.media_url)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;" onerror="this.style.display='none'"/>
        <div class="info">
          <b>@${esc(r.author_username)}</b>'s post reported by @${esc(r.reporter_username)}
          <div class="timestamp mono">${esc(r.reason || 'no reason given')} · ${r.resolved ? 'resolved' : 'open'}</div>
        </div>
        <div class="admin-actions">
          <button class="btn btn-sm btn-danger" data-action="hide">${r.post_hidden ? 'Unhide post' : 'Hide post'}</button>
          ${!r.resolved ? `<button class="btn btn-sm btn-outline" data-action="resolve">Resolve</button>` : ''}
        </div>
      </div>`).join('') || '<div class="empty-state">No reports.</div>';

    listEl.querySelectorAll('.admin-user-row').forEach((row) => {
      const hideBtn = row.querySelector('[data-action="hide"]');
      if (hideBtn) hideBtn.onclick = async () => {
        const hide = hideBtn.textContent === 'Hide post';
        try {
          await api(`/admin/posts/${row.dataset.postId}/hide`, { method: 'POST', body: { hidden: hide }, adminPin: state.adminPin });
          loadAdminReports();
        } catch (err) { alert(err.message); }
      };
      const resolveBtn = row.querySelector('[data-action="resolve"]');
      if (resolveBtn) resolveBtn.onclick = async () => {
        try {
          await api(`/admin/reports/${row.dataset.id}/resolve`, { method: 'POST', adminPin: state.adminPin });
          loadAdminReports();
        } catch (err) { alert(err.message); }
      };
    });
  } catch (err) { listEl.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`; }
}

/* ================= Shared wiring ================= */
function wireTopbarActions() {
  const back = app.querySelector('[data-action="back"]');
  if (back) back.onclick = () => navigate(state.user ? 'feed' : 'auth');
  const logoutBtn = app.querySelector('[data-action="logout"]');
  if (logoutBtn) logoutBtn.onclick = logout;
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.onclick = () => navigate(btn.dataset.view);
});

// Secret admin entry: long-press/click the brand mark 5x, or visit #admin
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#admin') navigate('admin');
});
if (window.location.hash === '#admin') {
  navigate('admin');
} else {
  boot();
}
