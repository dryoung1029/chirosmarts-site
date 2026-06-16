/**
 * Stripe integration (test mode throughout the build, PLAN.md §2).
 *
 * Runs on the Workers runtime, so we use the Fetch HTTP client and the
 * SubtleCrypto provider for async webhook signature verification. Checkout is
 * Stripe-hosted (redirect). Prices are sent inline via `price_data` from the
 * course's `price_cents`, so no Stripe product setup is required to start.
 *
 * Dev fallback: when STRIPE_SECRET_KEY is unset, callers comp the purchase
 * instead of redirecting (mirrors the Resend / clinic-seats fallbacks), so the
 * enrollment + paywall flow is testable without keys.
 */
import Stripe from "stripe";

export function isStripeConfigured(env: CloudflareEnv): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

export function getStripe(env: CloudflareEnv): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
    // Pin nothing exotic; the SDK's default pinned version is fine.
  });
}

export interface CheckoutArgs {
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  clientReferenceId?: string;
  metadata: Record<string, string>;
}

/**
 * A one-time Checkout session for one or more courses (each quantity 1). Selling
 * is standalone today, but accepting a list means course bundles need no rework
 * later (PLAN.md Q2) — the webhook fulfils every course in the session.
 */
export async function createCourseCheckout(
  env: CloudflareEnv,
  args: CheckoutArgs & { courses: { title: string; priceCents: number }[] },
): Promise<string> {
  const stripe = getStripe(env);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: args.courses.map((c) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: c.priceCents,
        product_data: { name: c.title },
      },
    })),
    customer_email: args.customerEmail ?? undefined,
    client_reference_id: args.clientReferenceId,
    metadata: args.metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url!;
}

/** A Checkout session for N clinic training seats. */
export async function createSeatsCheckout(
  env: CloudflareEnv,
  args: CheckoutArgs & { unitPriceCents: number; quantity: number },
): Promise<string> {
  const stripe = getStripe(env);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: args.quantity,
        price_data: {
          currency: "usd",
          unit_amount: args.unitPriceCents,
          product_data: { name: "ChiroSmarts CA training seat" },
        },
      },
    ],
    customer_email: args.customerEmail ?? undefined,
    client_reference_id: args.clientReferenceId,
    metadata: args.metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url!;
}

/**
 * Retrieve a completed Checkout session (used by the success page to fulfil the
 * enrollment directly, independent of the webhook). Runs with the same secret
 * key that created the session, so it is always in the correct Stripe account.
 */
export async function retrieveCheckoutSession(
  env: CloudflareEnv,
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe(env);
  return stripe.checkout.sessions.retrieve(sessionId);
}

/** Verify + parse a webhook event (async SubtleCrypto path for Workers). */
export async function constructWebhookEvent(
  env: CloudflareEnv,
  payload: string,
  signature: string,
): Promise<Stripe.Event> {
  const stripe = getStripe(env);
  return stripe.webhooks.constructEventAsync(
    payload,
    signature,
    env.STRIPE_WEBHOOK_SECRET!,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}
