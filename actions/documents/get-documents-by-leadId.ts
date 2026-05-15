import { prismadb } from "@/lib/prisma";

export const getDocumentsByLeadId = async (leadId: string) => {
  const data = await prismadb.documents.findMany({
    where: {
      deletedAt: null,
      leads: {
        some: {
          lead_id: leadId,
        },
      },
    },
    include: {
      created_by: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assigned_to_user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      date_created: "desc",
    },
  });
  return data;
};
