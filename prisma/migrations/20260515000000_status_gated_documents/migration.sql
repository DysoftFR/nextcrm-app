-- CreateTable: crm_Account_Statuses
CREATE TABLE "crm_Account_Statuses" (
    "id"   UUID NOT NULL DEFAULT gen_random_uuid(),
    "__v"  INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,

    CONSTRAINT "crm_Account_Statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_Account_Statuses_name_key" ON "crm_Account_Statuses"("name");

-- CreateIndex
CREATE INDEX "crm_Account_Statuses_name_idx" ON "crm_Account_Statuses"("name");

-- Seed default account statuses (idempotent)
INSERT INTO "crm_Account_Statuses" ("name") VALUES
    ('Active'),
    ('Inactive'),
    ('Customer'),
    ('Prospect'),
    ('Lost')
ON CONFLICT ("name") DO NOTHING;

-- AlterTable: add FK column to crm_Accounts (nullable so backfill can run before constraint)
ALTER TABLE "crm_Accounts" ADD COLUMN "account_status_id" UUID;

-- Backfill: map free-string status -> FK id; unknown / null statuses -> 'Inactive'
UPDATE "crm_Accounts" a
SET    "account_status_id" = s."id"
FROM   "crm_Account_Statuses" s
WHERE  s."name" = a."status";

UPDATE "crm_Accounts"
SET    "account_status_id" = (SELECT "id" FROM "crm_Account_Statuses" WHERE "name" = 'Inactive')
WHERE  "account_status_id" IS NULL;

-- AddForeignKey
ALTER TABLE "crm_Accounts"
    ADD CONSTRAINT "crm_Accounts_account_status_id_fkey"
    FOREIGN KEY ("account_status_id")
    REFERENCES "crm_Account_Statuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "crm_Accounts_account_status_id_idx" ON "crm_Accounts"("account_status_id");

-- CreateTable: DocumentsToAccountStatuses
CREATE TABLE "DocumentsToAccountStatuses" (
    "document_id"       UUID NOT NULL,
    "account_status_id" UUID NOT NULL,

    CONSTRAINT "DocumentsToAccountStatuses_pkey" PRIMARY KEY ("document_id","account_status_id")
);

-- CreateIndex
CREATE INDEX "DocumentsToAccountStatuses_document_id_idx" ON "DocumentsToAccountStatuses"("document_id");

-- CreateIndex
CREATE INDEX "DocumentsToAccountStatuses_account_status_id_idx" ON "DocumentsToAccountStatuses"("account_status_id");

-- AddForeignKey
ALTER TABLE "DocumentsToAccountStatuses"
    ADD CONSTRAINT "DocumentsToAccountStatuses_document_id_fkey"
    FOREIGN KEY ("document_id")
    REFERENCES "Documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentsToAccountStatuses"
    ADD CONSTRAINT "DocumentsToAccountStatuses_account_status_id_fkey"
    FOREIGN KEY ("account_status_id")
    REFERENCES "crm_Account_Statuses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DocumentsToLeadStatuses
CREATE TABLE "DocumentsToLeadStatuses" (
    "document_id"    UUID NOT NULL,
    "lead_status_id" UUID NOT NULL,

    CONSTRAINT "DocumentsToLeadStatuses_pkey" PRIMARY KEY ("document_id","lead_status_id")
);

-- CreateIndex
CREATE INDEX "DocumentsToLeadStatuses_document_id_idx" ON "DocumentsToLeadStatuses"("document_id");

-- CreateIndex
CREATE INDEX "DocumentsToLeadStatuses_lead_status_id_idx" ON "DocumentsToLeadStatuses"("lead_status_id");

-- AddForeignKey
ALTER TABLE "DocumentsToLeadStatuses"
    ADD CONSTRAINT "DocumentsToLeadStatuses_document_id_fkey"
    FOREIGN KEY ("document_id")
    REFERENCES "Documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentsToLeadStatuses"
    ADD CONSTRAINT "DocumentsToLeadStatuses_lead_status_id_fkey"
    FOREIGN KEY ("lead_status_id")
    REFERENCES "crm_Lead_Statuses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
