"use server";
import { prismadb } from "@/lib/prisma";

export interface StatusDocumentsResult {
  statusName: string | null;
  documents: Awaited<ReturnType<typeof prismadb.documents.findMany>>;
}

export const getStatusDocumentsByLeadId = async (
  leadId: string
): Promise<StatusDocumentsResult> => {
  const lead = await prismadb.crm_Leads.findUnique({
    where: { id: leadId },
    select: {
      lead_status_id: true,
      lead_status: { select: { id: true, name: true } },
    },
  });
  if (!lead?.lead_status_id) {
    return { statusName: null, documents: [] };
  }

  const documents = await prismadb.documents.findMany({
    where: {
      deletedAt: null,
      lead_status_bindings: {
        some: { lead_status_id: lead.lead_status_id },
      },
    },
    include: {
      created_by: { select: { id: true, name: true, email: true } },
      assigned_to_user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date_created: "desc" },
  });

  return {
    statusName: lead.lead_status?.name ?? null,
    documents,
  };
};
