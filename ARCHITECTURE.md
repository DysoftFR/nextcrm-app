# NextCRM — Architecture & Technical Map

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL 17 + pgvector extension |
| ORM | Prisma v7 + `@prisma/adapter-pg` (connection pooling) |
| Auth | Better Auth (email OTP + Google OAuth) |
| Jobs | Inngest (event-driven async) |
| Storage | MinIO (S3-compatible) |
| Email | Resend (campaigns/transactional), Nodemailer (IMAP client) |
| AI | OpenAI (embeddings + enrichment agent), Firecrawl (web scraping) |
| UI | shadcn/ui, Tailwind CSS, Jotai, TanStack Table, dnd-kit, Recharts |

---

## Database Connection

**`lib/prisma.ts`** — singleton with connection pooling:

```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const client = new PrismaClient({ adapter, log: [...] });

// Dev: global.cachedPrisma  |  Prod: fresh instance
export const prismadb = prisma;
```

- Graceful shutdown: SIGINT/SIGTERM disconnect in dev
- Env: `DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public`

---

## Data Models (`prisma/schema.prisma`)

### Core CRM

| Model | Key Fields | Key Relations |
|-------|-----------|---------------|
| `crm_Accounts` | id (UUID), name, industry (FK), annual_revenue, billing_*, status, assigned_to (FK Users) | contacts, leads, opportunities, contracts, documents, invoices, embedding |
| `crm_Contacts` | id, first_name, last_name, email, position, assigned_to (FK), account (FK), contact_type_id (FK), tags[], social_* | opportunities, documents, embedding, enrichments, emails |
| `crm_Leads` | id, firstName, lastName, company, lead_source_id (FK), lead_status_id (FK), lead_type_id (FK), assigned_to (FK) | documents, embedding |
| `crm_Opportunities` | id, name, budget (Decimal), close_date, sales_stage (FK), type (FK), status enum (ACTIVE/INACTIVE/PENDING/CLOSED), currency (FK), snapshot_rate | contacts, account, documents, lineItems, embedding |
| `crm_Contracts` | id, title, value (Decimal), startDate, endDate, status (NOTSTARTED/INPROGRESS/SIGNED), currency (FK), snapshot_rate | account, lineItems |
| `crm_Targets` | id, first_name, last_name, company, email, social_*, converted_at, converted_account_id (FK), converted_contact_id (FK) | target_lists, enrichments, campaign_sends |

### Products & Billing

| Model | Key Fields |
|-------|-----------|
| `crm_Products` | id, name, sku (unique), type (PRODUCT/SERVICE), status (DRAFT/ACTIVE/ARCHIVED), unit_price/cost (Decimal), is_recurring, billing_period enum, categoryId (FK), currency (FK) |
| `Invoices` | id, type (INVOICE/CREDIT_NOTE/PROFORMA), status (DRAFT→WRITTEN_OFF), number, accountId (FK), billingSnapshot (Json), fxRateToBase, subtotal, vatTotal, grandTotal, balanceDue, pdfStorageKey, searchVector (tsvector) |
| `Invoice_LineItems` | invoiceId, productId (FK), quantity, unitPrice, discountPercent, taxRateId (FK), lineTotal |
| `Invoice_Payments` | invoiceId, paidAt, amount, method, reference |
| `Invoice_Series` | prefixTemplate, resetPolicy (YEARLY), counter (Int) |
| `Invoice_TaxRates` | name, rate (Decimal), isDefault |
| `Invoice_Settings` | baseCurrency, defaultSeriesId, company*, bank*, footer* |
| `Currency` | code (VARCHAR 3, PK), symbol, isDefault — rel: opportunities, contracts, products, invoices |
| `ExchangeRate` | fromCurrency, toCurrency, rate, source (MANUAL/ECB), effectiveDate — unique(from, to) |

### Email & Campaigns

| Model | Key Fields |
|-------|-----------|
| `EmailAccount` | userId (FK), imapHost/Port/Ssl, smtpHost/Port/Ssl, passwordEncrypted, lastSyncedAt |
| `Email` | emailAccountId (FK), folder (INBOX/SENT), rfcMessageId, imapUid, subject, fromEmail, toRecipients (Json), bodyHtml, isRead |
| `crm_campaigns` | name, status (draft/scheduled/sending/sent/paused/deleted), template_id (FK), from_name, scheduled_at, sent_at |
| `crm_campaign_steps` | campaign_id (FK), order, template_id (FK), delay_days, send_to ("all"/"non_openers") |
| `crm_campaign_sends` | campaign_id, step_id, target_id (FK), email, status (queued/sent/delivered/bounced/failed), resend_message_id, unsubscribe_token (unique), opened_at, clicked_at |

### Tasks & Projects

| Model | Key Fields |
|-------|-----------|
| `Tasks` | title, content, priority, taskStatus (ACTIVE/PENDING/COMPLETE), section (FK Sections), user (FK Users), dueDateAt |
| `Sections` | name, board (FK Boards), position |
| `Boards` | name, user (FK Users), watchers |
| `crm_Accounts_Tasks` | same as Tasks but linked to account (FK) instead of section |

### Users & Auth

```
Users: id, email (unique), role (default="member"), is_admin, userStatus (ACTIVE/INACTIVE/PENDING),
       userLanguage (cz/en/de/uk), lastLoginAt, password, avatar
       rel: tasks, boards, leads, contacts, opportunities, accounts, contracts, campaigns,
            emailAccounts, invoices, audit_logs, apiKeys, ApiToken[]

Session, Account, Verification: Better Auth integration tables
ApiKeys:  scope (SYSTEM/USER), provider (OPENAI/FIRECRAWL/ANTHROPIC/GROQ), encryptedKey
ApiToken: tokenHash (unique), tokenPrefix, expiresAt, lastUsedAt
```

### Embeddings (pgvector, 1536-dim OpenAI)

- `crm_Embeddings_Accounts/Contacts/Leads/Opportunities/Documents` — entity_id (unique FK), embedding (vector(1536)), content_hash
- `crm_Document_Chunks` — chunk_index, chunk_text, embedding
- `EmailEmbedding` — emailId (unique FK), embedding

### Audit & Reports

| Model | Key Fields |
|-------|-----------|
| `crm_AuditLog` | entityType, entityId, action (created/updated/deleted/restored), changes (Json), userId |
| `crm_Report_Config` | category (sales/leads/accounts/activity/campaigns/users), filters (JsonB), isShared |
| `crm_Report_Schedule` | cronExpression, recipients (JsonB), format (csv/pdf/both) |
| `Activities` | type (call/meeting/note/email), date, status (scheduled/completed/cancelled), metadata (JsonB) |

### Supporting Models

- **Lookups:** `crm_Industry_Type`, `crm_Contact_Types`, `crm_Lead_Sources`, `crm_Lead_Statuses`, `crm_Lead_Types`, `crm_Opportunities_Sales_Stages`, `crm_Opportunities_Type`, `crm_ProductCategories`
- **Junction tables:** `DocumentsTo*`, `ContactsToOpportunities`, `TargetsToTargetLists`, `CampaignToTargetLists`, `AccountWatchers`, `BoardWatchers`
- **Documents:** `Documents` — versioning (parent_document_id self-ref), processing_status (PENDING/PROCESSING/READY/FAILED), content_hash, summary, thumbnail_url — rel: chunks, embedding_record

---

## Authentication (`lib/auth.ts`)

| Setting | Value |
|---------|-------|
| Library | Better Auth with Prisma adapter |
| Providers | Email OTP (Resend, 5-min expiry) + Google OAuth |
| Plugins | `emailOTP()`, `adminPlugin()` (roles: admin/member/viewer), `testUtils()` (E2E) |
| Session | 7 days, refresh every 24h |
| First user | Auto-promoted to admin |
| Subsequent users | Status = PENDING (unless demo mode) |
| Session retrieval | `getSession()` from `lib/auth-server.ts` via request headers |

---

## API Routes (`app/api/`)

### CRM

| Path | Methods | Purpose | Models |
|------|---------|---------|--------|
| `/auth/[...all]` | GET/POST | Better Auth handler | Users, Session, Account |
| `/crm/contacts/enrich` | POST | Real-time enrichment (Firecrawl+OpenAI) | crm_Contacts, enrichment |
| `/crm/contacts/enrich-bulk` | POST | Bulk enrichment | same |
| `/crm/contacts/[id]` | PATCH | Update enrichment fields | crm_Contacts |
| `/crm/contacts/create-from-remote` | POST | Create from external source | crm_Contacts |
| `/crm/targets/enrich` | POST | Enrich target | crm_Targets, enrichment |
| `/crm/targets/enrich-bulk` | POST | Bulk enrich | same |
| `/crm/targets/[id]` | PATCH | Update target enrichment | crm_Targets |
| `/crm/targets/[id]/enrich` | GET/POST | Get/trigger enrichment | crm_Target_Enrichment |
| `/crm/targets/[id]/contacts` | GET | List target contacts | crm_Target_Contact |
| `/crm/leads/create-lead-from-web` | POST | Web form lead capture | crm_Leads |

### Campaigns

| Path | Methods | Purpose | Models |
|------|---------|---------|--------|
| `/campaigns/targets/[id]` | PATCH/DELETE | Manage campaign target | crm_Targets |
| `/campaigns/unsubscribe` | POST | Token-based unsubscribe | crm_campaign_sends |
| `/campaigns/webhooks/resend` | POST | Delivery webhooks (delivered/bounced/opened/clicked) | crm_campaign_sends |

### Admin & Invoices

| Path | Methods | Purpose | Models |
|------|---------|---------|--------|
| `/admin/invoices/series` | GET/POST | Invoice series CRUD | Invoice_Series |
| `/admin/invoices/series/[id]` | GET/PATCH/DELETE | Single series | Invoice_Series |
| `/admin/invoices/tax-rates` | GET/POST | Tax rate CRUD | Invoice_TaxRates |
| `/admin/invoices/tax-rates/[id]` | GET/PATCH/DELETE | Single tax rate | Invoice_TaxRates |
| `/invoices/[invoiceId]/pdf` | GET | Download invoice PDF from MinIO | Invoices |

### System

| Path | Methods | Purpose |
|------|---------|---------|
| `/upload/presigned-url` | POST | MinIO presigned URL (whitelist: avatars/images/documents/uploads) |
| `/reports/export` | POST | Export report CSV/PDF |
| `/inngest` | POST | Inngest event handler |
| `/mcp/[transport]` | GET/POST | MCP server — 20+ CRM tools for AI agents |

> All routes except `/auth`, `/campaigns/unsubscribe`, `/campaigns/webhooks/resend` require `getSession()`.

---

## Server Actions (`actions/`, 147 files with `"use server"`)

### Pattern

```typescript
"use server";
import { getSession } from "@/lib/auth-server";
import { prismadb } from "@/lib/prisma";

export async function getAccounts() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return prismadb.crm_Accounts.findMany({
    where: { assigned_to: session.user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}
```

### Categories

| Category | Key Actions |
|----------|-------------|
| CRM fetch | get-accounts, get-contacts, get-leads, get-opportunities, get-contracts, get-targets, get-crm-data (cached) |
| CRM detail | get-[entity]-by-[relationship], get-[entity] (by ID) |
| Lookups | get-industries, get-sales-stages, get-currencies, get-contact-types, get-lead-sources/statuses/types |
| Tasks/Projects | create/update/delete-project, create/update/delete-task, add-comment, update-kanban-position |
| Invoices | create/update/duplicate/issue/cancel-invoice, add/delete-payment, send-invoice-email, regenerate-pdf |
| Campaigns | create/update/delete/schedule/pause/send-campaign, campaign template CRUD |
| Emails | get-emails (paginated IMAP), sync, accounts, messages |
| Documents | upload/update/delete/get-document, assign-document-to-[entity], link-documents |
| Reports | get-[type]-report, export-report, create-report-config, schedule-report |
| Admin | get/update/ban/approve-user, get/create/delete-api-key, invoices settings, currencies |
| Profile | update-profile, change-password, upload-avatar |

---

## Inngest Async Jobs (`inngest/functions/`)

| Job | Trigger | Action |
|-----|---------|--------|
| embed-contact/account/lead/opportunity/email | entity saved event | OpenAI embed → write to `crm_Embeddings_*` |
| embed-backfill | manual/cron | backfill all missing embeddings |
| enrich-contact/target | API call event | Firecrawl scrape → OpenAI parse → update entity |
| enrich-*-bulk | API call event | queue individual enrichments (skip if <7 days old) |
| emails/sync-all | cron | iterate all EmailAccounts → trigger sync-account |
| emails/sync-account | account event | IMAP fetch → write Email records → trigger embed |
| emails/link-crm | email synced | match addresses → create EmailsToContacts/EmailsToAccounts |
| campaigns/send-now | campaign event | batch send to target list via Resend |
| campaigns/send-step | step event | send step emails, update crm_campaign_sends |
| campaigns/process-follow-up | step done | schedule next step |
| documents/enrich-document | doc uploaded | OCR/extract → summarize → chunk → embed |
| reports/send-scheduled | cron | run report query → export → email via Resend |
| ecb/sync-exchange-rates | daily cron | fetch ECB rates → write ExchangeRate records |

---

## Frontend Data Flow

```
Page (Server Component)
  └─ Server Action (getAccounts())
       ├─ getSession()        [auth check]
       └─ prismadb.crm_Accounts.findMany(...)
            └─ Client Component (AccountsView)
                 ├─ TanStack Table + shadcn/ui
                 └─ Dialog → Server Action (create/update)
                              └─ revalidatePath()
```

- **State:** Jotai atoms (currency context, avatar context)
- **i18n:** next-intl, 4 locales (en/de/cz/uk), URL-based (`/en/crm/accounts`)
- **Charts:** Recharts (dashboard, reports)
- **Drag-drop:** dnd-kit (kanban boards)

---

## External Integrations

| Service | Library | Purpose |
|---------|---------|---------|
| Resend | `resend` v6.9.2 | Campaign emails, transactional, invoice delivery |
| Nodemailer | `nodemailer` | IMAP/SMTP email client sync |
| OpenAI | `openai` | Enrichment agent (parse Firecrawl output), text-embedding-ada-002 |
| Firecrawl | `@mendable/firecrawl-js` | Web scraping for enrichment |
| MinIO | `minio` | Object storage: documents, PDFs, avatars |
| Inngest | `inngest` | Event-driven async job queue |
| Upstash Redis | HTTP REST | Optional rate limiting |
| ECB | HTTP fetch | Daily exchange rate sync |
| E2B | `e2b` | Optional sandbox for enrichment agents |
| MCP | `@anthropic-ai/sdk` | AI agent tool exposure |

---

## Environment Variables

### Required

```env
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
RESEND_API_KEY=
OPENAI_API_KEY=
FIRECRAWL_API_KEY=
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=
INNGEST_ID=nextcrm
INNGEST_APP_NAME=NextCRM
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

### Optional

```env
GOOGLE_ID=
GOOGLE_SECRET=
EMAIL_ENCRYPTION_KEY=          # AES for IMAP passwords
RESEND_WEBHOOK_SECRET=
RESEND_FROM_EMAIL=
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
E2B_API_KEY=
ROSSUM_USERNAME=               # Invoice OCR parsing
ROSSUM_PASSWORD=
```

### Public (client-side)

```env
NEXT_PUBLIC_APP_NAME=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_V=
NEXT_PUBLIC_MINIO_ENDPOINT=
NEXT_PUBLIC_GITHUB_REPO_URL=
NEXT_PUBLIC_GITHUB_COMMIT_SHA=
```

---

## Docker (`docker-compose.yml`)

| Service | Image | Purpose |
|---------|-------|---------|
| postgres | `pgvector/pgvector:pg17` | Primary DB + vector extension |
| redis | `redis:7-alpine` | Caching, optional rate limiting |
| minio | `minio/minio:latest` | Object storage (API :9000, Console :9001) |
| app | multi-stage Dockerfile | Next.js standalone (port 3000) |
| nginx | custom | Reverse proxy (optional) |

**Build pipeline:** `pnpm build` = `prisma generate && prisma migrate deploy && next build`

**Multi-stage Dockerfile:** deps → build → runtime (standalone output)

---

## Module Summary

| Module | Features |
|--------|---------|
| Accounts | CRUD, industry/status/type, billing+shipping addresses, watchers, linked contacts/opportunities/contracts |
| Contacts | CRUD, AI enrichment, social links, tags, activity tracking, CRM linking |
| Leads | CRUD, web form capture, source/status/type lookups, conversion to contact/account |
| Opportunities | Sales pipeline, stages, expected revenue, multi-currency, line items |
| Contracts | Full lifecycle, line items, renewal tracking, multi-currency |
| Products | Catalog, categories, pricing, recurring billing, tax rates |
| Tasks | Kanban boards (Sections), assignable, comments, due dates, priority, watchers |
| Activities | Call/meeting/note/email tracking, linked to any CRM entity |
| Documents | MinIO storage, versioning, tagging, OCR/summary, embedding-based search |
| Emails | IMAP client, sync, CRM linking, embedding-based search |
| Campaigns | Multi-step sequences, target lists, delivery tracking (Resend webhooks), unsubscribe |
| Invoices | Full lifecycle (draft→paid), line items, tax rates, FX rates, PDF generation, credit notes |
| Enrichment | Real-time + bulk via Firecrawl + OpenAI agent |
| Semantic Search | pgvector (1536-dim) across contacts, opportunities, leads, documents, emails |
| Reports | Configurable (6 types), CSV/PDF export, scheduled email delivery |
| MCP | 20+ CRM tools exposed to AI agents |
| i18n | 4 locales (en/de/cz/uk) via next-intl |
