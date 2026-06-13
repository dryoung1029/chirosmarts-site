/**
 * Shared footer for transactional email. A clear sender identity (legal entity +
 * postal address) and a "why you got this" line both improve spam scoring and
 * keep us CAN-SPAM-aligned. Pulls real values from the legal config — never
 * invents an address.
 */
import { LEGAL } from "@/config/legal";

export function emailFooterText(siteUrl: string, reason: string): string {
  return (
    `\n\n—\n${reason}\n` +
    `${LEGAL.entityName} · ${LEGAL.mailingAddress}\n` +
    `${siteUrl}`
  );
}

export function emailFooterHtml(siteUrl: string, reason: string): string {
  const site = siteUrl.replace(/^https?:\/\//, "");
  return (
    `<hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0" />` +
    `<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0">` +
    `${reason}<br>` +
    `${LEGAL.entityName} · ${LEGAL.mailingAddress}<br>` +
    `<a href="${siteUrl}" style="color:#94a3b8">${site}</a>` +
    `</p>`
  );
}
