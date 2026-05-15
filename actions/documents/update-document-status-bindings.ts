"use server";
import {
  requireRole,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/authz";
import { prismadb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit-log";

interface UpdateDocumentStatusBindingsInput {
  documentId: string;
  accountStatusIds: string[];
  leadStatusIds: string[];
}

export async function updateDocumentStatusBindings(
  input: UpdateDocumentStatusBindingsInput
): Promise<void> {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (e) {
    if (e instanceof AuthenticationError) throw new Error("Unauthorized");
    if (e instanceof AuthorizationError) throw new Error("Forbidden");
    throw e;
  }

  const { documentId, accountStatusIds, leadStatusIds } = input;

  const before = await prismadb.documents.findUnique({
    where: { id: documentId },
    select: {
      account_status_bindings: { select: { account_status_id: true } },
      lead_status_bindings: { select: { lead_status_id: true } },
    },
  });
  if (!before) throw new Error("Document not found");

  await prismadb.$transaction(async (tx) => {
    await tx.documentsToAccountStatuses.deleteMany({ where: { document_id: documentId } });
    await tx.documentsToLeadStatuses.deleteMany({ where: { document_id: documentId } });
    if (accountStatusIds.length) {
      await tx.documentsToAccountStatuses.createMany({
        data: accountStatusIds.map((sid) => ({
          document_id: documentId,
          account_status_id: sid,
        })),
      });
    }
    if (leadStatusIds.length) {
      await tx.documentsToLeadStatuses.createMany({
        data: leadStatusIds.map((sid) => ({
          document_id: documentId,
          lead_status_id: sid,
        })),
      });
    }
  });

  await writeAuditLog({
    entityType: "document",
    entityId: documentId,
    action: "updated",
    changes: [
      {
        field: "status_bindings",
        old: {
          account_status_ids: before.account_status_bindings.map((b) => b.account_status_id),
          lead_status_ids: before.lead_status_bindings.map((b) => b.lead_status_id),
        },
        new: {
          account_status_ids: accountStatusIds,
          lead_status_ids: leadStatusIds,
        },
      },
    ],
    userId: user.id,
  });

  revalidatePath("/[locale]/(routes)/documents");
}
