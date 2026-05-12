import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Container from "@/app/[locale]/(routes)/components/ui/Container";
import { Button } from "@/components/ui/button";
import { CreateSaleForm } from "../components/CreateSaleForm";

export default function NewBiscoitoSalePage() {
  return (
    <Container
      title="Create coupon"
      description="Create a one-use Stripe discount for a selected Biscoito subscription plan."
    >
      <div className="flex max-w-3xl flex-col gap-4">
        <Button asChild variant="outline" className="w-fit">
          <Link href="/biscoito-sales">
            <ArrowLeft size={16} />
            Back to coupons
          </Link>
        </Button>
        <CreateSaleForm />
      </div>
    </Container>
  );
}
