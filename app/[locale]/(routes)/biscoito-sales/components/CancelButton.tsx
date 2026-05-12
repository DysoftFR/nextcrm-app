"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { cancelBiscoitoSale } from "@/actions/biscoito-sales/cancel-sale";
import { Button } from "@/components/ui/button";

type CancelButtonProps = {
  saleId: string;
};

export function CancelButton({ saleId }: CancelButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelBiscoitoSale(saleId);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Coupon cancelled");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleCancel}
    >
      <Ban size={16} />
      {isPending ? "Cancelling..." : "Cancel"}
    </Button>
  );
}
