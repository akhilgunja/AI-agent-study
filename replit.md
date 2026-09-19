# Study Spark

Study Spark is a student-focused AI study companion with guided chat, source-backed web research, and personalized study modes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/study-spark/src/App.tsx` — the responsive study room, research desk, and preferences screens.
- `artifacts/study-spark/src/index.css` — Study Spark's visual tokens, typography, paper texture, and motion utilities.
- `artifacts/api-server/src/routes/study.ts` — source search and student-safe study assistant API behavior.
- `lib/api-spec/openapi.yaml` — source of truth for generated study and research API clients.

## Architecture decisions

- The first release is intentionally useful without a database: preferences use local storage, while research results come from live public sources.
- The assistant keeps a student-only system boundary and enriches questions with Wikipedia and OpenAlex context before calling the model.
- The study assistant uses Groq's OpenAI-compatible API from the server. If Groq is not configured or temporarily unavailable, the API returns a clearly labeled provider message while preserving independent public-source results.

## Product

- Students can ask for explanations, step-by-step solving, revision help, and research guidance.
- The Research desk searches public educational sources and opens source cards in a new tab.
- Preferences persist the selected subject and default learning mode locally.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Chat uses the secure `GROQ_API_KEY` secret and an optional `GROQ_MODEL` environment variable. The server discovers active Groq models when no model override is provided; source search remains available when model calls are unavailable.
- Application API requests use the shared `/api` route; do not hardcode service ports in browser code.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
