import { z } from "zod";

const EMPLOYMENT_STATUSES = ["employed", "freelance", "looking"] as const;

export const YEAR_RANGES = [
  "< 1 year",
  "1–2 years",
  "2–5 years",
  "5–10 years",
  "10+ years",
] as const;

export const OnboardingSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  phone: z.string().min(5, "Phone number is required").max(30),
  yearsOfExperience: z.enum(YEAR_RANGES, { error: () => "Select experience range" }),
  industries: z
    .array(z.string().min(1))
    .min(1, "Select at least one industry"),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES, {
    error: () => "Select an employment status",
  }),
  country: z.string().min(1, "Country is required").max(100),
  motivation: z.string().max(1000).optional(),
});
