/**
 * First-party pageview metrics (SEO/traffic). Privacy-first by construction:
 * no cookies, no user ids, no IPs, no fingerprinting — the ONLY dimensions are
 * path, derived traffic channel, referrer host, UTM triplet, country, and a
 * coarse device class. Complements (not replaces) Cloudflare Web Analytics:
 * this data lives in OUR D1, so the admin dashboard can join organic-search
 * landings against conversion attribution without any external dashboard.
 */
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";

/** Public, indexable surface — the only paths we record. Keeps student/app
 * navigation (dashboard, learn, clinic, admin) out of marketing data. */
const PUBLIC_PREFIXES = [
  "/courses",
  "/blog",
  "/guides",
  "/help",
  "/clinics",
  "/renewal",
  "/about",
  "/verify",
  "/terms",
  "/privacy",
];
export function isTrackablePath(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

/** Hosts whose referrals count as ORGANIC SEARCH. Substring match on hostname. */
const SEARCH_HOSTS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.",
  "ecosia.org",
  "search.brave.com",
  "startpage.com",
  "yandex.",
  // Answer engines that pass a referrer — AEO traffic shows up as organic too.
  "chatgpt.com",
  "perplexity.ai",
  "claude.ai",
  "copilot.microsoft.com",
  "gemini.google.com",
];

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_social", "display"]);

export interface ViewInput {
  path: string;
  referrer: string; // full document.referrer ("" for direct)
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  country?: string | null;
  device?: "mobile" | "desktop" | null;
  siteHost: string; // our own hostname, for internal-navigation detection
}

/** Classify the traffic channel server-side (never trust the client's word). */
export function classifyChannel(v: ViewInput): {
  channel: string;
  referrerHost: string | null;
} {
  let referrerHost: string | null = null;
  try {
    referrerHost = v.referrer ? new URL(v.referrer).hostname.toLowerCase() : null;
  } catch {
    referrerHost = null;
  }

  if (v.utmMedium && PAID_MEDIUMS.has(v.utmMedium.toLowerCase()))
    return { channel: "paid", referrerHost };
  if (referrerHost === v.siteHost) return { channel: "internal", referrerHost };
  if (referrerHost && SEARCH_HOSTS.some((h) => referrerHost!.includes(h)))
    return { channel: "organic", referrerHost };
  // UTM present but not a paid medium → tagged campaign (email, social post…).
  if (v.utmSource || v.utmCampaign) return { channel: "campaign", referrerHost };
  if (referrerHost) return { channel: "referral", referrerHost };
  return { channel: "direct", referrerHost };
}

/** Obvious-bot filter. Not adversarial — just keeps crawlers out of the counts. */
export function looksLikeBot(ua: string): boolean {
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|pingdom|uptime/i.test(
    ua,
  );
}

export async function recordPageView(db: Db, v: ViewInput): Promise<void> {
  const { channel, referrerHost } = classifyChannel(v);
  await db.insert(schema.pageMetrics).values({
    id: newId("pv"),
    path: v.path,
    channel,
    referrerHost,
    utmSource: v.utmSource ?? null,
    utmMedium: v.utmMedium ?? null,
    utmCampaign: v.utmCampaign ?? null,
    country: v.country ?? null,
    device: v.device ?? null,
  });
}
