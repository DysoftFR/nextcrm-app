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
import { Slider } from "@/components/ui/slider";
import { CountrySelect } from "./CountrySelect";
import { YEAR_RANGES } from "@/actions/onboarding/schema";

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
      yearsOfExperience: "< 1 year",
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

        {/* Years of sales experience */}
        <FormField
          control={form.control}
          name="yearsOfExperience"
          render={({ field }) => {
            const idx = YEAR_RANGES.indexOf(field.value as typeof YEAR_RANGES[number]);
            return (
              <FormItem>
                <FormLabel>Years of sales experience</FormLabel>
                <FormControl>
                  <div className="space-y-3 pt-1">
                    <Slider
                      min={0}
                      max={YEAR_RANGES.length - 1}
                      step={1}
                      value={[idx === -1 ? 0 : idx]}
                      onValueChange={([i]) => field.onChange(YEAR_RANGES[i])}
                      disabled={isPending}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground select-none">
                      {YEAR_RANGES.map((label) => (
                        <span
                          key={label}
                          className={label === field.value ? "font-semibold text-foreground" : ""}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
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
                      <RadioGroupItem value={value} id={`emp-${value}`} disabled={isPending} />
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
              <FormLabel>Country / region of residence</FormLabel>
              <FormControl>
                <CountrySelect
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isPending}
                />
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
