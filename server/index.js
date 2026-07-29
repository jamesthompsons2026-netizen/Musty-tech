require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');
const path = require('path');

const { pool, initSchema } = require('./db');
const { loadUser } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.set('trust proxy', 1); // needed behind Railway's proxy for secure cookies

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    name: 'musty.sid',
    secret: process.env.SESSION_SECRET || 'musty-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.use(loadUser);

// Static files: uploaded media + the frontend SPA
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/conversations', messageRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/config', (req, res) => {
  res.json({ appName: 'Musty' });
});

// Fallback to index.html for any non-API route (single-page app)
app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Multer / generic error handler
app.use((err, req, res, next) => {
  if (err) {
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || 'Server error.' });
  }
  next();
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Musty server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
