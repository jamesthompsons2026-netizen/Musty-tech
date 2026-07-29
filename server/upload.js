const multer = require('multer');
const path = require('path');
const fs = require('fs');

// NOTE: This stores media on local disk. That's fine for small deployments,
// but on Railway the filesystem is ephemeral across redeploys/restarts —
// for production scale, swap this storage engine for S3 or Cloudflare R2
// (multer-s3 or a presigned-upload flow) so media survives deploys and
// scales across multiple instances.

const dirs = {
  images: path.join(__dirname, '..', 'uploads', 'images'),
  videos: path.join(__dirname, '..', 'uploads', 'videos'),
  avatars: path.join(__dirname, '..', 'uploads', 'avatars'),
  groups: path.join(__dirname, '..', 'uploads', 'groups'),
};
Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));

function pickDir(fieldname, mimetype) {
  if (fieldname === 'avatar') return dirs.avatars;
  if (fieldname === 'groupPhoto') return dirs.groups;
  if (mimetype && mimetype.startsWith('video/')) return dirs.videos;
  return dirs.images;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pickDir(file.fieldname, file.mimetype)),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '';
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, name);
  },
});

const ALLOWED = /image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)/;

function fileFilter(req, file, cb) {
  if (ALLOWED.test(file.mimetype)) return cb(null, true);
  cb(new Error('Unsupported file type. Use JPG, PNG, GIF, WEBP, MP4, WEBM, or MOV.'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB ceiling for reels/videos
});

function publicPathFor(file) {
  const folder = path.basename(path.dirname(file.path));
  return `/uploads/${folder}/${file.filename}`;
}

module.exports = { upload, publicPathFor };
