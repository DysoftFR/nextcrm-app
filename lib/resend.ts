import { prismadb } from "./prisma";
import { createEngageoClient } from "./engageo";

export default async function resendHelper() {
  const engageoRecord = await prismadb.systemServices.findFirst({
    where: { name: "engageo" },
  });

  const apiKey =
    process.env.ENGAGEO_MESSAGING_API_KEY || engageoRecord?.serviceKey;
  const baseUrl = process.env.ENGAGEO_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error(
      "Engageo is not configured. Set ENGAGEO_BASE_URL and ENGAGEO_MESSAGING_API_KEY environment variables."
    );
  }

  return createEngageoClient(baseUrl, apiKey);
}
