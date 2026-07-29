# Musty

A blueprint/drafting-table styled social + messaging app. Feed, reels, likes,
comments, follows, verified badges, 1:1 DMs, group chats, and a PIN-gated
admin panel — Node/Express + PostgreSQL backend, vanilla JS single-page frontend.

## Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (all persistent data — no JSON files, no in-memory storage)
- **Uploads:** multer, stored on local disk under `/uploads`
- **Frontend:** single-page vanilla JS (`public/`), no build step, no framework
- **Sessions:** `express-session` backed by `connect-pg-simple` (sessions live in Postgres too, so logins survive restarts)

## Local setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (a local Postgres
   instance is fine) and, optionally, `SESSION_SECRET` and `ADMIN_PIN`.
3. Start it:
   ```
   npm start
   ```
   The server creates all tables automatically on boot (`CREATE TABLE IF NOT EXISTS`),
   so there's no separate migration step.
4. Visit `http://localhost:3000`.

## Deploying to Railway

1. Push this project to a GitHub repo (or use `railway up` from this folder).
2. Create a new Railway project from the repo.
3. Add a **PostgreSQL** plugin to the project — Railway automatically injects
   `DATABASE_URL` into your service's environment, so you don't need to set it
   by hand.
4. Set these environment variables on the service:
   - `SESSION_SECRET` — a long random string
   - `ADMIN_PIN` — defaults to `2127` if unset, but set your own for production
5. Deploy. On boot, the app runs its schema-init step automatically.

### ⚠️ Important note on file storage

Uploaded photos/videos are written to local disk (`/uploads`). This works for
a small deployment, but **Railway's filesystem is ephemeral** — files can be
lost on redeploy or when a container restarts/moves. For production-scale
media (real user growth, video-heavy reels), swap the storage layer in
`server/upload.js` for **Amazon S3 or Cloudflare R2** (e.g. via `multer-s3` or
a presigned-upload flow) so media persists independently of the app
container and can scale across multiple instances.

## Admin panel

Visit `/#admin` in the app (or just append `#admin` to the URL) to reach the
PIN gate. Enter the PIN (`ADMIN_PIN` env var, default `2127`) to reach the
panel, where you can:

- Search all users
- Grant/revoke the verified badge
- Restrict a user (blocks posting/commenting, lighter than a ban)
- Ban a user (blocks login, hides their posts/comments — fully reversible,
  no data is deleted)
- Review reported posts and hide/unhide or resolve reports

The report button is included on every post in the feed — reporting a post
files it into the admin Reports tab.

## Project structure

```
server/
  index.js            — app entry, session/middleware wiring
  db.js               — pg pool + schema (auto-created on boot)
  upload.js           — multer config (swap for S3/R2 at scale — see note above)
  middleware/auth.js  — session auth + admin PIN gate
  routes/
    auth.js           — signup / login / logout / me
    users.js          — profiles, follow/unfollow, search
    posts.js          — feed, create/delete post, like, comment, report
    messages.js        — 1:1 DMs + group chats
    admin.js           — PIN-gated moderation endpoints
public/
  index.html
  css/style.css        — blueprint/drafting-table visual identity
  js/app.js             — the entire SPA (routing, rendering, API calls)
uploads/                — local media storage (see note above)
```

## Design language

- Deep blueprint-navy shell with a faint cyan grid, cyan/blue linework, amber
  for actions and the verified badge
- Light "paper" cards for content with signature amber corner crop-marks
- Big Shoulders Display for headings, Inter for body text, JetBrains Mono for
  timestamps/metadata — plus revision-stamp numbering (`NO. 003`) on feed entries
