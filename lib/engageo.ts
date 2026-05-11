import { render } from "@react-email/render";
import React from "react";

export interface EngageoSendParams {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: React.ReactElement;
  replyTo?: string;
  headers?: Record<string, string>;
  // accepted for compatibility but not forwarded — Engageo attachment support is not yet available
  attachments?: unknown;
}

export interface EngageoSendResult {
  data: { id: string } | null;
  error: Error | null;
}

function parseSender(from: string): { email: string; name?: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match && match[2]) {
    const name = match[1].trim();
    return { email: match[2].trim(), ...(name ? { name } : {}) };
  }
  return { email: from.trim() };
}

async function sendViaEngageo(
  baseUrl: string,
  apiKey: string,
  params: EngageoSendParams
): Promise<EngageoSendResult> {
  let html = params.html;

  if (params.react) {
    html = await render(params.react);
  }

  const sender = parseSender(params.from);
  const toEmails = Array.isArray(params.to) ? params.to : [params.to];
  const recipients = toEmails.map((email) => ({ email }));

  const body: Record<string, unknown> = {
    type: "transactional",
    channel: "email",
    sender,
    recipients,
    content: {
      subject: params.subject,
      ...(html ? { html } : {}),
      ...(params.text ? { text: params.text } : {}),
    },
  };

  if (params.replyTo) {
    body.providerOptions = { smtp: { replyTo: params.replyTo } };
  }

  const toList = toEmails.join(", ");
  console.log(`[Engageo] Sending "${params.subject}" → ${toList}`);

  try {
    const response = await fetch(`${baseUrl}/api/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      const code = json?.error?.code ?? response.status;
      const detail = json?.error?.message ?? JSON.stringify(json?.error?.details ?? "");
      console.error(`[Engageo] FAILED "${params.subject}" → ${toList} | ${code}: ${detail}`);
      return {
        data: null,
        error: new Error(`Engageo error: ${code}`),
      };
    }

    console.log(`[Engageo] SENT id=${json.id} status=${json.status} → ${toList}`);
    return { data: { id: json.id }, error: null };
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Engageo] EXCEPTION "${params.subject}" → ${toList} | ${message}`);
    return {
      data: null,
      error: err instanceof Error ? err : new Error(message),
    };
  }
}

export function createEngageoClient(baseUrl: string, apiKey: string) {
  return {
    emails: {
      send: (params: EngageoSendParams) =>
        sendViaEngageo(baseUrl, apiKey, params),
    },
  };
}

export type EngageoClient = ReturnType<typeof createEngageoClient>;
