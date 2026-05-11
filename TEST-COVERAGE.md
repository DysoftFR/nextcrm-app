# Test Coverage

**97 total E2E tests · 0 unit tests · no coverage report**

Framework: Playwright (E2E) + Jest (configured, no tests written)

## E2E Tests by File

| Spec File | Tests | What's Covered |
|---|---|---|
| `auth.spec.ts` | 3 | Sign-in page, OTP flow, unauthenticated redirect |
| `home.spec.ts` | 2 | Home page load, unauthenticated redirect |
| `crm.spec.ts` | 2 | CRM accounts nav, create account |
| `account-update.spec.ts` | 1 | Row action update |
| `account-detail-update.spec.ts` | 1 | Detail page ⋯ menu update |
| `account-tasks.spec.ts` | 3 | Create task, add comment, delete task |
| `contact-update.spec.ts` | 1 | Row action update |
| `contact-detail-update.spec.ts` | 1 | Detail page ⋯ menu update |
| `lead-update.spec.ts` | 1 | Row action update |
| `lead-detail-update.spec.ts` | 1 | Detail page ⋯ menu update |
| `opportunity-update.spec.ts` | 1 | Row action update |
| `opportunity-detail-update.spec.ts` | 1 | Detail page ⋯ menu update |
| `sales-flow.spec.ts` | 4 | Full Account→Contact→Lead→Opportunity flow |
| `product-create.spec.ts` | 4 | Required fields, all fields, validation, dupe SKU |
| `product-read.spec.ts` | 5 | Table, detail page, tabs, filters |
| `product-update.spec.ts` | 3 | Name, price/status, recurring billing |
| `product-delete.spec.ts` | 2 | Confirm delete, cancel delete |
| `product-import.spec.ts` | 2 | CSV template download, CSV import preview |
| `campaign-create.spec.ts` | 7 | 4-step wizard validation + navigation |
| `campaign-list.spec.ts` | 11 | CRUD, filters, navigation |
| `campaign-detail.spec.ts` | 7 | Detail page, stats, 404 |
| `campaign-targets.spec.ts` | 14 | Targets CRUD, lists CRUD, convert to account+contact |
| `invoices.spec.ts` | 9 | Full invoice lifecycle, search, admin settings |
| `reports.spec.ts` | 11 | All report pages, KPI cards, date picker, export |

## All Test Names

### auth.spec.ts
- should show sign-in page with Google and Email OTP options
- should show OTP input after entering email
- should redirect unauthenticated users to sign-in

### home.spec.ts
- should load the home page
- should display sign-in page when not authenticated

### crm.spec.ts
- should navigate to CRM accounts page
- should be able to create a new account

### account-update.spec.ts
- should update account name via row action on /crm/accounts

### account-detail-update.spec.ts
- should update account name via ... menu on /crm/accounts/[id]

### account-tasks.spec.ts
- should create a task on an account
- should add a comment to the task
- should delete the task from the account tasks table

### contact-update.spec.ts
- should update contact last name via row action on /crm/contacts

### contact-detail-update.spec.ts
- should update contact last name via ⋯ menu on /crm/contacts/[id]

### lead-update.spec.ts
- should update lead last name via row action on /crm/leads

### lead-detail-update.spec.ts
- should update lead last name via ⋯ menu on /crm/leads/[id]

### opportunity-update.spec.ts
- should update opportunity name via row action on /crm/opportunities

### opportunity-detail-update.spec.ts
- should update opportunity name via ⋯ menu on /crm/opportunities/[id]

### sales-flow.spec.ts
- should create a new Account
- should create a new Contact linked to the Account
- should create a new Lead
- should create a new Opportunity linked to Account and Contact

### product-create.spec.ts
- should create a product with required fields only
- should create a product with all fields including recurring billing
- should show validation error when name is empty
- should handle duplicate SKU

### product-read.spec.ts
- should display products table with expected columns
- should navigate to product detail page from table
- should display product detail with tabs
- should filter products by type
- should filter products by status

### product-update.spec.ts
- should update product name via row action
- should update product price and status
- should toggle recurring and set billing period

### product-delete.spec.ts
- should delete a product via row action with confirmation
- should cancel delete via confirmation dialog

### product-import.spec.ts
- should open import dialog and download CSV template
- should import products from CSV file with preview

### campaign-create.spec.ts
- Step 1: should show validation error when name is empty
- Step 1: should fill details and advance to step 2
- Step 2: should show validation error when subject is empty
- Step 2: should navigate back to step 1 with preserved data
- Step 2: should show Choose Existing tab with templates
- Step 3: should show validation error when no list selected
- Step 4: should show validation when no schedule chosen

### campaign-list.spec.ts
- should create a target list for campaign tests
- should create a template for campaign tests
- should create a campaign via the wizard
- should display campaigns list page with table
- should filter campaigns by name
- should filter campaigns by status dropdown
- should reset filters
- should navigate to campaign detail via row action View
- should navigate to campaign detail via name link
- should delete a campaign via row action
- should navigate to new campaign page

### campaign-detail.spec.ts
- should create a target list for detail tests
- should create a template for detail tests
- should create a campaign for detail tests
- should navigate to detail page and display campaign info
- should display status badge on detail page
- should display stats grid with all metric cards
- should return 404 for non-existent campaign

### campaign-targets.spec.ts
- should display targets page with table
- should create a new target with all fields
- should filter targets by last name
- should navigate to target detail via row action View
- should update a target via row action
- should display target detail with all fields
- should convert target to account + contact
- should display target lists page with table
- should create a new target list
- should navigate to target list detail
- should add a target to the list
- should remove a target from the list
- should delete a target list via row action
- should delete a target via row action

### invoices.spec.ts
- navigates to invoices list from sidebar
- creates a new draft invoice
- issues a draft invoice
- downloads PDF of issued invoice
- adds a payment to an issued invoice
- searches for an invoice by number
- navigates to admin invoice settings
- manages tax rates in admin
- manages invoice series in admin

### reports.spec.ts
- dashboard page loads
- dashboard KPI cards are clickable
- sales report page loads
- leads report page loads
- accounts report page loads
- activity report page loads
- campaigns report page loads
- users report page loads
- date range picker works
- export CSV button exists
- navigation between reports

## Coverage Gaps

- No unit tests (Jest configured but `__tests__/` dirs empty)
- No coverage tooling configured (no `--coverage` flag, no nyc/c8)
- Untested at unit level: API routes, server actions, data models, auth logic, utility functions
- E2E tests require live server + database to run
