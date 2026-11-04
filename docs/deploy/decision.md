# ADR: Deploy SmartKitchen backend to Render with Docker (not Vercel)

- **Status:** Proposed — configuration prepared, nothing deployed yet (#70)
- **Date:** 2026-11-04
- **Owner:** Nguyễn Văn Huy (infra)
- **Config:** [`deploy/render.yaml`](../../deploy/render.yaml) · Checklist: [checklist.md](checklist.md)

## Context

The backend is 12 long-running Express services (1 gateway + 11 domain services) with Prisma and one PostgreSQL database per service. Some services run in-process background jobs:

- notification-service: promotion dispatch cron (`node-cron`, every 15 min)
- admin-service: health poller (every `HEALTH_POLL_INTERVAL_SECONDS`) and daily log retention

Backends trust the `x-user-id` / `x-user-role` headers that only the gateway sets (after verifying the JWT). That is only safe if **no backend is reachable from the internet**.

## Decision

Deploy with **Render**, using Docker images, from a Blueprint (`deploy/render.yaml`):

- the **gateway** is the only `web` service (public HTTPS URL);
- every backend is a **private service** (`pserv`), reachable only on Render's private network;
- one **managed PostgreSQL** per Prisma service, `ipAllowList: []` (no public access), so database-per-service is preserved;
- deploys come from `main`, but only after GitHub checks pass (`autoDeployTrigger: checksPass`);
- secrets come from Render-generated values (`generateValue`) or are set by hand (`sync: false`); none are in git.

## Why not Vercel for the backend

Vercel is a good fit for static sites and serverless frontends. It is not a fit for these services:

| Need | Vercel (serverless functions) | Render (Docker services) |
|---|---|---|
| Long-running Express process | Each request runs a short-lived function; there is no resident process | Runs the same container as `docker compose` |
| In-process cron (`node-cron`, health poller) | No resident process to run timers; would need a rewrite to Vercel Cron + HTTP endpoints | Runs as-is on one instance |
| Private networking between 12 services | No private service-to-service network; every function is public | Private network, `pserv` has no public URL |
| Prisma connections | Every cold start opens new connections; needs a pooler/Data Proxy | Long-lived connection pool per service |
| Same artifact as local and CI | Different runtime from local Docker | Identical Dockerfiles to local compose |

Vercel remains an option later for a **web frontend** only.

## Consequences and costs

Approximate list prices (verify on render.com/pricing before buying; prices change):

| Item | Plan in blueprint | Approx. USD/month |
|---|---|---|
| Web service / private service | `starter` | ~7 each |
| Managed PostgreSQL | `basic-256mb` | ~6 each |
| **Stage 1:** gateway + auth + notification + admin, 3 databases | 4 × starter + 3 × basic | **~46** |
| **Full:** 12 services + 11 databases | 12 × starter + 11 × basic | **~150** |

- **Private services and cron jobs need paid instances.** Render's free tier only covers web services, and free web services **sleep after ~15 minutes without traffic** (cold start ~1 minute). A sleeping instance runs no timers, so the promotion cron and the health poller would stop, the first health poll after waking would show every service DOWN, and the first user request would be slow. This is why the blueprint uses `starter` for everything.
- **Free Postgres databases expire** after a limited period; do not use them for data you need to keep.
- Cheaper alternative for a demo: one Postgres instance with 11 logical databases (`CREATE DATABASE …` per service). This keeps database-per-service at the schema level but shares the instance's CPU/RAM and backups. It is not in the blueprint, since each service would then need its connection string set by hand.

## Staged plan

1. **Stage 1 (now):** gateway, auth-service, notification-service, admin-service and their databases. Every other gateway route answers `503 SERVICE_UNAVAILABLE`, and the admin health dashboard shows those services as DOWN until stage 2.
2. **Stage 2 (as each service gets real endpoints):** uncomment the template blocks in `render.yaml` (one `pserv` + one database each), add the `*_SERVICE_URL` to the gateway and admin-service, redeploy.
3. Before stage 2, each owner must make their Dockerfile production-ready (see the follow-ups in the Sprint 4 report: `NODE_ENV=production`, a dedicated Prisma client, `migrate deploy` on start).

## Migrations and rollback

- Prisma services run `npx --no-install prisma migrate deploy && npm start` in their image (Dockerfile `CMD`). `migrate deploy` only applies committed migrations, is idempotent and takes a database advisory lock. It works on every plan; Render's pre-deploy command (paid plans only) is an equivalent option.
- `migrate dev` and `db push` are never used in production (enforced by `pnpm check:infra`).
- **Rollback:** Prisma has no "down" migrations.
  - App-only problem: in the Render dashboard, roll back the service to the previous deploy.
  - Write migrations backward compatible (expand → deploy code → contract in a later release), so the previous image still runs against the new schema.
  - Destructive or broken migration: restore the database from Render's backup/point-in-time recovery, then roll back the service.
