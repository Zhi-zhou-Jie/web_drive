const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const FILES_DIR = path.join(ROOT, 'files');
const USERS_FILE = path.join(ROOT, 'users.json');
const PORT = process.env.PORT || 3000;

// ---------- 数据存储 ----------
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(path.join(FILES_DIR, '.tmp'), { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ---------- 路由安全：确保用户路径始终位于自己的目录内 ----------
function safeUserDir(username) {
  const dir = path.join(FILES_DIR, username);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function resolveUserPath(username, relPath) {
  const base = path.resolve(safeUserDir(username));
  const rel = String(relPath || '').replace(/^[/\\]+/, '').trim();
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('非法路径');
  }
  return target;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(ROOT, 'public')));

// 登录拦截中间件（文件 API 需要登录）
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: '未登录' });
}
// 页面拦截：未登录直接跳转登录页
function requirePageLogin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// ---------- 认证 API ----------
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(username)) {
    return res.status(400).json({ error: '用户名需为 2-20 位字母/数字/下划线/中文' });
  }
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  const users = loadUsers();
  if (users[username]) return res.status(409).json({ error: '用户名已存在' });

  users[username] = {
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString()
  };
  saveUsers(users);
  fs.mkdirSync(safeUserDir(username), { recursive: true });
  res.json({ ok: true, message: '注册成功' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users[username];
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  req.session.user = { username };
  res.json({ ok: true, username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session.user) res.json({ username: req.session.user.username });
  else res.json({ username: null });
});

// ---------- 文件 API ----------
app.get('/api/files', requireLogin, (req, res) => {
  try {
    const dir = resolveUserPath(req.session.user.username, req.query.path || '');
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return res.status(400).json({ error: '不是目录' });
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
      const full = path.join(dir, e.name);
      const s = fs.statSync(full);
      return {
        name: e.name,
        isDir: e.isDirectory(),
        size: e.isDirectory() ? null : s.size,
        mtime: s.mtime.toISOString()
      };
    });
    entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    res.json({ path: req.query.path || '', entries });
  } catch (err) {
    res.status(400).json({ error: err.message || '读取失败' });
  }
});

// 上传（先存临时文件，再移动到目标目录，避免重名覆盖）
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, FILES_DIR + '/.tmp'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex'))
  }),
  limits: { fileSize: 1024 * 1024 * 1024 } // 单文件最大 1GB
});

app.post('/api/upload', requireLogin, upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '没有文件' });
    const targetDir = resolveUserPath(req.session.user.username, req.body.dir || '');
    if (!fs.statSync(targetDir).isDirectory()) throw new Error('目标不是目录');
    const saved = [];
    for (const f of req.files) {
      const name = path.basename(f.originalname).replace(/[\\/:*?"'<>|]/g, '_') || 'unnamed';
      let finalPath = path.join(targetDir, name);
      let finalName = name;
      let i = 1;
      while (fs.existsSync(finalPath)) {
        finalName = `${path.parse(name).name}(${i})${path.extname(name)}`;
        finalPath = path.join(targetDir, finalName);
        i++;
      }
      fs.renameSync(f.path, finalPath);
      saved.push(finalName);
    }
    res.json({ ok: true, saved });
  } catch (err) {
    (req.files || []).forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(400).json({ error: err.message || '上传失败' });
  }
});

// 下载
app.get('/api/download', requireLogin, (req, res) => {
  try {
    const file = resolveUserPath(req.session.user.username, req.query.path || '');
    const stat = fs.statSync(file);
    if (!stat.isFile()) return res.status(400).json({ error: '不是文件' });
    res.download(file, path.basename(file));
  } catch {
    res.status(404).json({ error: '文件不存在' });
  }
});

// 删除
app.post('/api/delete', requireLogin, (req, res) => {
  try {
    const p = resolveUserPath(req.session.user.username, req.body.path || '');
    if (p === safeUserDir(req.session.user.username)) throw new Error('不能删除根目录');
    fs.rmSync(p, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || '删除失败' });
  }
});

// 新建文件夹
app.post('/api/mkdir', requireLogin, (req, res) => {
  try {
    const { path: rel, name } = req.body || {};
    if (!name) return res.status(400).json({ error: '缺少文件夹名' });
    const clean = name.replace(/[\\/:*?"'<>|]/g, '_');
    const dir = resolveUserPath(req.session.user.username, (rel || '') + '/' + clean);
    fs.mkdirSync(dir, { recursive: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.code === 'EEXIST' ? '同名文件或文件夹已存在' : (err.message || '创建失败') });
  }
});

// 重命名
app.post('/api/rename', requireLogin, (req, res) => {
  try {
    const { path: oldPath, newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: '缺少新名称' });
    const clean = newName.replace(/[\\/:*?"'<>|]/g, '_');
    const src = resolveUserPath(req.session.user.username, oldPath || '');
    const dst = path.join(path.dirname(src), clean);
    if (dst === safeUserDir(req.session.user.username)) throw new Error('非法名称');
    if (!fs.existsSync(src)) throw new Error('文件或文件夹不存在');
    if (dst === src) return res.json({ ok: true }); // 名称未变化
    if (fs.existsSync(dst)) throw new Error('同名文件或文件夹已存在');
    fs.renameSync(src, dst);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || '重命名失败' });
  }
});

// 页面路由
app.get('/login', (req, res) => {
  if (req.session.user) { res.redirect('/dashboard'); return; }
  res.sendFile(path.join(ROOT, 'public', 'login.html'));
});
app.get('/dashboard', requirePageLogin, (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'dashboard.html'));
});
app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/dashboard' : '/login');
});

app.listen(PORT, () => {
  console.log(`网盘已启动: http://localhost:${PORT}`);
});