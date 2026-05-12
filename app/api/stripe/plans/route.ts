import { NextResponse } from "next/server";
import {
  AuthenticationError,
  AuthorizationError,
  requireActiveAuthenticated,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/authz";
import { listBiscoitoPlans } from "@/lib/stripe/plans";

export async function GET() {
  try {
    await requireActiveAuthenticated();
  } catch (error) {
    if (error instanceof AuthenticationError) return unauthorizedResponse();
    if (error instanceof AuthorizationError) return forbiddenResponse();
    throw error;
  }

  try {
    const plans = await listBiscoitoPlans();
    return NextResponse.json({ data: plans });
  } catch (error) {
    console.error("[STRIPE_PLANS]", error);
    return NextResponse.json({ error: "Failed to load Stripe plans" }, { status: 500 });
  }
}
