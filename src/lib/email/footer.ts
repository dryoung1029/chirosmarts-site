/**
 * Shared footer for transactional email. A clear sender identity (legal entity +
 * postal address) and a "why you got this" line both improve spam scoring and
 * keep us CAN-SPAM-aligned. Pulls real values from the legal config — never
 * invents an address.
 */
import { LEGAL } from "@/config/legal";

/**
 * Pass `unsubscribeUrl` on MARKETING mail (lifecycle flows). It is required
 * there by CAN-SPAM and promised on the homepage and in the privacy policy.
 * Leave it off transactional mail (sign-in links, receipts, certificates),
 * which people can't and shouldn't opt out of.
 */
export function emailFooterText(siteUrl: string, reason: string, unsubscribeUrl?: string): string {
  return (
    `\n\n—\n${reason}\n` +
    (unsubscribeUrl ? `Unsubscribe from these emails: ${unsubscribeUrl}\n` : "") +
    `${LEGAL.entityName} · ${LEGAL.mailingAddress}\n` +
    `${siteUrl}`
  );
}

export function emailFooterHtml(siteUrl: string, reason: string, unsubscribeUrl?: string): string {
  const site = siteUrl.replace(/^https?:\/\//, "");
  return (
    `<hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0" />` +
    `<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0">` +
    `${reason}<br>` +
    (unsubscribeUrl
      ? `<a href="${unsubscribeUrl}" style="color:#64748b">Unsubscribe from these emails</a><br>`
      : "") +
    `${LEGAL.entityName} · ${LEGAL.mailingAddress}<br>` +
    `<a href="${siteUrl}" style="color:#94a3b8">${site}</a>` +
    `</p>`
  );
}
