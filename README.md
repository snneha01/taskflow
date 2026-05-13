# ⚡ TaskFlow — Project & Task Management App

A full-stack project management web application with role-based access control, built with Node.js, Express, and SQLite.

**Live Demo:** `https://your-app.railway.app` *(replace after deploy)*

---

## 🚀 Features

### Authentication
- Signup / Login with JWT tokens (7-day expiry)
- First registered user becomes **Admin** automatically
- Secure password hashing with bcrypt

### Role-Based Access Control
| Feature | Admin | Project Admin | Member |
|---|---|---|---|
| View all projects | ✅ | ✅ | Own projects only |
| Create projects | ✅ | ✅ | ✅ |
| Edit/delete project | ✅ | ✅ | ❌ |
| Add/remove members | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ✅ |
| Edit any task | ✅ | ✅ | Own tasks only |
| Delete tasks | ✅ | ✅ | Own tasks only |
| Manage users | ✅ | ❌ | ❌ |
| View admin panel | ✅ | ❌ | ❌ |

### Project Management
- Create, edit, archive, and delete projects
- Set project deadlines and status (active/completed/archived)
- Invite members by email
- Track per-project progress

### Task Management
- Board view (Kanban) and List view
- Status: `Todo` → `In Progress` → `Review` → `Done`
- Priority levels: Low, Medium, High, Critical
- Assign tasks to team members
- Set due dates with overdue detection
- Task comments / discussions

### Dashboard
- Summary stats (projects, tasks, overdue count)
- Tasks by status and priority (bar charts)
- Overdue tasks & upcoming deadlines (7 days)
- Project progress bars
- Recent activity feed

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js 4 |
| Database | SQLite via `better-sqlite3` |
| Auth | JWT + bcrypt |
| Frontend | Vanilla HTML/CSS/JS (SPA) |
| Deployment | Railway |

---

## ⚙️ Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/taskflow.git
cd taskflow

# Install dependencies
npm install

# Start dev server (with nodemon)
npm run dev

# Or start production server
npm start
```

App runs at: `http://localhost:3000`

### Environment Variables (optional)

```env
PORT=3000
JWT_SECRET=your-secret-key-here
```

---

## 🌐 Deploy to Railway

### Method 1: GitHub (Recommended)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
   git push -u origin main
   ```

2. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app) and sign up/login
   - Click **"New Project"** → **"Deploy from GitHub repo"**
   - Select your `taskflow` repository
   - Railway auto-detects Node.js and deploys

3. **Set Environment Variables** (Railway Dashboard → Variables):
   ```
   JWT_SECRET = your-super-secret-jwt-key-min-32-chars
   NODE_ENV = production
   ```

4. **Add a Volume** (for SQLite persistence):
   - Railway Dashboard → your service → **"Volumes"** tab
   - Add volume: Mount path → `/app/data`
   - Set env var: `RAILWAY_VOLUME_MOUNT_PATH=/app/data`

5. **Done!** Railway provides a public URL like `https://taskflow-production.up.railway.app`

### Method 2: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize & deploy
railway init
railway up
```

### Important Notes for Railway
- The app uses SQLite stored in `/data/taskflow.db`
- Without a volume, data resets on each deploy — **always add a volume**
- Port is automatically set by Railway via `$PORT`
- The `railway.json` config is already included

---

## 📁 Project Structure

```
taskflow/
├── src/
│   ├── server.js          # Express app entry point
│   ├── db.js              # SQLite setup & schema
│   ├── middleware/
│   │   └── auth.js        # JWT auth + RBAC middleware
│   └── routes/
│       ├── auth.js        # Login, signup, profile
│       ├── projects.js    # Project CRUD + members
│       ├── tasks.js       # Task CRUD + comments
│       ├── dashboard.js   # Dashboard stats
│       └── users.js       # User management (admin)
├── public/
│   ├── index.html         # Single-page app shell
│   ├── css/styles.css     # All styles
│   └── js/app.js          # Frontend SPA logic
├── package.json
├── railway.json           # Railway deployment config
└── README.md
```

---

## 🔌 REST API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | ❌ | Register new user |
| POST | `/api/auth/login` | ❌ | Login |
| GET | `/api/auth/me` | ✅ | Get current user |
| PUT | `/api/auth/profile` | ✅ | Update profile |

### Projects
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/projects` | ✅ | List user's projects |
| POST | `/api/projects` | ✅ | Create project |
| GET | `/api/projects/:id` | ✅ | Get project details |
| PUT | `/api/projects/:id` | ✅ Admin | Update project |
| DELETE | `/api/projects/:id` | ✅ Admin | Delete project |
| POST | `/api/projects/:id/members` | ✅ Admin | Add member |
| PUT | `/api/projects/:id/members/:uid` | ✅ Admin | Change member role |
| DELETE | `/api/projects/:id/members/:uid` | ✅ Admin | Remove member |

### Tasks
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/tasks` | ✅ | List tasks (filterable) |
| POST | `/api/tasks` | ✅ | Create task |
| GET | `/api/tasks/:id` | ✅ | Get task + comments |
| PUT | `/api/tasks/:id` | ✅ | Update task |
| DELETE | `/api/tasks/:id` | ✅ | Delete task |
| POST | `/api/tasks/:id/comments` | ✅ | Add comment |

### Dashboard
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard` | ✅ | Dashboard data |

### Users (Admin)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | ✅ | List users |
| PUT | `/api/users/:id/role` | ✅ Admin | Change role |
| DELETE | `/api/users/:id` | ✅ Admin | Delete user |

---

## 📸 Demo Video

[2-5 minute walkthrough showing all features]

---

## 📄 License

MIT
