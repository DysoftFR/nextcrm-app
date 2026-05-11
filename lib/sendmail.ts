import { createEngageoClient } from "./engageo";

interface EmailOptions {
  from: string | undefined;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export default async function sendEmail(
  emailOptions: EmailOptions
): Promise<void> {
  const apiKey = process.env.ENGAGEO_MESSAGING_API_KEY;
  const baseUrl = process.env.ENGAGEO_BASE_URL;

  if (!apiKey || !baseUrl) {
    console.error("Engageo is not configured. Set ENGAGEO_BASE_URL and ENGAGEO_MESSAGING_API_KEY.");
    return;
  }

  const client = createEngageoClient(baseUrl, apiKey);

  const { error } = await client.emails.send({
    from: emailOptions.from ?? process.env.EMAIL_FROM ?? "noreply@example.com",
    to: emailOptions.to,
    subject: emailOptions.subject,
    text: emailOptions.text,
    html: emailOptions.html,
  });

  if (error) {
    console.error(`Error sending email via Engageo: ${error.message}`);
  } else {
    console.log(`Email sent to ${emailOptions.to}`);
  }
}
