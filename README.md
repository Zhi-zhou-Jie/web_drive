# ☁️ 简易网页网盘（web_drive）

一个基于 **Node.js + Express** 的轻量级多用户网页网盘系统，支持用户注册登录、文件上传/下载/管理，无需数据库，开箱即用。

## ✨ 功能特性

- 🔐 **用户系统**：注册、登录、登出，bcrypt 密码加密，Session 会话（7 天免登录）
- 📁 **文件管理**：浏览目录、新建文件夹、上传、下载、重命名、删除
- ⬆️ **批量上传**：最多 20 个文件同时上传，单文件最大 1GB，支持拖拽上传
- 📂 **自动重名处理**：同名文件自动命名为 `file(1).txt`
- 🛡️ **路径安全**：用户间目录隔离，有效防护路径穿越攻击
- 📱 **响应式设计**：适配桌面与移动端
- 💾 **零依赖数据库**：用户数据存于 `users.json`，文件存于本地磁盘

## 🏗️ 技术栈

| 层面 | 技术 |
|------|------|
| 后端 | Node.js + Express 4 |
| 认证 | express-session + bcryptjs |
| 文件上传 | Multer |
| 前端 | 原生 HTML / CSS / JavaScript |
| 存储 | JSON 文件 + 本地文件系统 |

## 📁 项目结构

```
web_drive/
├── server.js           # 服务端入口（全部后端逻辑）
├── package.json        # 依赖声明
├── users.json          # 用户数据（自动生成）
├── public/             # 前端静态资源
│   ├── login.html      # 登录 / 注册页
│   ├── dashboard.html  # 网盘主界面
│   └── style.css       # 全局样式
├── files/              # 用户文件存储（按用户名分目录）
│   └── .tmp/           # 上传临时目录
└── .gitignore          # Git 忽略规则
```

## 🚀 快速开始

### 环境要求

- Node.js ≥ 12

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 启动（默认端口 3000）
npm start

# 或开发模式（文件变更自动重启）
npm run dev
```

启动后访问：<http://localhost:3000>

### 自定义端口

```bash
PORT=8080 npm start
```

## 🔌 API 一览

| 方法 | 路径 | 说明 | 需登录 |
|------|------|------|--------|
| POST | `/api/register` | 注册（用户名 2-20 位，密码 ≥6 位） | ❌ |
| POST | `/api/login` | 登录 | ❌ |
| POST | `/api/logout` | 登出 | ❌ |
| GET | `/api/me` | 获取当前用户 | ❌ |
| GET | `/api/files?path=` | 列出目录内容 | ✅ |
| POST | `/api/upload` | 上传文件（FormData，`files` 字段，支持多文件） | ✅ |
| GET | `/api/download?path=` | 下载文件 | ✅ |
| POST | `/api/delete` | 删除文件/文件夹 | ✅ |
| POST | `/api/mkdir` | 新建文件夹（body: `path`、`name`） | ✅ |
| POST | `/api/rename` | 重命名（body: `path`、`newName`） | ✅ |

> 请求路径参数均相对于**当前用户的根目录**，如 `docs/报告.pdf`。

## 🛡️ 安全说明

- 密码使用 bcrypt 加盐哈希存储，不明文落盘
- Session Cookie 启用 `httpOnly`，JS 无法读取
- 上传/重命名/新建时过滤 `\ / : * ? " < > |` 等非法字符
- 用户只能访问自己的目录，`../` 等路径穿越尝试会被拒绝
- `users.json` 与 `files/` 已加入 `.gitignore`，不会误提交到版本库

## ⚠️ 已知限制

- 用户数据存于 JSON 文件，高并发写入场景下建议迁移至 SQLite / MySQL
- 不支持文件夹打包下载与文件分享链接
- 无文件搜索功能
- Session 默认存于内存，服务重启后会话失效（可接入 Redis 持久化）

## 📄 License

MIT