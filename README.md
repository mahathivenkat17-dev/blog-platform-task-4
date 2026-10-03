# Task 4 — Blog Platform with Comments

This is a complete full-stack implementation for the Task 4 requirements.

Features:
- User registration, login and JWT authentication
- Password hashing with bcrypt
- Create, edit and delete blog posts
- Comment section for user interaction
- RESTful APIs
- SQLite database integration
- Responsive frontend

## Requirements

Node.js 18 or newer and npm.

Check:
```powershell
node -v
npm -v
```

## Run

Open PowerShell in this project folder:

```powershell
npm install
npm start
```

Open:

http://localhost:3000

The SQLite database `blog.db` is created automatically.

## Test checklist

1. Create an account.
2. Log in.
3. Create a blog post.
4. Open the post.
5. Add a comment.
6. Edit your post.
7. Delete your post.
8. Create a second account if you want to demonstrate multiple users.

## API

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/me`
- GET `/api/posts`
- GET `/api/posts/:id`
- POST `/api/posts`
- PUT `/api/posts/:id`
- DELETE `/api/posts/:id`
- POST `/api/posts/:id/comments`
- DELETE `/api/comments/:id`
- GET `/api/health`

## Project structure

```text
Blog_Platform_Task_4/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── package.json
├── server.js
├── README.md
└── .gitignore
```

After first run:
```text
blog.db
```
will be created automatically.

## GitHub

Upload the source files to GitHub. Do not upload `node_modules` or `blog.db`.

This version uses `sql.js`, a WebAssembly SQLite implementation, so it does not require Python, Visual Studio Build Tools, or a native SQLite compilation step during `npm install`.
