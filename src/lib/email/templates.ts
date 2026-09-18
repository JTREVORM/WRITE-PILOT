import "server-only";

import { siteConfig } from "@/lib/config/site";

/**
 * Email templates.
 *
 * Plain inline styles and a single-column table layout, because email clients
 * support neither modern CSS nor Tailwind. Every template returns both an HTML
 * and a text body: text-only clients are a real audience, and a missing text
 * part pushes a message towards spam filtering.
 */

interface Template {
  subject: string;
  html: string;
  text: string;
}

function layout(heading: string, bodyHtml: string, ctaHtml = "") {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c21;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e6e9;border-radius:12px;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:17px;font-weight:600;">${siteConfig.name}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 4px;">
          <h1 style="margin:0;font-size:21px;line-height:1.3;font-weight:600;">${heading}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 28px 4px;font-size:15px;line-height:1.6;color:#4a4a55;">
          ${bodyHtml}
        </td>
      </tr>
      ${ctaHtml}
      <tr>
        <td style="padding:20px 28px 28px;font-size:12px;line-height:1.6;color:#8a8a96;border-top:1px solid #f0f0f2;">
          You're receiving this because you have a ${siteConfig.name} account.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<tr>
        <td style="padding:20px 28px 4px;">
          <a href="${href}" style="display:inline-block;background:#3b4fd4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:8px;">${label}</a>
        </td>
      </tr>`;
}

export function welcomeEmail(params: { name: string | null }): Template {
  const greeting = params.name ? `Welcome, ${params.name}` : "Welcome to WritePilot";
  const dashboardUrl = `${siteConfig.url}/dashboard`;

  return {
    subject: `Welcome to ${siteConfig.name}`,
    html: layout(
      greeting,
      `<p style="margin:0 0 12px;">Your account is ready. You have monthly credits to try every tool on real work — no card required.</p>
       <p style="margin:0;">A good first step is to run a grammar check on something you're already writing.</p>`,
      button(dashboardUrl, "Open your workspace"),
    ),
    text: `${greeting}

Your account is ready. You have monthly credits to try every tool on real work — no card required.

A good first step is to run a grammar check on something you're already writing.

Open your workspace: ${dashboardUrl}`,
  };
}

export function lowCreditsEmail(params: {
  name: string | null;
  balance: number;
  planName: string;
}): Template {
  const usageUrl = `${siteConfig.url}/usage`;

  return {
    subject: `You're running low on credits`,
    html: layout(
      "You're running low on credits",
      `<p style="margin:0 0 12px;">You have <strong>${params.balance}</strong> credits left on the ${params.planName} plan.</p>
       <p style="margin:0;">Your allowance refreshes at the start of your next billing period. If you need more before then, you can top up or move to a larger plan.</p>`,
      button(usageUrl, "View usage and credits"),
    ),
    text: `You're running low on credits

You have ${params.balance} credits left on the ${params.planName} plan.

Your allowance refreshes at the start of your next billing period. If you need more before then, you can top up or move to a larger plan.

View usage and credits: ${usageUrl}`,
  };
}

export function creditsRenewedEmail(params: {
  credits: number;
  planName: string;
}): Template {
  const dashboardUrl = `${siteConfig.url}/dashboard`;

  return {
    subject: "Your monthly credits have refreshed",
    html: layout(
      "Your credits have refreshed",
      `<p style="margin:0;">Your ${params.planName} plan has been topped up with <strong>${params.credits}</strong> credits for the new billing period.</p>`,
      button(dashboardUrl, "Open your workspace"),
    ),
    text: `Your credits have refreshed

Your ${params.planName} plan has been topped up with ${params.credits} credits for the new billing period.

Open your workspace: ${dashboardUrl}`,
  };
}
