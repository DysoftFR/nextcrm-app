jest.mock("@/lib/prisma", () => ({
  prismadb: {
    crm_Accounts: { findUnique: jest.fn() },
    documents: { findMany: jest.fn() },
  },
}));

import { prismadb } from "@/lib/prisma";
import { getStatusDocumentsByAccountId } from "@/actions/documents/get-status-documents-by-accountId";

describe("getStatusDocumentsByAccountId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty when account has no status", async () => {
    (prismadb.crm_Accounts.findUnique as jest.Mock).mockResolvedValue({
      account_status_id: null,
      account_status: null,
    });
    const result = await getStatusDocumentsByAccountId("acc1");
    expect(result).toEqual({ statusName: null, documents: [] });
    expect(prismadb.documents.findMany).not.toHaveBeenCalled();
  });

  it("returns empty when account row not found", async () => {
    (prismadb.crm_Accounts.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await getStatusDocumentsByAccountId("acc2");
    expect(result).toEqual({ statusName: null, documents: [] });
  });

  it("queries documents bound to current status and excludes soft-deleted", async () => {
    (prismadb.crm_Accounts.findUnique as jest.Mock).mockResolvedValue({
      account_status_id: "status-active",
      account_status: { id: "status-active", name: "Active" },
    });
    (prismadb.documents.findMany as jest.Mock).mockResolvedValue([
      { id: "d1" },
      { id: "d2" },
    ]);

    const result = await getStatusDocumentsByAccountId("acc3");
    expect(result.statusName).toBe("Active");
    expect(result.documents).toHaveLength(2);

    const args = (prismadb.documents.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.account_status_bindings).toEqual({
      some: { account_status_id: "status-active" },
    });
    expect(args.orderBy).toEqual({ date_created: "desc" });
  });
});
