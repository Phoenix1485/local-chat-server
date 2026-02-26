# LocalChatServer (Next.js + SSE + MySQL)

Lightweight realtime chat MVP for small groups and demos.

## Features

- Public join page with name entry
- Admin approval queue (pending, approve, reject)
- Waiting page with live status updates via SSE
- Realtime text chat for approved users via SSE
- Temporary file upload/download stored in MySQL (TTL-based cleanup)
- Admin panel with live queue and message snapshot updates
- Basic validation, rate limiting, and upload constraints

## Tech

- Next.js App Router + TypeScript
- TailwindCSS
- MySQL-backed shared state (sessions, messages, uploads, rate limits)
- SSE only (no WebSockets / Socket.IO)

## Run

```bash
npm install
npm run dev
```

Open:

- User join: `http://localhost:8080/`
- Admin panel: `http://localhost:8080/admin`
- Admin token page: `http://localhost:8080/admin/token`

## Environment variables

Required:

- `ADMIN_KEY`
- `MYSQL_URL` (for example `mysql://user:password@host:3306/database`)

Optional:

- `ADMIN_TOKEN_TTL_MINUTES` (default `480`)
- `CHAT_UPLOAD_MAX_BYTES` (default `26214400` = 25 MB)
- `CHAT_UPLOAD_MAX_TOTAL_BYTES` (default `209715200` = 200 MB)
- `CHAT_MAX_MESSAGES_IN_MEMORY` (default `300`)
- `CHAT_MAX_UPLOADS_IN_MEMORY` (default `120`)
- `CHAT_SSE_KEEP_ALIVE_MS` (default `15000`)
- `CHAT_STREAM_POLL_MS` (default `1400`)
- `CHAT_ADMIN_POLL_MS` (default `2000`)

Alternative to `MYSQL_URL`:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

## Deploy on Vercel

1. Push this project to GitHub/GitLab/Bitbucket.
2. Import the repository in Vercel as a Next.js project.
3. Add environment variables in Vercel Project Settings for the target environment (`Production`/`Preview`):
   - `ADMIN_KEY`
   - `ADMIN_TOKEN_TTL_MINUTES` (optional)
   - `MYSQL_URL` (or the split `MYSQL_*` vars)
4. Deploy.

## Notes

- On startup, API routes ensure SQL tables exist (`users`, `messages`, `uploads`, `rate_limits`).
- SSE routes use polling against MySQL so updates work across serverless instances.
- If admin auth fails after deploy, generate a fresh token from `/admin/token` on the deployed domain.
