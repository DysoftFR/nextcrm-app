"use server";

import { prismadb } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { OnboardingSchema } from "./schema";
import { InputType, ReturnType } from "./types";
import { FieldErrors } from "@/lib/create-safe-action";

export async function submitOnboarding(data: InputType): Promise<ReturnType> {
  const session = await getSession();
  if (!session) return { error: "Unauthorized" };
  if (session.user.userStatus !== "PENDING") return { error: "Unauthorized" };
  if (session.user.onboardingCompleted) return { error: "Already submitted" };

  const userId = session.user.id;

  const validation = OnboardingSchema.safeParse(data);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors as FieldErrors<InputType>,
    };
  }

  const { fullName, phone, yearsOfExperience, industries, employmentStatus, country, motivation } =
    validation.data;

  try {
    await prismadb.userOnboarding.create({
      data: { userId, fullName, phone, yearsOfExperience, industries, employmentStatus, country, motivation },
    });
    await prismadb.users.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
    return { data: { success: true } };
  } catch (e) {
    console.error("[SUBMIT_ONBOARDING]", e);
    return { error: "Failed to save onboarding data" };
  }
}
