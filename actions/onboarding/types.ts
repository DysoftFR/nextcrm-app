import { z } from "zod";
import { OnboardingSchema } from "./schema";
import { ActionState } from "@/lib/create-safe-action";

export type InputType = z.infer<typeof OnboardingSchema>;
export type ReturnType = ActionState<InputType, { success: true }>;
