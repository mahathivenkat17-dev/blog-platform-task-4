const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "task4_blog_secret_change_me";
const DB_FILE = path.join(__dirname, "blog.db");

let db;

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  saveDatabase();
}

function lastInsertId() {
  return queryOne("SELECT last_insert_rowid() AS id").id;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

async function startServer() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, "node_modules", "sql.js", "dist", file)
  });

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  saveDatabase();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Blog API is running" });
  });

  // AUTH
  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = queryOne("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const hash = await bcrypt.hash(password, 10);
    run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [
      name.trim(), normalizedEmail, hash
    ]);

    const user = {
      id: Number(lastInsertId()),
      name: name.trim(),
      email: normalizedEmail
    };
    res.status(201).json({ user, token: createToken(user) });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = queryOne("SELECT * FROM users WHERE email = ?", [
      email.trim().toLowerCase()
    ]);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }

    const safeUser = {
      id: Number(user.id),
      name: user.name,
      email: user.email
    };
    res.json({ user: safeUser, token: createToken(safeUser) });
  });

  app.get("/api/auth/me", auth, (req, res) => {
    const user = queryOne(
      "SELECT id, name, email, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  });

  // POSTS
  app.get("/api/posts", (req, res) => {
    const posts = queryAll(`
      SELECT p.id, p.title, p.content, p.author_id, p.created_at, p.updated_at,
             u.name AS author_name,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC
    `);
    res.json(posts);
  });

  app.get("/api/posts/:id", (req, res) => {
    const post = queryOne(`
      SELECT p.id, p.title, p.content, p.author_id, p.created_at, p.updated_at,
             u.name AS author_name
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!post) return res.status(404).json({ message: "Post not found." });

    const comments = queryAll(`
      SELECT c.id, c.content, c.author_id, c.created_at, u.name AS author_name
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [req.params.id]);

    res.json({ post, comments });
  });

  app.post("/api/posts", auth, (req, res) => {
    const { title, content } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ message: "Title and content are required." });
    }

    run("INSERT INTO posts (title, content, author_id) VALUES (?, ?, ?)", [
      title.trim(), content.trim(), req.user.id
    ]);

    const post = queryOne(`
      SELECT p.*, u.name AS author_name
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.id = ?
    `, [lastInsertId()]);

    res.status(201).json(post);
  });

  app.put("/api/posts/:id", auth, (req, res) => {
    const post = queryOne("SELECT * FROM posts WHERE id = ?", [req.params.id]);
    if (!post) return res.status(404).json({ message: "Post not found." });
    if (Number(post.author_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "You can only edit your own posts." });
    }

    const { title, content } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ message: "Title and content are required." });
    }

    run(`
      UPDATE posts
      SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title.trim(), content.trim(), req.params.id]);

    res.json(queryOne(`
      SELECT p.*, u.name AS author_name
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.id = ?
    `, [req.params.id]));
  });

  app.delete("/api/posts/:id", auth, (req, res) => {
    const post = queryOne("SELECT * FROM posts WHERE id = ?", [req.params.id]);
    if (!post) return res.status(404).json({ message: "Post not found." });
    if (Number(post.author_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "You can only delete your own posts." });
    }

    run("DELETE FROM comments WHERE post_id = ?", [req.params.id]);
    run("DELETE FROM posts WHERE id = ?", [req.params.id]);
    res.json({ message: "Post deleted successfully." });
  });

  // COMMENTS
  app.post("/api/posts/:id/comments", auth, (req, res) => {
    const post = queryOne("SELECT id FROM posts WHERE id = ?", [req.params.id]);
    if (!post) return res.status(404).json({ message: "Post not found." });

    const content = req.body.content?.trim();
    if (!content) return res.status(400).json({ message: "Comment cannot be empty." });

    run(`
      INSERT INTO comments (content, post_id, author_id)
      VALUES (?, ?, ?)
    `, [content, req.params.id, req.user.id]);

    const comment = queryOne(`
      SELECT c.id, c.content, c.author_id, c.created_at, u.name AS author_name
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.id = ?
    `, [lastInsertId()]);

    res.status(201).json(comment);
  });

  app.delete("/api/comments/:id", auth, (req, res) => {
    const comment = queryOne("SELECT * FROM comments WHERE id = ?", [req.params.id]);
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    if (Number(comment.author_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "You can only delete your own comments." });
    }

    run("DELETE FROM comments WHERE id = ?", [req.params.id]);
    res.json({ message: "Comment deleted successfully." });
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Blog Platform running at http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Failed to start Blog Platform:", error);
  process.exit(1);
});
