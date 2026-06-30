# Blogfactory

AI-assisted content operations for generating, managing, scheduling, and publishing blog posts across sites.

## Stack

| Layer    | Tech                                         |
|----------|----------------------------------------------|
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui    |
| Backend  | Hono (TypeScript) with Bun for local dev     |
| Database | PostgreSQL via Drizzle ORM                   |
| Storage  | S3-compatible storage, such as Cloudflare R2 |
| Deploy   | Vercel app/API + Cloudflare cron worker      |

## Project Structure

```text
/
├── api/                  # Vercel serverless entrypoint
│   └── index.ts          # Loads the Hono app from server/src/index.ts
│
├── server/               # Hono backend
│   └── src/
│       ├── db/           # Drizzle schema, migrations, and database client
│       ├── middleware/   # Auth middleware
│       ├── routes/       # API route handlers
│       └── services/     # Content, storage, publishing, and scheduler logic
│
├── web/                  # React + Vite frontend
│   └── src/
│       ├── lib/api.ts    # Calls /api/* relative URLs
│       ├── pages/        # App screens
│       └── ...
│
├── vercel.json           # Vercel build, functions, and routing config
├── wrangler.cron.jsonc   # Cloudflare Worker cron config
├── package.json          # Root npm workspaces and scripts
└── .env.example          # Copy to .env and fill in local values
```

## Local Development

### Prerequisites

- [Node.js 22](https://nodejs.org)
- [Bun](https://bun.sh) for the backend dev server
- A PostgreSQL database, such as Neon
- S3-compatible object storage, such as Cloudflare R2 or local MinIO

### Setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/BoraGkc/blogfactory.git
cd blogfactory
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, storage credentials, and integrations.

# 3. Run database migrations
npm run db:migrate

# 4. Start the backend and frontend together
npm run dev
```

Local services:

| Service  | URL                   |
|----------|-----------------------|
| API      | http://localhost:3000 |
| Frontend | http://localhost:8080 |

The frontend calls `/api/*`. In local development, Vite proxies those requests to the backend.

### Workspace Commands

```bash
# Frontend only
npm run dev --workspace=web

# Backend only
npm run dev --workspace=server

# Build frontend
npm run build

# Generate a migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate
```

## Environment Variables

Copy `.env.example` to `.env` for local development. The main values are:

| Variable                    | Description                                      |
|-----------------------------|--------------------------------------------------|
| `DATABASE_URL`              | PostgreSQL connection string                     |
| `JWT_SECRET`                | Secret used for auth tokens                      |
| `ADMIN_EMAILS`              | Comma-separated admin email list                 |
| `API_KEY_ENCRYPTION_SECRET` | Secret used to encrypt stored API keys           |
| `CRON_SECRET`               | Bearer token for protected cron drains           |
| `S3_ENDPOINT`               | S3-compatible endpoint URL                       |
| `S3_ACCESS_KEY_ID`          | Storage access key                               |
| `S3_SECRET_ACCESS_KEY`      | Storage secret key                               |
| `S3_BUCKET`                 | Storage bucket name                              |
| `S3_REGION`                 | Storage region, or `auto` for Cloudflare R2      |
| `S3_PUBLIC_URL`             | Optional public CDN URL for stored assets        |
OpenRouter, Google Gemini, and publishing integration credentials are stored per user from the app's Settings and Integrations areas.

## Deploying to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), create a new project from `BoraGkc/blogfactory`.
3. Leave the root directory as `./`.
4. Add the required environment variables from `.env.example`.
5. Deploy.

Vercel builds `web/`, serves `web/dist`, and routes `/api/*` requests through the single serverless entrypoint at `api/index.ts`, which loads the Hono backend from `server/src/index.ts`.

Run `npm run db:migrate` with the production `DATABASE_URL` before or after the first deploy so the database schema is ready.

## Cloudflare Cron

Vercel cron is not used. Cloudflare Worker Cron calls the protected backend drain endpoint:

```bash
npm run cron:dry-run
npm run cron:deploy
```

Set the Worker secret to the same value as the backend `CRON_SECRET`:

```bash
npx wrangler secret put CRON_SECRET --config wrangler.cron.jsonc
```

The cron worker drains images every 5 minutes, feeds hourly, and all background tasks daily.
