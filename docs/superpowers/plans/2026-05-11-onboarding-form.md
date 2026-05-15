# Onboarding Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a mandatory onboarding application form between sign-up and the pending-approval page so admins receive richer candidate data.

**Architecture:** Add `onboardingCompleted` boolean to the `Users` table and a separate `UserOnboarding` table for form responses. The (routes) layout already redirects PENDING users; extend it to first check `onboardingCompleted` and send incomplete users to `/[locale]/onboarding`. The onboarding page lives under `(auth)` layout (no sidebar) and submits via a server action that persists the record and flips the flag.

**Tech Stack:** Next.js 15 App Router, better-auth, Prisma + PostgreSQL, next-intl (en/cz/de/uk), react-hook-form + zod (client validation), shadcn/ui (Checkbox, RadioGroup, Select, Textarea, Input), Jest (unit tests)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `prisma/schema.prisma` | Add `onboardingCompleted` to `Users`; add `UserOnboarding` model |
| Modify | `lib/auth.ts` | Expose `onboardingCompleted` in better-auth session |
| Create | `actions/onboarding/schema.ts` | Zod schema for form data |
| Create | `actions/onboarding/types.ts` | `InputType` / `ReturnType` aliases |
| Create | `actions/onboarding/index.ts` | Server action — validate, persist, flip flag |
| Create | `actions/onboarding/__tests__/submit-onboarding.test.ts` | Jest unit tests |
| Create | `app/[locale]/(auth)/onboarding/components/OnboardingForm.tsx` | Client form (react-hook-form + zod + shadcn) |
| Create | `app/[locale]/(auth)/onboarding/page.tsx` | Server component — session guard, pre-fill, render form |
| Modify | `app/[locale]/(routes)/layout.tsx` | Redirect PENDING+!onboardingCompleted → `/onboarding` |
| Modify | `app/[locale]/(auth)/pending/page.tsx` | Show submission-confirmed message |
| Modify | `locales/en.json` | Add `OnboardingPage` namespace + update `PendingPage` |
| Modify | `locales/cz.json` | Same keys (stub translations) |
| Modify | `locales/de.json` | Same keys (stub translations) |
| Modify | `locales/uk.json` | Same keys (stub translations) |

---

## Task 1: Prisma Schema — onboarding fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `onboardingCompleted` to Users model**

Open `prisma/schema.prisma`. Inside the `Users` model (line ~922), add after `banned Boolean @default(false)`:

```prisma
  onboardingCompleted Boolean @default(false)
```

- [ ] **Step 2: Add `UserOnboarding` model**

After the `Users` model closing brace, add:

```prisma
model UserOnboarding {
  id                   String   @id @default(uuid()) @db.Uuid
  userId               String   @unique @db.Uuid
  fullName             String
  phone                String
  yearsOfExperience    Int
  industries           String[]
  employmentStatus     String
  country              String
  motivation           String?
  submittedAt          DateTime @default(now())

  user Users @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Also add the back-relation to the `Users` model:

```prisma
  onboarding UserOnboarding?
```

- [ ] **Step 3: Run migration**

```bash
pnpm prisma migrate dev --name add_onboarding
```

Expected: Migration created and applied. `UserOnboarding` table created, `onboardingCompleted` column added to `users` table.

- [ ] **Step 4: Verify generated client**

```bash
pnpm prisma generate
```

Expected: No errors. `prismadb.userOnboarding` available.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add UserOnboarding model and onboardingCompleted flag to Users"
```

---

## Task 2: Expose `onboardingCompleted` in better-auth session

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Add additionalField**

In `lib/auth.ts`, inside the `user.additionalFields` object (after `avatar`), add:

```typescript
      onboardingCompleted: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No new errors related to `onboardingCompleted`.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): expose onboardingCompleted in session user object"
```

---

## Task 3: Server action — submit onboarding

**Files:**
- Create: `actions/onboarding/schema.ts`
- Create: `actions/onboarding/types.ts`
- Create: `actions/onboarding/index.ts`

- [ ] **Step 1: Write the failing test**

Create `actions/onboarding/__tests__/submit-onboarding.test.ts`:

```typescript
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
  employmentStatus: "employed",
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

  it("returns error when industries is empty array", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING" } } as any);
    const result = await submitOnboarding({ ...validInput, industries: [] });
    expect(result.fieldErrors?.industries).toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns error when fullName is empty", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING" } } as any);
    const result = await submitOnboarding({ ...validInput, fullName: "" });
    expect(result.fieldErrors?.fullName).toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("persists onboarding and flips flag on success", async () => {
    gs.mockResolvedValue({ user: { id: "u1", userStatus: "PENDING" } } as any);
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test actions/onboarding/__tests__/submit-onboarding.test.ts
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Create schema**

Create `actions/onboarding/schema.ts`:

```typescript
import { z } from "zod";

const EMPLOYMENT_STATUSES = ["employed", "freelance", "looking"] as const;

export const OnboardingSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  phone: z.string().min(5, "Phone number is required").max(30),
  yearsOfExperience: z
    .number({ invalid_type_error: "Must be a number" })
    .int()
    .min(0)
    .max(50),
  industries: z
    .array(z.string().min(1))
    .min(1, "Select at least one industry"),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES, {
    errorMap: () => ({ message: "Select an employment status" }),
  }),
  country: z.string().min(1, "Country is required").max(100),
  motivation: z.string().max(1000).optional(),
});
```

- [ ] **Step 4: Create types**

Create `actions/onboarding/types.ts`:

```typescript
import { z } from "zod";
import { OnboardingSchema } from "./schema";
import { ActionState } from "@/lib/create-safe-action";

export type InputType = z.infer<typeof OnboardingSchema>;
export type ReturnType = ActionState<InputType, { success: true }>;
```

- [ ] **Step 5: Create server action**

Create `actions/onboarding/index.ts`:

```typescript
"use server";

import { prismadb } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { OnboardingSchema } from "./schema";
import { InputType, ReturnType } from "./types";
import { FieldErrors } from "@/lib/create-safe-action";

export async function submitOnboarding(data: InputType): Promise<ReturnType> {
  const session = await getSession();
  if (!session) return { error: "Unauthorized" };

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
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test actions/onboarding/__tests__/submit-onboarding.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add actions/onboarding/
git commit -m "feat(onboarding): add server action with Zod validation and jest tests"
```

---

## Task 4: Add i18n translations

**Files:**
- Modify: `locales/en.json`
- Modify: `locales/cz.json`
- Modify: `locales/de.json`
- Modify: `locales/uk.json`

- [ ] **Step 1: Add `OnboardingPage` namespace + update `PendingPage` in en.json**

In `locales/en.json`, add this top-level namespace (position doesn't matter — keep alphabetical or append before closing `}`):

```json
  "OnboardingPage": {
    "title": "Complete Your Application",
    "description": "Tell us more about yourself so we can review your application.",
    "fullName": "Full name",
    "phone": "Phone number",
    "yearsOfExperience": "Years of sales experience",
    "industries": "Industry / sector",
    "industriesHint": "Select all that apply",
    "employmentStatus": "Current employment status",
    "employmentStatusEmployed": "Employed",
    "employmentStatusFreelance": "Freelance",
    "employmentStatusLooking": "Looking for opportunities",
    "country": "Country / region of residence",
    "motivation": "Why do you want to join the platform?",
    "motivationPlaceholder": "Share your motivation (optional)...",
    "submit": "Submit Application",
    "submitting": "Submitting...",
    "errorGeneric": "Something went wrong. Please try again.",
    "industriesList": {
      "SaaS": "SaaS",
      "RealEstate": "Real Estate",
      "Retail": "Retail",
      "B2B": "B2B",
      "B2C": "B2C",
      "Finance": "Finance",
      "Healthcare": "Healthcare",
      "Manufacturing": "Manufacturing",
      "Consulting": "Consulting",
      "Other": "Other"
    }
  },
  "PendingPage": {
    "title": "Application Submitted",
    "submittedHeading": "Your application is complete!",
    "submittedBody": "Thank you for applying. Your account is awaiting admin approval. You will receive an email notification once your account is approved.",
    "pendingHeading": "Account pending approval",
    "pendingBody": "Your account is awaiting approval. Ask someone in your organisation to approve your account, or contact tech support.",
    "adminListTitle": "Admin list",
    "loginAnother": "Log in with another account"
  }
```

- [ ] **Step 2: Add same keys to cz.json**

In `locales/cz.json`, add (Czech — machine-translated stubs, a human can refine):

```json
  "OnboardingPage": {
    "title": "Dokončete svou přihlášku",
    "description": "Řekněte nám o sobě více, abychom mohli vaši žádost posoudit.",
    "fullName": "Celé jméno",
    "phone": "Telefonní číslo",
    "yearsOfExperience": "Roky zkušeností v prodeji",
    "industries": "Odvětví / sektor",
    "industriesHint": "Vyberte vše, co se vztahuje",
    "employmentStatus": "Aktuální pracovní status",
    "employmentStatusEmployed": "Zaměstnaný",
    "employmentStatusFreelance": "Freelancer",
    "employmentStatusLooking": "Hledám příležitosti",
    "country": "Země / region bydliště",
    "motivation": "Proč se chcete přidat k platformě?",
    "motivationPlaceholder": "Sdílejte svou motivaci (volitelné)...",
    "submit": "Odeslat přihlášku",
    "submitting": "Odesílání...",
    "errorGeneric": "Něco se pokazilo. Zkuste to prosím znovu.",
    "industriesList": {
      "SaaS": "SaaS",
      "RealEstate": "Reality",
      "Retail": "Maloobchod",
      "B2B": "B2B",
      "B2C": "B2C",
      "Finance": "Finance",
      "Healthcare": "Zdravotnictví",
      "Manufacturing": "Výroba",
      "Consulting": "Poradenství",
      "Other": "Jiné"
    }
  },
  "PendingPage": {
    "title": "Přihláška odeslána",
    "submittedHeading": "Vaše přihláška je kompletní!",
    "submittedBody": "Děkujeme za přihlášku. Váš účet čeká na schválení správcem. Po schválení obdržíte e-mailové oznámení.",
    "pendingHeading": "Účet čeká na schválení",
    "pendingBody": "Váš účet čeká na schválení. Požádejte někoho ve vaší organizaci o schválení účtu nebo kontaktujte technickou podporu.",
    "adminListTitle": "Seznam administrátorů",
    "loginAnother": "Přihlásit se jiným účtem"
  }
```

- [ ] **Step 3: Add same keys to de.json**

In `locales/de.json`, add (German stubs):

```json
  "OnboardingPage": {
    "title": "Bewerbung abschließen",
    "description": "Erzählen Sie uns mehr über sich, damit wir Ihre Bewerbung prüfen können.",
    "fullName": "Vollständiger Name",
    "phone": "Telefonnummer",
    "yearsOfExperience": "Jahre Verkaufserfahrung",
    "industries": "Branche / Sektor",
    "industriesHint": "Alles Zutreffende auswählen",
    "employmentStatus": "Aktueller Beschäftigungsstatus",
    "employmentStatusEmployed": "Angestellt",
    "employmentStatusFreelance": "Freiberuflich",
    "employmentStatusLooking": "Auf Jobsuche",
    "country": "Land / Region des Wohnsitzes",
    "motivation": "Warum möchten Sie der Plattform beitreten?",
    "motivationPlaceholder": "Teilen Sie Ihre Motivation (optional)...",
    "submit": "Bewerbung einreichen",
    "submitting": "Wird eingereicht...",
    "errorGeneric": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    "industriesList": {
      "SaaS": "SaaS",
      "RealEstate": "Immobilien",
      "Retail": "Einzelhandel",
      "B2B": "B2B",
      "B2C": "B2C",
      "Finance": "Finanzen",
      "Healthcare": "Gesundheitswesen",
      "Manufacturing": "Fertigung",
      "Consulting": "Beratung",
      "Other": "Sonstiges"
    }
  },
  "PendingPage": {
    "title": "Bewerbung eingereicht",
    "submittedHeading": "Ihre Bewerbung ist vollständig!",
    "submittedBody": "Vielen Dank für Ihre Bewerbung. Ihr Konto wartet auf die Genehmigung durch einen Administrator. Sie erhalten eine E-Mail-Benachrichtigung, sobald Ihr Konto genehmigt wurde.",
    "pendingHeading": "Konto wartet auf Genehmigung",
    "pendingBody": "Ihr Konto wartet auf Genehmigung. Bitten Sie jemanden in Ihrer Organisation, Ihr Konto zu genehmigen, oder wenden Sie sich an den technischen Support.",
    "adminListTitle": "Administratorenliste",
    "loginAnother": "Mit einem anderen Konto anmelden"
  }
```

- [ ] **Step 4: Add same keys to uk.json**

In `locales/uk.json`, add (Ukrainian stubs):

```json
  "OnboardingPage": {
    "title": "Заповніть заявку",
    "description": "Розкажіть нам більше про себе, щоб ми могли розглянути вашу заявку.",
    "fullName": "Повне ім'я",
    "phone": "Номер телефону",
    "yearsOfExperience": "Роки досвіду в продажах",
    "industries": "Галузь / сектор",
    "industriesHint": "Виберіть усе, що підходить",
    "employmentStatus": "Поточний статус зайнятості",
    "employmentStatusEmployed": "Працевлаштований",
    "employmentStatusFreelance": "Фрілансер",
    "employmentStatusLooking": "Шукаю можливості",
    "country": "Країна / регіон проживання",
    "motivation": "Чому ви хочете приєднатися до платформи?",
    "motivationPlaceholder": "Поділіться своєю мотивацією (необов'язково)...",
    "submit": "Надіслати заявку",
    "submitting": "Надсилання...",
    "errorGeneric": "Щось пішло не так. Будь ласка, спробуйте ще раз.",
    "industriesList": {
      "SaaS": "SaaS",
      "RealEstate": "Нерухомість",
      "Retail": "Роздрібна торгівля",
      "B2B": "B2B",
      "B2C": "B2C",
      "Finance": "Фінанси",
      "Healthcare": "Охорона здоров'я",
      "Manufacturing": "Виробництво",
      "Consulting": "Консалтинг",
      "Other": "Інше"
    }
  },
  "PendingPage": {
    "title": "Заявку надіслано",
    "submittedHeading": "Вашу заявку завершено!",
    "submittedBody": "Дякуємо за подачу заявки. Ваш акаунт очікує на схвалення адміністратора. Ви отримаєте повідомлення електронною поштою, щойно ваш акаунт буде схвалено.",
    "pendingHeading": "Акаунт очікує на схвалення",
    "pendingBody": "Ваш акаунт очікує на схвалення. Попросіть когось із вашої організації схвалити акаунт або зверніться до технічної підтримки.",
    "adminListTitle": "Список адміністраторів",
    "loginAnother": "Увійти з іншим акаунтом"
  }
```

- [ ] **Step 5: Verify JSON is valid**

```bash
node -e "require('./locales/en.json'); require('./locales/cz.json'); require('./locales/de.json'); require('./locales/uk.json'); console.log('All JSON valid')"
```

Expected: `All JSON valid`

- [ ] **Step 6: Commit**

```bash
git add locales/
git commit -m "feat(i18n): add OnboardingPage namespace and PendingPage keys to all 4 locales"
```

---

## Task 5: Onboarding form component (client)

**Files:**
- Create: `app/[locale]/(auth)/onboarding/components/OnboardingForm.tsx`

- [ ] **Step 1: Create the client component**

Create `app/[locale]/(auth)/onboarding/components/OnboardingForm.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { OnboardingSchema } from "@/actions/onboarding/schema";
import { submitOnboarding } from "@/actions/onboarding/index";
import type { InputType } from "@/actions/onboarding/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const INDUSTRY_KEYS = [
  "SaaS",
  "RealEstate",
  "Retail",
  "B2B",
  "B2C",
  "Finance",
  "Healthcare",
  "Manufacturing",
  "Consulting",
  "Other",
] as const;

const EMPLOYMENT_OPTIONS = [
  { value: "employed", labelKey: "employmentStatusEmployed" },
  { value: "freelance", labelKey: "employmentStatusFreelance" },
  { value: "looking", labelKey: "employmentStatusLooking" },
] as const;

interface Props {
  defaultName: string;
}

export function OnboardingForm({ defaultName }: Props) {
  const t = useTranslations("OnboardingPage");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<InputType>({
    resolver: zodResolver(OnboardingSchema),
    defaultValues: {
      fullName: defaultName,
      phone: "",
      yearsOfExperience: 0,
      industries: [],
      employmentStatus: "employed",
      country: "",
      motivation: "",
    },
  });

  const onSubmit = (data: InputType) => {
    startTransition(async () => {
      const result = await submitOnboarding(data);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof InputType, {
            message: (messages as string[])[0],
          });
        }
        return;
      }

      router.push(`/${locale}/pending?submitted=true`);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Full name */}
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fullName")}</FormLabel>
              <FormControl>
                <Input {...field} disabled={isPending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Phone */}
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("phone")}</FormLabel>
              <FormControl>
                <Input type="tel" {...field} disabled={isPending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Years of experience */}
        <FormField
          control={form.control}
          name="yearsOfExperience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("yearsOfExperience")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Industries multi-select */}
        <FormField
          control={form.control}
          name="industries"
          render={() => (
            <FormItem>
              <FormLabel>{t("industries")}</FormLabel>
              <p className="text-sm text-muted-foreground">{t("industriesHint")}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {INDUSTRY_KEYS.map((key) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name="industries"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value.includes(key)}
                            disabled={isPending}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [...field.value, key]
                                : field.value.filter((v) => v !== key);
                              field.onChange(next);
                            }}
                          />
                        </FormControl>
                        <Label className="font-normal cursor-pointer">
                          {t(`industriesList.${key}`)}
                        </Label>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Employment status */}
        <FormField
          control={form.control}
          name="employmentStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("employmentStatus")}</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isPending}
                  className="space-y-1"
                >
                  {EMPLOYMENT_OPTIONS.map(({ value, labelKey }) => (
                    <div key={value} className="flex items-center space-x-2">
                      <RadioGroupItem value={value} id={`emp-${value}`} />
                      <Label htmlFor={`emp-${value}`} className="font-normal cursor-pointer">
                        {t(labelKey)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Country */}
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("country")}</FormLabel>
              <FormControl>
                <Input {...field} disabled={isPending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Motivation */}
        <FormField
          control={form.control}
          name="motivation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("motivation")}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t("motivationPlaceholder")}
                  rows={4}
                  maxLength={1000}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | grep -i "onboarding" | head -10
```

Expected: No errors for onboarding files.

- [ ] **Step 3: Commit**

```bash
git add app/[locale]/\(auth\)/onboarding/
git commit -m "feat(onboarding): add client-side OnboardingForm component"
```

---

## Task 6: Onboarding page (server component)

**Files:**
- Create: `app/[locale]/(auth)/onboarding/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/[locale]/(auth)/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth-server";
import { OnboardingForm } from "./components/OnboardingForm";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props) {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "OnboardingPage" });
  return { title: t("title") };
}

const OnboardingPage = async () => {
  const session = await getSession();

  if (!session) {
    return redirect("/sign-in");
  }

  const user = session.user;

  // Active users don't need onboarding
  if (user.userStatus !== "PENDING") {
    return redirect("/");
  }

  // Already onboarded — send to pending
  if (user.onboardingCompleted) {
    return redirect("/pending");
  }

  const t = await getTranslations("OnboardingPage");

  return (
    <div className="w-full max-w-2xl border rounded-md p-8 shadow-md bg-card/80 backdrop-blur-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("description")}</p>
      </div>
      <OnboardingForm defaultName={user.name ?? ""} />
    </div>
  );
};

export default OnboardingPage;
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | grep -i "onboarding" | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(auth)/onboarding/"
git commit -m "feat(onboarding): add onboarding page with session guard and pre-fill"
```

---

## Task 7: Update routes layout — redirect PENDING users to onboarding first

**Files:**
- Modify: `app/[locale]/(routes)/layout.tsx`

- [ ] **Step 1: Update PENDING redirect logic**

In `app/[locale]/(routes)/layout.tsx`, find this block (~line 60):

```typescript
  if (user?.userStatus === "PENDING") {
    return redirect("/pending");
  }
```

Replace with:

```typescript
  if (user?.userStatus === "PENDING") {
    if (!user.onboardingCompleted) {
      return redirect("/onboarding");
    }
    return redirect("/pending");
  }
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(routes)/layout.tsx"
git commit -m "feat(onboarding): redirect new PENDING users to onboarding before pending page"
```

---

## Task 8: Update pending page — confirmation message

**Files:**
- Modify: `app/[locale]/(auth)/pending/page.tsx`

- [ ] **Step 1: Rewrite the pending page**

Replace the full contents of `app/[locale]/(auth)/pending/page.tsx` with:

```tsx
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth-server";
import { prismadb } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { Users } from "@prisma/client";
import TryAgain from "./components/TryAgain";

type Props = {
  searchParams: Promise<{ submitted?: string }>;
};

const PendingPage = async ({ searchParams }: Props) => {
  const { submitted } = await searchParams;
  const isJustSubmitted = submitted === "true";

  const session = await getSession();

  if (session?.user.userStatus !== "PENDING") {
    return redirect("/");
  }

  const t = await getTranslations("PendingPage");

  const adminUsers: Users[] = await prismadb.users.findMany({
    where: { role: "admin", userStatus: "ACTIVE" },
  });

  return (
    <div className="flex flex-col space-y-6 justify-center items-center max-w-3xl border rounded-md p-10 shadow-md bg-card/80 backdrop-blur-sm">
      {isJustSubmitted && (
        <div className="flex flex-col items-center space-y-2 text-center">
          <CheckCircle2Icon className="h-12 w-12 text-green-500" />
          <h1 className="text-2xl font-bold">{t("submittedHeading")}</h1>
          <p className="text-muted-foreground max-w-md">{t("submittedBody")}</p>
        </div>
      )}

      {!isJustSubmitted && (
        <div className="flex flex-col items-center space-y-2 text-center">
          <h1 className="text-2xl font-bold">{t("pendingHeading")}</h1>
          <p className="text-muted-foreground max-w-md">{t("pendingBody")}</p>
        </div>
      )}

      {adminUsers.length > 0 && (
        <div className="w-full flex flex-col space-y-2">
          <h2 className="text-lg font-semibold text-center">{t("adminListTitle")}</h2>
          {adminUsers.map((admin: Users) => (
            <div
              key={admin.id}
              className="flex flex-col p-4 border rounded-md gap-1"
            >
              <p className="font-bold">{admin.name}</p>
              <p>
                <Link href={`mailto:${admin.email}`} className="underline text-primary">
                  {admin.email}
                </Link>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row space-x-2 justify-center items-center">
        <Button asChild variant="outline">
          <Link href="/sign-in">{t("loginAnother")}</Link>
        </Button>
        <p>or</p>
        <TryAgain />
      </div>
    </div>
  );
};

export default PendingPage;
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(auth)/pending/"
git commit -m "feat(onboarding): update pending page with submission confirmation and i18n"
```

---

## Task 9: Install react-hook-form resolver (if missing) and run full build

**Files:**
- Possibly modify: `package.json`

- [ ] **Step 1: Check if @hookform/resolvers is installed**

```bash
grep "@hookform/resolvers" package.json
```

If not present, install:

```bash
pnpm add @hookform/resolvers
```

- [ ] **Step 2: Run full build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Run all Jest tests**

```bash
pnpm test 2>&1 | tail -20
```

Expected: All tests pass including the 4 new onboarding tests.

- [ ] **Step 4: Final commit (if package.json changed)**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @hookform/resolvers for onboarding form validation"
```

---

## Self-Review Checklist

### Spec coverage

| Requirement | Task |
|-------------|------|
| Redirect new sign-ups to onboarding before /pending | Task 7 |
| All 7 form fields present | Task 5 (OnboardingForm) |
| Full name pre-filled from auth provider | Task 6 (page passes `user.name`) |
| Multi-select industries, at least one required | Task 3 (schema) + Task 5 (checkboxes) |
| All fields mandatory (phone, name, years, status, country) | Task 3 (schema) |
| Motivation optional | Task 3 (`optional()`) |
| Client-side validation | Task 5 (zodResolver in react-hook-form) |
| Server-side validation | Task 3 (schema.safeParse in action) |
| Save to user profile | Task 3 (userOnboarding.create + users.update) |
| Redirect to /[lang]/pending with confirmation | Task 5 (router.push with ?submitted=true) |
| Pending page confirmation message | Task 8 |
| Email notification mentioned in confirmation text | Task 4 (PendingPage.submittedBody key) |
| i18n — all 4 locales | Task 4 |
| No skip option | Task 6 (page guard) + Task 7 (layout redirect) |

### Type consistency

- `InputType` from `actions/onboarding/types.ts` matches `OnboardingSchema` — consistent
- `OnboardingForm` receives `defaultName: string` — matches page passing `user.name ?? ""`
- `industries` is `string[]` in schema, stored as `String[]` in Prisma — consistent
- `employmentStatus` values `"employed" | "freelance" | "looking"` — consistent across schema, form, and locale keys

### Placeholder scan

No TBDs or TODOs in implementation steps. All code blocks are complete.
