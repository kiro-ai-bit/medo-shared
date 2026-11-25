# medo-shared

Shared tooling packages for Medo repos (`@kiro-ai-bit/*`).

| Package                      | Purpose                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@kiro-ai-bit/eslint-config` | Flat ESLint config: `@eslint/js` + `typescript-eslint` recommended + `eslint-config-prettier`                           |
| `@kiro-ai-bit/tsconfig`      | Strict `tsc --noEmit` presets: `base.json` (NodeNext), `node.json`, `nextjs.json` (bundler resolution + JSX preserve)   |
| `@kiro-ai-bit/test-utils`    | Shared Vitest helpers: `createDeferred`, `flushPromises`, `useFakeClock`, `defineTestConfig`                            |
| `@kiro-ai-bit/eventing`      | Event transport: per-service outbox, `broker_db.events`, sequential consumers, dead letters, zod event schemas          |
| `@kiro-ai-bit/rate-limit`    | Fastify rate-limit plugin: in-memory sliding window, public/write/read scopes, internal-route bypass, 429+`Retry-After` |

## Consumption

Repos consume via GitHub Packages (exact-pinned) or `npm link` during local dev — see Map 6 ticket 02 conventions.

- ESLint: root `eslint.config.mjs` → `import config from '@kiro-ai-bit/eslint-config'; export default config;` then append repo-specific overrides (e.g. Next.js repos add `eslint-config-next`/react rules after the shared config).
- tsconfig: `"extends": "@kiro-ai-bit/tsconfig/node.json"` (backend) or `"@kiro-ai-bit/tsconfig/nextjs.json"` (frontend). `node.json` requires `@types/node` as a devDependency in the consuming repo.
- test-utils: import helpers from `@kiro-ai-bit/test-utils` in tests (Vitest peer dep).

## Scripts

- `npm test` — Vitest suite (all packages)
- `npm run lint` — ESLint flat config
- `npm run format` / `format:write` — Prettier check/write
- `npm run typecheck` — per-package `tsc --noEmit`
- `npm run build` — build packages with emit output (`test-utils`)
