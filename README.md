# Editorial Flow

Internal editorial tooling — AI-assisted content creation and publishing.

## Stack

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui         |
| Backend  | Hono (TypeScript) running as Vercel Functions     |
| Database | PostgreSQL via [Neon](https://neon.tech)          |
| Storage  | S3-compatible (Cloudflare R2 or local MinIO)      |
| Deploy   | [Vercel](https://vercel.com) (single project)     |

## Project Structure

```
/
├── api/                  # Hono backend (Vercel serverless functions)
│   ├── index.ts          # Vercel entrypoint (wraps Hono with hono/vercel)
│   └── src/
│       ├── index.ts      # Hono app definition + Bun local server entry
│       ├── db/           # Drizzle ORM schema, migrations, db client
│       ├── middleware/   # Auth middleware
│       ├── routes/       # API route handlers
│       └── services/     # Business logic (AI, S3, publishing)
│
├── web/                  # React + Vite frontend
│   └── src/
│       ├── lib/api.ts    # Calls /api/* (relative — works both local & prod)
│       └── ...
│
├── vercel.json           # Vercel build & routing config
├── package.json          # Root npm workspaces + dev scripts
└── .env.example          # Copy to .env and fill in your values
```

## Local Development

### Prerequisites

- [Bun](https://bun.sh) (for API)
- [Node.js 20+](https://nodejs.org) (for frontend / npm workspaces)
- A PostgreSQL database (Neon free tier works great)
- S3-compatible storage (Cloudflare R2 or run MinIO locally via Docker)

### Setup

```bash
# 1. Clone and install dependencies
git clone <your-repo-url>
cd editorial-flow
npm install        # Installs workspace dependencies for both api and web

# 2. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, S3 credentials, etc.

# 3. Run database migrations
npm run db:migrate

# 4. Start both API and frontend concurrently
npm run dev
# → API available at  http://localhost:3000
# → Frontend at       http://localhost:8080  (proxies /api → localhost:3000)
```

### Individual workspace commands

```bash
# Frontend only
npm run dev --workspace=web

# Backend only (uses Bun)
npm run dev --workspace=api

# Generate new migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Leave **Root Directory** as `./` (default).
4. In **Environment Variables**, add:

   | Variable              | Description                                    |
   |-----------------------|------------------------------------------------|
   | `DATABASE_URL`        | Neon PostgreSQL connection string              |
   | `JWT_SECRET`          | Random secret: `openssl rand -base64 32`       |
   | `S3_ENDPOINT`         | R2 S3 API endpoint URL                         |
   | `S3_ACCESS_KEY_ID`    | R2 access key                                  |
   | `S3_SECRET_ACCESS_KEY`| R2 secret key                                  |
   | `S3_BUCKET`           | Bucket name                                    |
   | `S3_REGION`           | `auto` for R2                                  |
   | `S3_PUBLIC_URL`       | (Optional) CDN URL for images                  |
   | `OPENROUTER_API_KEY`  | (Optional) For AI content generation           |
   | `GOOGLE_AI_KEY`       | (Optional) For Google AI features              |
   | `WIX_API_KEY`         | (Optional) Wix publishing integration          |
   | `WIX_SITE_ID`         | (Optional) Wix site ID                         |
   | `WIX_MEMBER_ID`       | (Optional) Wix member ID                       |

5. Click **Deploy**. That's it. ✅

> **Database migrations:** Run `npm run db:migrate` locally (with your production `DATABASE_URL`) before or after your first deploy.

## Architecture Notes

- In **production on Vercel**, both the frontend and backend run on the same domain (`yourdomain.vercel.app`). The frontend calls `/api/*` and Vercel routes those requests to the Hono serverless function.
- In **local development**, Vite proxies `/api` → `http://localhost:3000` (configured in `web/vite.config.ts`), so no `VITE_API_URL` env var is needed.
- The `sharp` library is used for image processing. On Vercel, it will automatically use the correct pre-built binary for the Lambda runtime.
