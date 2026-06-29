/**
 * First-party, privacy-friendly campaign attribution. A small client script
 * (in MarketingLayout) stores the FIRST-touch UTM tags from the landing URL in
 * a first-party `cs_attr` cookie. At conversion points (lead capture, purchase)
 * we read that cookie and log an `attribution` event, so the admin dashboard can
 * tie signups/leads/sales back to the ad campaign that drove them.
 *
 * No third-party cookies, no cross-site tracking — fits the compliance/privacy
 * posture (Cloudflare Web Analytics covers raw traffic).
 */
import type { AstroCookies } from "astro";
import type { Db } from "@/db/client";
import { logEvent } from "@/lib/events";

export const ATTR_COOKIE = "cs_attr";

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landing?: string;
  ts?: string;
}

export function readAttribution(cookies: AstroCookies): Attribution | null {
  const raw = cookies.get(ATTR_COOKIE)?.value;
  if (!raw) return null;
  // The client URL-encodes the JSON; try raw and decoded forms.
  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    /* not encoded */
  }
  for (const c of candidates) {
    try {
      const a = JSON.parse(c) as Attribution;
      if (a && typeof a === "object") return a;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Log an `attribution` event for a conversion, if the visitor has UTM tags. */
export async function recordAttribution(
  db: Db,
  cookies: AstroCookies,
  context: "lead" | "purchase" | "signup",
  userId?: string | null,
): Promise<void> {
  const attr = readAttribution(cookies);
  if (!attr) return;
  if (!attr.source && !attr.medium && !attr.campaign) return; // organic — skip
  await logEvent(db, {
    userId: userId ?? null,
    type: "attribution",
    payload: { context, ...attr },
  });
}
