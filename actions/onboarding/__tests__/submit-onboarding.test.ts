jest.mock("@/lib/auth-server", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prismadb: {
    userOnboarding: { create: jest.fn() },
    users: { update: jest.fn() },
  },
}));

import { getSession } from "@/lib/auth-server";
import { prismadb } from "@/lib/prisma";
import { submitOnboarding } from "../index";

const gs = getSession as jest.MockedFunction<typeof getSession>;
const create = prismadb.userOnboarding.create as jest.MockedFunction<
  typeof prismadb.userOnboarding.create
>;
const update = prismadb.users.update as jest.MockedFunction<
  typeof prismadb.users.update
>;

const validInput = {
  fullName: "Jane Doe",
  phone: "+1234567890",
  yearsOfExperience: 3,
  industries: ["SaaS", "B2B"],
  employmentStatus: "employed" as const,
  country: "France",
  motivation: "I want to grow my sales career.",
};

beforeEach(() => jest.clearAllMocks());

describe("submitOnboarding", () => {
  it("returns error when unauthenticated", async () => {
    gs.mockResolvedValue(null as any);
    const result = await submitOnboarding(validInput);
    expect(result.error).toBe("Unauthorized");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects non-PENDING users", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "ACTIVE", onboardingCompleted: true } } as any);
    const result = await submitOnboarding(validInput);
    expect(result.error).toBe("Unauthorized");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects already-submitted users", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING", onboardingCompleted: true } } as any);
    const result = await submitOnboarding(validInput);
    expect(result.error).toBe("Already submitted");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns fieldErrors when industries is empty", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING", onboardingCompleted: false } } as any);
    const result = await submitOnboarding({ ...validInput, industries: [] });
    expect(result.fieldErrors?.industries).toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns fieldErrors when fullName is empty", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING", onboardingCompleted: false } } as any);
    const result = await submitOnboarding({ ...validInput, fullName: "" });
    expect(result.fieldErrors?.fullName).toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("persists onboarding and flips flag on success", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING", onboardingCompleted: false } } as any);
    create.mockResolvedValue({ id: "o1" } as any);
    update.mockResolvedValue({} as any);

    const result = await submitOnboarding(validInput);

    expect(result.error).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          fullName: "Jane Doe",
          industries: ["SaaS", "B2B"],
        }),
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { onboardingCompleted: true },
      })
    );
  });
});
