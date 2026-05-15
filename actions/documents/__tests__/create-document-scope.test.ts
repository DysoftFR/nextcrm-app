jest.mock("@/lib/auth-server", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/prisma", () => {
  const mock: any = {
    users: { findUnique: jest.fn() },
    documents: { create: jest.fn(), findFirst: jest.fn() },
    crm_Accounts: { findFirst: jest.fn() },
    crm_AuditLog: { create: jest.fn() },
    documentsToAccountStatuses: { createMany: jest.fn() },
    documentsToLeadStatuses: { createMany: jest.fn() },
  };
  mock.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(mock));
  return { prismadb: mock };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

import { prismadb } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { createDocument } from "@/actions/documents/create-document";

const mockUser = (role: "user" | "manager" | "admin", id = "u1") => {
  (getSession as jest.Mock).mockResolvedValue({ user: { id } });
  (prismadb.users.findUnique as jest.Mock).mockResolvedValue({ id, role });
};

const baseInput = {
  name: "f.pdf",
  url: "https://example.com/f.pdf",
  key: "k1",
  size: 10,
  mimeType: "application/pdf",
};

describe("createDocument auth", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401: unauthenticated throws Unauthorized and does not write", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    await expect(createDocument(baseInput)).rejects.toThrow("Unauthorized");
    expect(prismadb.documents.create).not.toHaveBeenCalled();
  });

  it("user out-of-scope account: throws Forbidden", async () => {
    mockUser("user", "u1");
    (prismadb.crm_Accounts.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      createDocument({ ...baseInput, accountId: "a1" })
    ).rejects.toThrow("Forbidden");
    expect(prismadb.documents.create).not.toHaveBeenCalled();
  });

  it("user in-scope owner: creates with createdBy=user.id and assigned_user=user.id", async () => {
    mockUser("user", "u1");
    (prismadb.crm_Accounts.findFirst as jest.Mock).mockResolvedValue({ id: "a1" });
    (prismadb.documents.create as jest.Mock).mockResolvedValue({ id: "d1" });
    await createDocument({ ...baseInput, accountId: "a1" });
    const data = (prismadb.documents.create as jest.Mock).mock.calls[0][0].data;
    expect(data.createdBy).toBe("u1");
    expect(data.assigned_user).toBe("u1");
  });

  it("manager: bypasses account scope OR (assertCanWriteAccount admin/manager only checks id)", async () => {
    mockUser("manager", "m1");
    (prismadb.crm_Accounts.findFirst as jest.Mock).mockResolvedValue({ id: "a1" });
    (prismadb.documents.create as jest.Mock).mockResolvedValue({ id: "d1" });
    await createDocument({ ...baseInput, accountId: "a1" });
    const where = (prismadb.crm_Accounts.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBe("a1");
    expect(where.OR).toBeUndefined();
    expect(prismadb.documents.create).toHaveBeenCalled();
  });
});

describe("createDocument status bindings", () => {
  beforeEach(() => jest.clearAllMocks());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = prismadb as any;

  it("admin: persists account_status_ids and lead_status_ids in dedicated join tables", async () => {
    mockUser("admin", "admin1");
    prisma.documents.create.mockResolvedValue({ id: "doc1" });

    await createDocument({
      ...baseInput,
      account_status_ids: ["acct-status-1", "acct-status-2"],
      lead_status_ids: ["lead-status-1"],
    });

    expect(prisma.documentsToAccountStatuses.createMany).toHaveBeenCalledWith({
      data: [
        { document_id: "doc1", account_status_id: "acct-status-1" },
        { document_id: "doc1", account_status_id: "acct-status-2" },
      ],
    });
    expect(prisma.documentsToLeadStatuses.createMany).toHaveBeenCalledWith({
      data: [{ document_id: "doc1", lead_status_id: "lead-status-1" }],
    });
  });

  it("non-admin (user): silently strips status binding fields", async () => {
    mockUser("user", "u1");
    prisma.documents.create.mockResolvedValue({ id: "doc2" });

    await createDocument({
      ...baseInput,
      account_status_ids: ["acct-status-1"],
      lead_status_ids: ["lead-status-1"],
    });

    expect(prisma.documents.create).toHaveBeenCalled();
    expect(prisma.documentsToAccountStatuses.createMany).not.toHaveBeenCalled();
    expect(prisma.documentsToLeadStatuses.createMany).not.toHaveBeenCalled();
  });

  it("non-admin (manager): silently strips status binding fields", async () => {
    mockUser("manager", "m1");
    prisma.documents.create.mockResolvedValue({ id: "doc3" });

    await createDocument({
      ...baseInput,
      account_status_ids: ["acct-status-1"],
    });

    expect(prisma.documents.create).toHaveBeenCalled();
    expect(prisma.documentsToAccountStatuses.createMany).not.toHaveBeenCalled();
  });

  it("admin with empty arrays: does not write to join tables", async () => {
    mockUser("admin", "admin1");
    prisma.documents.create.mockResolvedValue({ id: "doc4" });

    await createDocument({
      ...baseInput,
      account_status_ids: [],
      lead_status_ids: [],
    });

    expect(prisma.documentsToAccountStatuses.createMany).not.toHaveBeenCalled();
    expect(prisma.documentsToLeadStatuses.createMany).not.toHaveBeenCalled();
  });
});
