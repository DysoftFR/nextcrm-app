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

      {!isJustSubmitted && adminUsers.length > 0 && (
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

      {!isJustSubmitted && (
        <div className="flex flex-col md:flex-row space-x-2 justify-center items-center">
          <Button asChild variant="outline">
            <Link href="/sign-in">{t("loginAnother")}</Link>
          </Button>
          <p>or</p>
          <TryAgain />
        </div>
      )}
    </div>
  );
};

export default PendingPage;
