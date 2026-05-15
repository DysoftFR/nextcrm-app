jest.mock("@/lib/auth-server", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/prisma", () => {
  const mock: any = {
    users: { findUnique: jest.fn() },
    documents: { findUnique: jest.fn() },
    documentsToAccountStatuses: { createMany: jest.fn(), deleteMany: jest.fn() },
    documentsToLeadStatuses: { createMany: jest.fn(), deleteMany: jest.fn() },
    crm_AuditLog: { create: jest.fn() },
  };
  mock.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(mock));
  return { prismadb: mock };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { prismadb } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { updateDocumentStatusBindings } from "@/actions/documents/update-document-status-bindings";

const mockUser = (role: "user" | "manager" | "admin", id = "u1") => {
  (getSession as jest.Mock).mockResolvedValue({ user: { id } });
  (prismadb.users.findUnique as jest.Mock).mockResolvedValue({ id, role });
};

describe("updateDocumentStatusBindings", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = prismadb as any;
  beforeEach(() => jest.clearAllMocks());

  it("rejects non-admin user with Forbidden", async () => {
    mockUser("user");
    await expect(
      updateDocumentStatusBindings({
        documentId: "doc1",
        accountStatusIds: ["a1"],
        leadStatusIds: [],
      })
    ).rejects.toThrow("Forbidden");
    expect(prisma.documentsToAccountStatuses.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects non-admin manager with Forbidden", async () => {
    mockUser("manager");
    await expect(
      updateDocumentStatusBindings({
        documentId: "doc1",
        accountStatusIds: [],
        leadStatusIds: ["l1"],
      })
    ).rejects.toThrow("Forbidden");
  });

  it("rejects unauthenticated with Unauthorized", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    await expect(
      updateDocumentStatusBindings({
        documentId: "doc1",
        accountStatusIds: [],
        leadStatusIds: [],
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("admin: replaces bindings (delete + create) inside transaction", async () => {
    mockUser("admin");
    prisma.documents.findUnique.mockResolvedValue({
      account_status_bindings: [{ account_status_id: "old-a" }],
      lead_status_bindings: [{ lead_status_id: "old-l" }],
    });

    await updateDocumentStatusBindings({
      documentId: "doc1",
      accountStatusIds: ["new-a1", "new-a2"],
      leadStatusIds: ["new-l1"],
    });

    expect(prisma.documentsToAccountStatuses.deleteMany).toHaveBeenCalledWith({
      where: { document_id: "doc1" },
    });
    expect(prisma.documentsToLeadStatuses.deleteMany).toHaveBeenCalledWith({
      where: { document_id: "doc1" },
    });
    expect(prisma.documentsToAccountStatuses.createMany).toHaveBeenCalledWith({
      data: [
        { document_id: "doc1", account_status_id: "new-a1" },
        { document_id: "doc1", account_status_id: "new-a2" },
      ],
    });
    expect(prisma.documentsToLeadStatuses.createMany).toHaveBeenCalledWith({
      data: [{ document_id: "doc1", lead_status_id: "new-l1" }],
    });
  });

  it("admin: empty arrays delete bindings without creating new rows", async () => {
    mockUser("admin");
    prisma.documents.findUnique.mockResolvedValue({
      account_status_bindings: [],
      lead_status_bindings: [],
    });

    await updateDocumentStatusBindings({
      documentId: "doc1",
      accountStatusIds: [],
      leadStatusIds: [],
    });

    expect(prisma.documentsToAccountStatuses.deleteMany).toHaveBeenCalled();
    expect(prisma.documentsToLeadStatuses.deleteMany).toHaveBeenCalled();
    expect(prisma.documentsToAccountStatuses.createMany).not.toHaveBeenCalled();
    expect(prisma.documentsToLeadStatuses.createMany).not.toHaveBeenCalled();
  });

  it("admin: throws when document not found", async () => {
    mockUser("admin");
    prisma.documents.findUnique.mockResolvedValue(null);

    await expect(
      updateDocumentStatusBindings({
        documentId: "missing",
        accountStatusIds: [],
        leadStatusIds: [],
      })
    ).rejects.toThrow("Document not found");
  });
});
