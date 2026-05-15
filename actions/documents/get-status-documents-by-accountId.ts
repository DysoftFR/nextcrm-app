"use server";
import { prismadb } from "@/lib/prisma";

export interface StatusDocumentsResult {
  statusName: string | null;
  documents: Awaited<ReturnType<typeof prismadb.documents.findMany>>;
}

export const getStatusDocumentsByAccountId = async (
  accountId: string
): Promise<StatusDocumentsResult> => {
  const account = await prismadb.crm_Accounts.findUnique({
    where: { id: accountId },
    select: {
      account_status_id: true,
      account_status: { select: { id: true, name: true } },
    },
  });
  if (!account?.account_status_id) {
    return { statusName: null, documents: [] };
  }

  const documents = await prismadb.documents.findMany({
    where: {
      deletedAt: null,
      account_status_bindings: {
        some: { account_status_id: account.account_status_id },
      },
    },
    include: {
      created_by: { select: { id: true, name: true, email: true } },
      assigned_to_user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date_created: "desc" },
  });

  return {
    statusName: account.account_status?.name ?? null,
    documents,
  };
};
