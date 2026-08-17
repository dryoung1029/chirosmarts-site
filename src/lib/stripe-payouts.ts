/**
 * Stripe balance + payout status for the admin revenue page.
 *
 * Answers "what's actually coming to my bank account, and when" — distinct from
 * the sales ledger, which records what was SOLD. Money flows: a charge lands in
 * `pending` (Stripe's rolling settlement window), becomes `available`, then
 * Stripe pays it out to the bank (`in_transit` → `paid`).
 *
 * Read-only: every call here is a GET. Never throws — the revenue page must
 * render even when Stripe is unconfigured, rate-limited, or down.
 */
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export interface PayoutRow {
  id: string;
  amountCents: number;
  currency: string;
  status: string; // pending | in_transit | paid | failed | canceled
  arrivalDate: string | null; // ISO; Stripe's estimated bank arrival
  createdAt: string | null;
}

export interface StripeMoneyView {
  configured: boolean;
  livemode: boolean;
  /** Settled and payable to the bank. */
  availableCents: number;
  /** Charges still inside Stripe's settlement window. */
  pendingCents: number;
  currency: string;
  /** Payouts not yet landed (pending + in_transit) — "on its way to the bank". */
  inTransitCents: number;
  recentPayouts: PayoutRow[];
  /** Populated when Stripe couldn't be reached; the page degrades gracefully. */
  error: string | null;
}

const EMPTY: StripeMoneyView = {
  configured: false,
  livemode: false,
  availableCents: 0,
  pendingCents: 0,
  currency: "usd",
  inTransitCents: 0,
  recentPayouts: [],
  error: null,
};

const iso = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

/** Sum a Stripe balance bucket, preferring USD but tolerating other currencies. */
function sumBucket(
  entries: { amount: number; currency: string }[] | undefined,
  currency: string,
): number {
  return (entries ?? [])
    .filter((e) => e.currency === currency)
    .reduce((n, e) => n + e.amount, 0);
}

export async function getStripeMoneyView(
  env: CloudflareEnv,
): Promise<StripeMoneyView> {
  if (!isStripeConfigured(env)) return EMPTY;

  try {
    const stripe = getStripe(env);
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 10 }),
    ]);

    const currency =
      balance.available[0]?.currency ?? balance.pending[0]?.currency ?? "usd";

    const recentPayouts: PayoutRow[] = payouts.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      currency: p.currency,
      status: p.status,
      arrivalDate: iso(p.arrival_date),
      createdAt: iso(p.created),
    }));

    const inTransitCents = recentPayouts
      .filter((p) => p.status === "pending" || p.status === "in_transit")
      .reduce((n, p) => n + p.amountCents, 0);

    return {
      configured: true,
      livemode: balance.livemode,
      availableCents: sumBucket(balance.available, currency),
      pendingCents: sumBucket(balance.pending, currency),
      currency,
      inTransitCents,
      recentPayouts,
      error: null,
    };
  } catch (e) {
    return { ...EMPTY, configured: true, error: (e as Error).message };
  }
}

/**
 * Deep links into the Stripe Dashboard. Test-mode keys must route through
 * /test/ or the link lands on an empty live dashboard.
 */
export function stripeDashboardUrls(env: CloudflareEnv, livemode: boolean) {
  // Trust the key prefix when we have it; fall back to the API's livemode flag.
  const key = env.STRIPE_SECRET_KEY ?? "";
  const isTest = key.startsWith("sk_test_") || key.startsWith("rk_test_")
    ? true
    : key
      ? false
      : !livemode;
  const base = `https://dashboard.stripe.com${isTest ? "/test" : ""}`;
  return {
    isTest,
    home: base,
    balance: `${base}/balance`,
    payouts: `${base}/payouts`,
    payments: `${base}/payments`,
  };
}
