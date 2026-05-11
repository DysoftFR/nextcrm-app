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

  if (user.userStatus !== "PENDING") {
    return redirect("/");
  }

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
