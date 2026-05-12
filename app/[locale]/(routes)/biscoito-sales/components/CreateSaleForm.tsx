"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { CheckCircle2, Loader2, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { createBiscoitoSale } from "@/actions/biscoito-sales/create-sale";
import type { CreateBiscoitoSaleOutput } from "@/actions/biscoito-sales/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "./CopyButton";

type Plan = {
  id: string;
  currency: string;
  unitAmount: number | null;
  nickname: string | null;
  recurring: { interval: string; intervalCount: number };
  product: { id: string; name: string; active: boolean };
};

type PlansResponse = {
  data?: Plan[];
  error?: string;
};

const ZERO_DECIMAL_CURRENCIES = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

async function fetchPlans(url: string): Promise<Plan[]> {
  const response = await fetch(url);
  const body = (await response.json()) as PlansResponse;
  if (!response.ok || body.error) throw new Error(body.error || "Failed to load plans");
  return body.data ?? [];
}

function formatPrice(plan: Plan): string {
  if (plan.unitAmount === null) return plan.currency.toUpperCase();
  const divisor = ZERO_DECIMAL_CURRENCIES.has(plan.currency) ? 1 : 100;
  const amount = plan.unitAmount / divisor;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(amount);
}

function toMinorUnits(value: string, currency: string): number {
  const amount = Number(value);
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
  return Math.round(amount * multiplier);
}

export function CreateSaleForm() {
  const { data: plans, error, isLoading } = useSWR("/api/stripe/plans", fetchPlans);
  const [targetPriceId, setTargetPriceId] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "AMOUNT">("PERCENT");
  const [discountValue, setDiscountValue] = useState("10");
  const [created, setCreated] = useState<CreateBiscoitoSaleOutput | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPlan = useMemo(
    () => plans?.find((plan) => plan.id === targetPriceId) ?? null,
    [plans, targetPriceId]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) {
      toast.error("Select a Stripe plan");
      return;
    }

    const numericDiscount =
      discountType === "AMOUNT"
        ? toMinorUnits(discountValue, selectedPlan.currency)
        : Number(discountValue);

    startTransition(async () => {
      const result = await createBiscoitoSale({
        targetPriceId,
        discountType,
        discountValue: numericDiscount,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.fieldErrors) {
        toast.error("Check the coupon fields");
        return;
      }

      setCreated(result.data ?? null);
      toast.success("Coupon created");
    });
  }

  if (created) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 size={20} />
            Coupon ready
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 rounded-md border p-4">
            <div>
              <div className="text-sm text-muted-foreground">Code</div>
              <div className="text-lg font-semibold">{created.promoCode}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Payment URL</div>
              <div className="break-all text-sm">{created.shareUrl}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={created.promoCode} label="Copy code" />
              <CopyButton value={created.shareUrl} label="Copy URL" />
              <Button asChild>
                <Link href={`/biscoito-sales/${created.id}`}>View sale</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TicketPercent size={20} />
          Coupon details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="targetPriceId">Biscoito plan</Label>
            <select
              id="targetPriceId"
              value={targetPriceId}
              onChange={(event) => setTargetPriceId(event.target.value)}
              className="h-11 rounded-md border border-input bg-background px-3 text-base"
              disabled={isLoading}
              required
            >
              <option value="">{isLoading ? "Loading plans..." : "Select a plan"}</option>
              {plans?.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.product.name} · {plan.nickname ?? plan.id} · {formatPrice(plan)}
                </option>
              ))}
            </select>
            {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label>Discount type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={discountType === "PERCENT" ? "default" : "outline"}
                className="h-11"
                onClick={() => setDiscountType("PERCENT")}
              >
                Percent
              </Button>
              <Button
                type="button"
                variant={discountType === "AMOUNT" ? "default" : "outline"}
                className="h-11"
                onClick={() => setDiscountType("AMOUNT")}
              >
                Amount
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="discountValue">
              {discountType === "PERCENT" ? "Percent off" : `Amount off${selectedPlan ? ` (${selectedPlan.currency.toUpperCase()})` : ""}`}
            </Label>
            <Input
              id="discountValue"
              type="number"
              min="1"
              max={discountType === "PERCENT" ? "100" : undefined}
              step={discountType === "PERCENT" ? "1" : "0.01"}
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              className="h-11 text-base"
              required
            />
          </div>

          <Button type="submit" className="h-11 w-fit" disabled={isPending || isLoading}>
            {isPending ? <Loader2 className="animate-spin" size={16} /> : <TicketPercent size={16} />}
            Create coupon
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
