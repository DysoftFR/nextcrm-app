import { getTranslations } from "next-intl/server";

import "@/app/[locale]/globals.css";
import { BiscoitoLogo } from "@/components/BiscoitoLogo";
import { AuthFooter } from "@/app/[locale]/(auth)/components/AuthFooter";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const { locale } = params;

  const t = await getTranslations({ locale, namespace: "RootLayout" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

const AuthLayout = async ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-center px-6 py-5 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <BiscoitoLogo className="h-7 w-auto" />
      </header>

      <main className="flex items-center justify-center flex-1 w-full p-4 relative z-10">
        {children}
      </main>

      <AuthFooter />
    </div>
  );
};

export default AuthLayout;
