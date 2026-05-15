"use server";
import { prismadb } from "@/lib/prisma";
import { requireAuthenticated, AuthenticationError } from "@/lib/authz";

export async function listLeadStatuses(): Promise<{ id: string; name: string }[]> {
  try {
    await requireAuthenticated();
  } catch (e) {
    if (e instanceof AuthenticationError) throw new Error("Unauthorized");
    throw e;
  }

  const rows = await prismadb.crm_Lead_Statuses.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}
