"use client";

import Link from "next/link";
import { BiscoitoLogo } from "@/components/BiscoitoLogo";

export function AuthFooter() {
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <BiscoitoLogo className="h-6 w-auto" />

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="#" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="#" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
          </div>
        </div>

        <div className="mt-6 border-t border-border/50 pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Biscoito. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
