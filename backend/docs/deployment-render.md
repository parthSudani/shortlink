# Manual deployment preparation: Render

This guide prepares a preview deployment on Render. It does not create Render resources or deploy the application. Render's current documentation states that its free plans are for exploration, hobby projects, and previews, not production workloads. Review the linked limits before using real user or analytics data.

## Architecture and cost

The prepared Render layout is:

| Component | Render service | Plan in `render.yaml` | Notes |
| --- | --- | --- | --- |
| React dashboard | Static site | Free | Built from `frontend/`; Render CDN serves the static files. |
| NestJS API | Docker web service | Free | Sleeps after 15 minutes without inbound traffic and can take about a minute to wake. |
| Click worker | Docker background worker | `0.5c-512mb` | Paid; Render does not offer a free plan for background workers. Current pricing lists the smallest worker plan at about US$7/month. |
| PostgreSQL | Render Postgres | Free | 1 GB storage; expires 30 days after creation. No free-plan backups. |
| Redis-compatible queue/cache | Render Key Value (Valkey) | Free | 25 MB, 50 connections, no persistence; state is lost on restart or maintenance. |

This is not an all-free deployment: the worker needs a paid compute plan. Free web services receive a shared 750 instance-hours per workspace each month, may be suspended after that allotment, have ephemeral filesystems, and count toward bandwidth/build-pipeline quotas. Free PostgreSQL is limited to one active instance per workspace and has a 14-day upgrade grace period after its 30-day expiry before deletion. Free Key Value can restart at any time; it is configured with `noeviction`, so a full datastore rejects writes instead of evicting queue data. The application's click capture fails open, so Redis outages or lost Redis state can lose analytics events while redirects continue.

See Render's official [free-plan limitations](https://render.com/docs/free), [Key Value docs](https://render.com/docs/key-value), [compute plans](https://render.com/docs/compute-plans), and [pricing](https://render.com/pricing) before choosing plans. These values can change.

## Configuration included in this repository

[`render.yaml`](../render.yaml) is a Blueprint template. It uses Oregon for the database, API, worker, and Key Value so the application services can use internal datastore URLs. The Key Value allowlist is empty, which limits it to internal connections. It sets `noeviction` and the free plan's `off` persistence mode explicitly. Blueprint-managed service auto-deploy is disabled; you can trigger deployments manually in Render.

The Blueprint generates `JWT_SECRET` in Render and references the database, Key Value, and service URLs without embedding credentials. The React static site has an SPA rewrite and baseline response security headers. Inspect the plan values before applying it: the worker is intentionally set to the smallest paid plan.

## Manual service setup

You can create each resource from the Render Dashboard after connecting your repository. Keep the API, worker, PostgreSQL, and Key Value in the same Render region. Use the internal database and Key Value URLs for service-to-service connections; do not use external datastore URLs from the API or worker.

### 1. PostgreSQL

Create a Render Postgres instance, preferably in the same region as the API and worker. For a short-lived preview, select Free and use PostgreSQL 17. Copy its **internal** connection string into `DATABASE_URL` on both the API and worker. The Blueprint sets the database IP allowlist to internal-only.

### 2. Key Value for Redis

Create a Key Value instance in the same region and select the Free plan for a preview. Set its eviction policy to `noeviction` and restrict external access (the Blueprint uses `ipAllowList: []`). Copy the **internal** connection URL into `REDIS_URL` for both API and worker. Free Key Value has no persistence; do not treat it as a durable queue store.

### 3. API web service

Create a web service using the Docker runtime, repository root as the context, and `backend/Dockerfile` as the Dockerfile. Select Free for preview use. Use `/health/live` as the provider health-check path; `/health/ready` is the dependency readiness endpoint and can return 503 when PostgreSQL, Redis, or the worker heartbeat is unavailable. The worker is a separate service and does not expose an HTTP port.

Use this start command, also set in the Dockerfile's API target:

```sh
/bin/sh -c 'npm run db:migrate && node dist/main.js'
```

This explicitly applies pending Sequelize migrations before the HTTP API starts. It is safe to repeat because Sequelize tracks applied migrations. `sequelize.sync()` is disabled. Render pre-deploy commands are only available on paid web/private/worker services; on this free preview the migration runs at each API process start. If you later use a paid plan, move migrations into a pre-deploy command and start the API with `node dist/main.js` to keep them separate from process restarts.

Set these API environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` (Render's default; the API binds to `0.0.0.0`) |
| `DATABASE_URL` | PostgreSQL internal connection string |
| `REDIS_URL` | Key Value internal connection string, using `redis://` or `rediss://` as provided |
| `JWT_SECRET` | Generate a unique random secret with at least 32 characters and store it in Render's secret environment-variable UI. Do not put it in Git. |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_ISSUER` | `shortlink-api` |
| `JWT_AUDIENCE` | `shortlink-dashboard` |
| `PUBLIC_BASE_URL` | The API's assigned HTTPS URL, without a trailing slash |
| `CORS_ORIGINS` | The dashboard's assigned HTTPS origin, without a trailing slash |
| `REDIRECT_CACHE_ENABLED` | `true` |
| `CACHE_MAX_TTL_SECONDS` | `3600` |
| `REDIS_CONNECT_TIMEOUT_MS` | `5000` |
| `REDIS_COMMAND_TIMEOUT_MS` | `3000` |
| `REDIS_MAX_RETRIES_PER_REQUEST` | `1` |
| `REDIS_RETRY_MAX_ATTEMPTS` | `5` |
| `REDIS_RETRY_DELAY_MS` | `250` |
| `REDIS_SHUTDOWN_TIMEOUT_MS` | `3000` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | `20` / `60` |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `10` / `900` |
| `QUEUE_BATCH_SIZE` | `100` |
| `QUEUE_MAX_ATTEMPTS` / `QUEUE_RETRY_DELAY_MS` | `8` / `1000` |
| `QUEUE_CLAIM_IDLE_MS` | `30000` |
| `WORKER_HEARTBEAT_INTERVAL_MS` / `WORKER_HEARTBEAT_TTL_SECONDS` | `5000` / `30` |
| `PAGE_SIZE_DEFAULT` / `PAGE_SIZE_MAX` | `20` / `100` |

The API's `PUBLIC_BASE_URL`, `CORS_ORIGINS`, and dashboard `VITE_API_BASE_URL` depend on the URLs Render assigns. After the services exist, set those values and redeploy the API/dashboard as appropriate. `VITE_API_BASE_URL` is compiled into the frontend at build time.

To generate a secret locally without adding it to source control, use Node.js and paste the result directly into the Render dashboard:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Alternatively, the Blueprint uses Render's `generateValue` support to create the JWT secret automatically.

### 4. Click worker

Create a background worker with the Docker runtime, repository root as the context, and `backend/Dockerfile`. Select `0.5c-512mb` (paid; currently about US$7/month). Set the Docker command to:

```sh
node dist/worker.js
```

Set `NODE_ENV=production`, the same internal `DATABASE_URL` and `REDIS_URL` as the API, plus `REDIS_CONNECT_TIMEOUT_MS`, `REDIS_COMMAND_TIMEOUT_MS`, `REDIS_MAX_RETRIES_PER_REQUEST`, `REDIS_RETRY_MAX_ATTEMPTS`, `REDIS_RETRY_DELAY_MS`, `REDIS_SHUTDOWN_TIMEOUT_MS`, `QUEUE_BATCH_SIZE`, `QUEUE_WORKER_CONCURRENCY`, `QUEUE_MAX_ATTEMPTS`, `QUEUE_RETRY_DELAY_MS`, `QUEUE_CLAIM_IDLE_MS`, `WORKER_HEARTBEAT_INTERVAL_MS`, and `WORKER_HEARTBEAT_TTL_SECONDS`. Use the values from the API table/Blueprint; worker concurrency defaults to 2 in the Blueprint. Do not set a public port or `JWT_SECRET` on the worker.

Worker status is visible through its logs and the API's `/health/ready` and `/health/metrics` endpoints. Render HTTP health-check paths are for web/private services, not background workers. The worker handles `SIGTERM`, waits for its consumer loops to finish their current work, then closes Redis and PostgreSQL.

### 5. React dashboard

Create a Static Site from the same repository. Set the build command and publish directory to:

```sh
npm ci --prefix frontend && npm run build --prefix frontend
```

```text
frontend/dist
```

Set `VITE_API_BASE_URL` to the API's assigned HTTPS URL at build time. Add an SPA rewrite from `/*` to `/index.html` so React Router routes load on refresh. The Blueprint contains this rewrite and the response headers used by the static deployment. Static sites are served by Render's CDN and do not need an application port.

The portable Nginx container is also available at [`frontend/Dockerfile`](../frontend/Dockerfile). It builds with:

```sh
docker build --build-arg VITE_API_BASE_URL=https://<your-api-host> -f frontend/Dockerfile -t shortlink-frontend .
```

That image is optional if you use Render Static Site. Its Nginx server listens on container port 80.

## Health and URLs

- API liveness: `GET /health/live` (provider path: `/health/live`)
- API readiness: `GET /health/ready` (checks PostgreSQL, Redis, and worker heartbeat; may return 503)
- API metrics: `GET /health/metrics`
- Swagger: `/api/docs` on the API host
- Dashboard: the HTTPS URL assigned to the static site
- API and public short links: the HTTPS URL assigned to the API

Render supplies `PORT` to web services (default `10000`). The API image sets `EXPOSE 10000` and the Nest application binds to `0.0.0.0`. No listening port is needed for the worker or static site.

## Portable Docker commands

Run these from the repository root. They build separate API/worker targets from the shared NestJS Dockerfile and the production React/Nginx image:

```sh
docker build --target api -f backend/Dockerfile -t shortlink-api .
docker build --target worker -f backend/Dockerfile -t shortlink-worker .
docker build --build-arg VITE_API_BASE_URL=https://<your-api-host> -f frontend/Dockerfile -t shortlink-frontend .
```

The API image's start command applies `npm run db:migrate` before `node dist/main.js`. For a paid provider that supports a separate pre-deploy phase, run `npm run db:migrate` in that phase and use `node dist/main.js` as the start command. Worker starts with `node dist/worker.js`. No provider account, credential, live URL, or deployment is configured by this repository change.
