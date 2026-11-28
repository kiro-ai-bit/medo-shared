# Medo project steering

Kiroween 2026 (Costume Contest) — medicine-reminder PWA, "Monster Defense" theme.

## Working rules
- Deterministic output: identical input -> byte-identical output, every run.
- Schema > Template > Artifact; scripts do the work, AI fills structured fields only.
- Approved knowledge compounds: approvals become permanent schema/template rules.
- Concise writing; simple English; evidence-based decisions.
- TDD on every project: failing test first, always.
- 16 GB RAM workstation: Docker conservative, sequential builds, stop when done.

## Architecture
- 6 Fastify+TS+Drizzle microservices (identity, care, medicine, schedule-dose,
  notification, gamification) + Next.js 15 PWA frontend.
- Self-hosted Postgres (one container, 6 logical DBs) on AWS EC2 t3.micro + Caddy.
- Cloudflare R2 medicine photos; Vercel frontend; Postgres-outbox domain events;
  Dexie offline-first PWA.
- Domains: app.simmaps.com (Vercel), api.simmaps.com (EC2), photos.simmaps.com (R2).

## Process
wayfinder -> to-spec -> to-tickets -> implement -> code-review.
Decision tickets never mix with implementation tickets.
