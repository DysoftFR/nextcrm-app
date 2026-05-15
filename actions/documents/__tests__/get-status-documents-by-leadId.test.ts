jest.mock("@/lib/prisma", () => ({
  prismadb: {
    crm_Leads: { findUnique: jest.fn() },
    documents: { findMany: jest.fn() },
  },
}));

import { prismadb } from "@/lib/prisma";
import { getStatusDocumentsByLeadId } from "@/actions/documents/get-status-documents-by-leadId";

describe("getStatusDocumentsByLeadId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty when lead has no status", async () => {
    (prismadb.crm_Leads.findUnique as jest.Mock).mockResolvedValue({
      lead_status_id: null,
      lead_status: null,
    });
    const result = await getStatusDocumentsByLeadId("lead1");
    expect(result).toEqual({ statusName: null, documents: [] });
    expect(prismadb.documents.findMany).not.toHaveBeenCalled();
  });

  it("queries documents bound to current lead status and excludes soft-deleted", async () => {
    (prismadb.crm_Leads.findUnique as jest.Mock).mockResolvedValue({
      lead_status_id: "status-qualified",
      lead_status: { id: "status-qualified", name: "Qualified" },
    });
    (prismadb.documents.findMany as jest.Mock).mockResolvedValue([{ id: "d1" }]);

    const result = await getStatusDocumentsByLeadId("lead2");
    expect(result.statusName).toBe("Qualified");
    expect(result.documents).toHaveLength(1);

    const args = (prismadb.documents.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.lead_status_bindings).toEqual({
      some: { lead_status_id: "status-qualified" },
    });
  });
});
