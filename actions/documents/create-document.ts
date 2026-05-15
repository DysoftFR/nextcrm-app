"use server";
import {
  requireAuthenticated,
  assertCanWriteAccount,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/authz";
import { isAdmin } from "@/lib/authz/session";
import { prismadb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { inngest } from "@/inngest/client";
import { writeAuditLog } from "@/lib/audit-log";

interface CreateDocumentInput {
  name: string;
  url: string;
  key: string;
  size: number;
  mimeType: string;
  contentHash?: string;
  accountId?: string;
  account_status_ids?: string[];
  lead_status_ids?: string[];
}

export async function createDocument(input: CreateDocumentInput) {
  let user;
  try {
    user = await requireAuthenticated();
  } catch (e) {
    if (e instanceof AuthenticationError) throw new Error("Unauthorized");
    throw e;
  }

  if (input.accountId) {
    try {
      await assertCanWriteAccount(user, input.accountId);
    } catch (e) {
      if (e instanceof AuthorizationError) throw new Error("Forbidden");
      throw e;
    }
  }

  const adminCaller = isAdmin(user);
  const accountStatusIds = adminCaller ? (input.account_status_ids ?? []) : [];
  const leadStatusIds = adminCaller ? (input.lead_status_ids ?? []) : [];

  const document = await prismadb.$transaction(async (tx) => {
    const d = await tx.documents.create({
      data: {
        v: 0,
        document_name: input.name,
        description: "new document",
        document_file_url: input.url,
        key: input.key,
        size: input.size,
        document_file_mimeType: input.mimeType,
        content_hash: input.contentHash ?? null,
        processing_status: "PENDING",
        createdBy: user.id,
        assigned_user: user.id,
        ...(input.accountId
          ? { accounts: { create: { account_id: input.accountId } } }
          : {}),
      },
    });

    if (accountStatusIds.length) {
      await tx.documentsToAccountStatuses.createMany({
        data: accountStatusIds.map((sid) => ({
          document_id: d.id,
          account_status_id: sid,
        })),
      });
    }
    if (leadStatusIds.length) {
      await tx.documentsToLeadStatuses.createMany({
        data: leadStatusIds.map((sid) => ({
          document_id: d.id,
          lead_status_id: sid,
        })),
      });
    }
    return d;
  });

  if (accountStatusIds.length || leadStatusIds.length) {
    await writeAuditLog({
      entityType: "document",
      entityId: document.id,
      action: "created",
      changes: [
        {
          field: "status_bindings",
          old: null,
          new: { account_status_ids: accountStatusIds, lead_status_ids: leadStatusIds },
        },
      ],
      userId: user.id,
    });
  }

  await inngest.send({
    name: "document/uploaded",
    data: { documentId: document.id },
  });

  revalidatePath("/[locale]/(routes)/documents");
  return document;
}
