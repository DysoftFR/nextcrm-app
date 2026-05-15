# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Defaults — Always Active

These four tools are mandatory for every session in this repo. Activate them before any other work.

### 1. Caveman mode (token compression)

Default level: **`full`**. Activate at session start.

```
/caveman full
```

- Drop articles, filler, pleasantries, hedging. Fragments OK. Short synonyms. Technical terms exact.
- Keep **normal prose** in: code blocks, commit messages, PR descriptions, security warnings, irreversible-action confirmations, this file and other docs.
- Levels: `/caveman lite`, `/caveman full`, `/caveman ultra`. Disable with `stop caveman` or `normal mode`.

### 2. Brainstorming skill (before any creative work)

Invoke the `superpowers:brainstorming` skill **before** writing code for any new feature, component, behavior change, or non-trivial refactor. No exceptions for "small" features — small features grow.

```
Skill: superpowers:brainstorming
```

Explore intent, requirements, edge cases, and design alternatives **before** the first `Edit`/`Write`. If skipping (true one-line fix), state why in the response.

### 3. claude-mem (cross-session memory)

Persistent memory of past work. Installed via the Claude Code plugin marketplace:

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

> Status in this repo: installed, **worker runtime**. Memory injection auto-activates from session 2 onward. Optional one-time prime: run `/learn-codebase` (~5 min) to front-load the entire repo into memory.

Usage every session (worker-mode tool names):

- **Start of session:** check for relevant past work with `mcp__plugin_claude-mem_mcp-search__search` or `observation_search`. If the user asks "did we already solve this?" or "how did we do X before?", search first, don't re-derive.
- **During session:** record observations for non-obvious decisions, recurring bugs, gotchas, or anything that would help future-you — use `observation_add`, `observation_record_event`, or `memory_add`.
- **Project history reports:** `claude-mem:timeline-report`. **Deeper queries:** `claude-mem:mem-search`. **Timeline view:** `mcp__plugin_claude-mem_mcp-search__timeline`.
- **Do NOT use `memory_context` / `observation_context`** — those require `CLAUDE_MEM_RUNTIME=server-beta` and will error in worker mode. Use `search` / `observation_search` / `timeline` / `get_observations` instead.
- Live activity feed: http://localhost:37703.

### 4. Serena MCP (code intelligence)

Use Serena's symbolic tools instead of grep/Read for code navigation. Required at session start:

```
mcp__serena__initial_instructions     # load Serena manual
mcp__serena__activate_project         # activate this repo
```

Install/setup: see https://github.com/oraios/serena.

**Prefer Serena over raw search:**

| Task | Serena tool |
|------|------------|
| Find a symbol by name | `mcp__serena__find_symbol` |
| Find callers/usages | `mcp__serena__find_referencing_symbols` |
| Find concrete impls of interface/abstract | `mcp__serena__find_implementations` |
| Jump to definition | `mcp__serena__find_declaration` |
| High-level file/module structure | `mcp__serena__get_symbols_overview` |
| Targeted symbol-level edits | `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol` |
| Post-edit error check | `mcp__serena__get_diagnostics_for_file` |

Fall back to `Read`/`Grep`/`Edit` only when Serena's language server can't resolve the symbol (config files, JSON, markdown, generated code).

---

## Commands

Package manager: **bun** (preferred) or **pnpm**. Both lockfiles are checked in; use whichever the env already has.

```bash
# Dev — Next.js on port 3020 (NOT the default 3000), webpack bundler
bun dev

# Local infra (Postgres+pgvector, Redis, MinIO, Inngest) in Docker
bun run infra:up
bun run local:setup          # infra:up + db:generate + db:migrate + db:seed

# DB
bunx prisma generate
bunx prisma migrate deploy   # production
bunx prisma db push          # quick dev iteration on schema
bunx prisma db seed

# Build (runs prisma generate + migrate deploy + next build)
bun run build && bun run start

# Quality gates
bun run lint                 # eslint --max-warnings=0 (zero-warning policy)
bun run typecheck            # tsc --noEmit
bun run test                 # Jest unit/integration tests
bun run test:e2e             # Playwright (baseURL http://localhost:3000 — dev server runs on :3020, override if needed)

# Run a single Jest test
bun run test -- __tests__/invoices/some.test.ts
bun run test -- -t "partial test name pattern"

# Run a single Playwright test
bun run test:e2e -- tests/e2e/some.spec.ts --project=chromium
```

E2E tests authenticate via `tests/auth.setup.ts`; the `setup` Playwright project runs first and produces storage state for the rest.

## Git Workflow (Trunk-Based)

Two long-lived branches only — no feature branches for routine work.

- **`dev`** — integration; all local commits land here directly; pushes auto-deploy to the dev environment.
- **`main`** — release; updated only via PR from `dev`. `release-please` automates version bumps and `CHANGELOG.md` on `main` — do **NOT** hand-edit version fields or the changelog.

Default PR direction when the user says "create a PR": **`dev → main`** (`--base main --head dev`). Never commit directly to `main`. Never force-push `dev` or `main`.

## High-Level Architecture

Open-source CRM. Single Next.js 16 app (App Router) with PostgreSQL 17 + pgvector. ~147 server actions, ~15 API route groups, ~13 Inngest background jobs. `ARCHITECTURE.md` has the full data-model table — consult it before designing schema or cross-module work.

### Request flow
```
Page (Server Component) → Server Action (actions/**) → prismadb (lib/prisma.ts)
                                ↑ getSession() guard (lib/auth-server.ts)
                                ↓
                Client Component (TanStack Table + shadcn/ui)
                                ↓
                Mutation → Server Action → revalidatePath()
```

API routes (`app/api/`) exist for: Better Auth (`/auth/[...all]`), MinIO presigned uploads, MCP transports (`/mcp/[transport]`), Inngest event handler (`/inngest`), Resend webhooks, and CRM enrichment endpoints called from client. **Prefer server actions** for new mutations; use API routes only when an external system must POST in (webhooks) or the response shape doesn't fit RSC.

### Prisma client
`lib/prisma.ts` exports `prismadb` — a singleton with `@prisma/adapter-pg` connection pooling. Import as `import { prismadb } from "@/lib/prisma"`. Dev caches on `global.cachedPrisma`; prod creates a fresh instance.

### Auth
Better Auth with Email OTP (Resend, 5-min) + Google OAuth. Plugins: `emailOTP`, `adminPlugin` (roles `admin`/`member`/`viewer`), `testUtils` (E2E). Session via `getSession()` from `lib/auth-server.ts` — **every** server action and protected API route must call it.

```ts
"use server";
import { getSession } from "@/lib/auth-server";
import { prismadb } from "@/lib/prisma";
export async function getThing() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return prismadb.crm_Things.findMany({ where: { assigned_to: session.user.id, deletedAt: null } });
}
```

First user is auto-promoted to admin; subsequent users land in `PENDING` status (unless demo mode).

### Soft delete
All CRM entities use `deletedAt: DateTime?`. **Always include `deletedAt: null` in normal queries**. Hard delete never happens; `/admin/audit-log` lists soft-deleted records with a restore action. Field-level change history is captured via `crm_AuditLog` (action: `created`/`updated`/`deleted`/`restored`; `changes` is a JSON diff computed by `diffObjects`).

### Decimal serialization — CRITICAL
Prisma returns `Decimal` for `Decimal` columns (invoices, opportunities, contracts, products, exchange rates). `Decimal` is **not serializable** across the RSC/Client Component boundary or out of server actions. Symptoms: silent `undefined` returns, hydration mismatches, broken `router.push()` after a server action.

**Always wrap** when crossing the boundary:
```ts
import { serializeDecimals, serializeDecimalsList } from "@/lib/serialize-decimals";
return serializeDecimals(invoice);          // single object
return serializeDecimalsList(invoices);     // array
```
Do NOT shrink return shapes to `{ id }` — keep the full object via `serializeDecimals()`.

### AI / Embeddings (pgvector + Inngest)
OpenAI `text-embedding-3-small` (1536-dim) embeds CRM entities into `crm_Embeddings_*` tables with HNSW indexes. Embedding runs **async via Inngest** on entity save — do not block server actions on it. Functions live in `inngest/functions/` (`embed-*`, `embed-backfill`). Unified search combines full-text + cosine similarity; "Find Similar" buttons on detail pages use the same path.

### AI Enrichment
E2B sandbox (real Chrome) + Claude Sonnet 4.6 tool-use loop drives contact/target enrichment. Triggered via API routes (`/crm/{contacts,targets}/enrich[-bulk]`) which emit Inngest events.

**API key priority (3-tier)**: `ENV var → admin system-wide (ApiKeys scope=SYSTEM) → user profile (scope=USER)`. Keys are AES-256-GCM encrypted at rest. The old `openAi_keys` table is replaced by `ApiKeys` (provider: `OPENAI`/`FIRECRAWL`/`ANTHROPIC`/`GROQ`). When adding new LLM features, resolve keys through `lib/api-keys.ts`, not `process.env` directly.

### MCP server
`/api/mcp/[transport]` exposes 127 tools across 15 modules to external AI agents. Auth is Bearer token (`nxtc__...`); `ApiToken.tokenHash` is SHA-256 — the raw token is shown to the user exactly once. Tool definitions live under `lib/mcp/`. SSE and HTTP transports both supported.

### i18n
`next-intl`, 4 locales (`en`/`cz`/`de`/`uk`), URL-prefixed (`/en/crm/accounts`). All UI strings go in `locales/{lang}.json`. Routes live under `app/[locale]/`.

### State / UI
- Jotai atoms for cross-component state (currency, avatar).
- TanStack Table + shadcn/ui for tables; dnd-kit for kanban boards; Recharts/Tremor for charts.
- React Hook Form + Zod for forms; server actions use Zod validation directly (`create-safe-action.ts` helper).

## Conventions

- **Path alias:** `@/*` → repo root. Always use it, never relative `../../`.
- **New mutations:** server action in `actions/<module>/`, not an API route, unless an external caller needs it.
- **No `any`:** active cleanup effort; new `any` will fail review. Use `unknown` + narrowing or proper generics.
- **shadcn/ui first:** check `components/ui/` before pulling in another component library.
- **Currency-aware fields:** any `Decimal` money field needs a paired `currency` FK and an `snapshot_rate` if it crosses FX (see `crm_Opportunities`, `crm_Contracts`, `Invoices`).
- **Audit-logged entities:** when adding fields to a CRM model, ensure mutations route through the audit-log helper so diffs land in `crm_AuditLog`.
- **Inngest job auth:** background jobs run outside a user session — pass `userId` into the event payload and re-fetch on the worker side; never assume `getSession()` works there.

## Production Notes

- Postgres **must** have the `pgvector` extension enabled (CREATE EXTENSION vector). Migrations expect it.
- Inngest: prod uses Inngest Cloud (`INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`) or a self-hosted worker pointing at `/api/inngest`.
- Health: `GET /api/health` → 200 confirms server + DB reachable.
- Docker dev stack ships with placeholder `changeme` passwords for Postgres/MinIO — replace before any non-laptop deployment.
