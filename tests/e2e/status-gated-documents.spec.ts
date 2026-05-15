import { test, expect } from "@playwright/test";
import { Pool, PoolClient } from "pg";
import { randomUUID } from "crypto";

/**
 * Status-gated documents — end-to-end verification.
 *
 * Strategy: seed a unique account + document with status binding directly via
 * SQL, drive the UI to the account detail page, assert the "For [Status] status"
 * card and doc name render. Then flip the account's status_id to a different
 * status, reload, assert the doc is gone. Cleanup deletes everything we created.
 */

type Ids = {
  accountId: string;
  documentId: string;
  activeStatusId: string;
  inactiveStatusId: string;
};

async function getStatusIds(client: PoolClient): Promise<{ active: string; inactive: string }> {
  const res = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM "crm_Account_Statuses" WHERE name IN ('Active','Inactive')`
  );
  const active = res.rows.find((r) => r.name === "Active");
  const inactive = res.rows.find((r) => r.name === "Inactive");
  if (!active || !inactive) {
    throw new Error("Seed data missing: crm_Account_Statuses must contain 'Active' and 'Inactive'");
  }
  return { active: active.id, inactive: inactive.id };
}

async function seedFixtures(client: PoolClient): Promise<Ids> {
  const { active, inactive } = await getStatusIds(client);

  const accountId = randomUUID();
  const documentId = randomUUID();
  const accountName = `E2E Status Doc Account ${Date.now()}`;
  const docName = `E2E Status Doc ${Date.now()}.pdf`;

  await client.query(
    `INSERT INTO "crm_Accounts"
       ("id","__v","name","status","account_status_id","type")
     VALUES ($1, 0, $2, 'Active', $3, 'Customer')`,
    [accountId, accountName, active]
  );

  await client.query(
    `INSERT INTO "Documents"
       ("id","document_name","document_file_url","document_file_mimeType","key","size","processing_status","version")
     VALUES ($1, $2, 'https://example.com/e2e.pdf', 'application/pdf', $3, 1024, 'READY', 1)`,
    [documentId, docName, `e2e-${documentId}`]
  );

  await client.query(
    `INSERT INTO "DocumentsToAccountStatuses" ("document_id","account_status_id")
     VALUES ($1, $2)`,
    [documentId, active]
  );

  return { accountId, documentId, activeStatusId: active, inactiveStatusId: inactive };
}

async function cleanupFixtures(client: PoolClient, ids: Ids): Promise<void> {
  // Bindings cascade on Document delete, but be explicit to be safe.
  await client.query(
    `DELETE FROM "DocumentsToAccountStatuses" WHERE document_id = $1`,
    [ids.documentId]
  );
  await client.query(`DELETE FROM "Documents" WHERE id = $1`, [ids.documentId]);
  await client.query(`DELETE FROM "crm_Accounts" WHERE id = $1`, [ids.accountId]);
}

test.describe("Status-gated documents", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  let pool: Pool;
  let client: PoolClient;
  let ids: Ids;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = await pool.connect();
    ids = await seedFixtures(client);
  });

  test.afterAll(async () => {
    try {
      await cleanupFixtures(client, ids);
    } finally {
      client.release();
      await pool.end();
    }
  });

  test("renders 'For Active status' card with the bound document on a matching account", async ({
    page,
  }) => {
    await page.goto(`/en/crm/accounts/${ids.accountId}`);
    await page.waitForURL(new RegExp(`/crm/accounts/${ids.accountId}`), { timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    // Two-section render: confirm the status-gated section heading exists.
    const statusCardTitle = page.getByRole("heading", { name: /For Active status/i });
    await expect(statusCardTitle).toBeVisible({ timeout: 10000 });

    // The bound document must appear inside the page (table or list).
    const docRow = page.getByText(/E2E Status Doc \d+\.pdf/);
    await expect(docRow.first()).toBeVisible({ timeout: 10000 });

    // The "Attached" section should also render (separate manual-attach card).
    const attachedTitle = page.getByRole("heading", { name: /^Attached$/i });
    await expect(attachedTitle).toBeVisible({ timeout: 5000 });
  });

  test("doc disappears when account status changes to Inactive", async ({ page }) => {
    // Flip status_id directly via DB (avoids relying on update-account UI selector).
    await client.query(
      `UPDATE "crm_Accounts" SET account_status_id = $1, status = 'Inactive' WHERE id = $2`,
      [ids.inactiveStatusId, ids.accountId]
    );

    await page.goto(`/en/crm/accounts/${ids.accountId}`);
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    // Title should now reflect Inactive, and the doc bound to Active must not appear.
    const newTitle = page.getByRole("heading", { name: /For Inactive status/i });
    await expect(newTitle).toBeVisible({ timeout: 10000 });

    const oldDoc = page.getByText(/E2E Status Doc \d+\.pdf/);
    await expect(oldDoc).toHaveCount(0);
  });

  test("status section hidden when account has no status_id", async ({ page }) => {
    await client.query(
      `UPDATE "crm_Accounts" SET account_status_id = NULL WHERE id = $1`,
      [ids.accountId]
    );

    await page.goto(`/en/crm/accounts/${ids.accountId}`);
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    const anyForStatus = page.getByRole("heading", { name: /^For .+ status$/i });
    await expect(anyForStatus).toHaveCount(0);

    // Attached section must still render — confirms basic page still works.
    const attachedTitle = page.getByRole("heading", { name: /^Attached$/i });
    await expect(attachedTitle).toBeVisible({ timeout: 5000 });
  });
});
