# Onboarding Feature — Session Commits

Branch: `developer`
Base commit: `3e6b6625` (before this session)
Session date: 2026-05-11

## Commits (oldest → newest)

| SHA | Type | Description |
|-----|------|-------------|
| `9d4522f` | feat(db) | Add UserOnboarding model and onboardingCompleted flag to Users |
| `f6713b8` | fix(db) | Add explicit @@index on UserOnboarding.userId for consistency |
| `2a107cf` | feat(auth) | Expose onboardingCompleted in session user object |
| `40c8324` | feat(onboarding) | Add server action with Zod validation and jest tests |
| `412903c` | feat(i18n) | Add OnboardingPage namespace and PendingPage keys to all 4 locales (en/cz/de/uk) |
| `7db3a39` | feat(onboarding) | Redirect new PENDING users to /onboarding before /pending |
| `6ae4109` | feat(onboarding) | Update pending page with i18n and submission confirmation |
| `5a12458` | feat(onboarding) | Add OnboardingForm client component |
| `832abd2` | feat(onboarding) | Add OnboardingForm client component with radio-group (+ @radix-ui/react-radio-group dep) |
| `1399f2e` | fix(onboarding) | Disable individual RadioGroupItems during submission |
| `e238632` | feat(onboarding) | Add onboarding page with session guard and pre-fill |
| `6370d5b` | fix(onboarding) | Update Zod schema to v4 API (message/error instead of invalid_type_error/errorMap) |
| `0cf60e4` | fix(onboarding) | Guard server action against non-PENDING and duplicate submissions |

## Files changed

### New files
- `prisma/migrations/20260511120000_add_onboarding/migration.sql`
- `actions/onboarding/schema.ts`
- `actions/onboarding/types.ts`
- `actions/onboarding/index.ts`
- `actions/onboarding/__tests__/submit-onboarding.test.ts`
- `app/[locale]/(auth)/onboarding/page.tsx`
- `app/[locale]/(auth)/onboarding/components/OnboardingForm.tsx`
- `components/ui/radio-group.tsx`
- `docs/superpowers/plans/2026-05-11-onboarding-form.md`

### Modified files
- `prisma/schema.prisma` — UserOnboarding model + onboardingCompleted on Users
- `lib/auth.ts` — onboardingCompleted additionalField
- `app/[locale]/(routes)/layout.tsx` — PENDING redirect guard
- `app/[locale]/(auth)/pending/page.tsx` — i18n + submission confirmation
- `locales/en.json`, `locales/cz.json`, `locales/de.json`, `locales/uk.json`
- `package.json` + `pnpm-lock.yaml` — @radix-ui/react-radio-group

## To merge later

```bash
git checkout main
git pull
git merge developer
pnpm test
```
