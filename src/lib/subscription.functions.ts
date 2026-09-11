import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac, timingSafeEqual } from "crypto";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Current signed-in user's Discipline Hub pass expiry (server-verified). */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { expiresAt: data?.expires_at ?? null };
  });

/**
 * Verifies a Razorpay payment and extends the signed-in user's pass by 30
 * days. Access is only ever granted from this server-side path.
 */
export const activatePassSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; paymentId: string; signature: string }) => ({
    orderId: String(input?.orderId ?? ""),
    paymentId: String(input?.paymentId ?? ""),
    signature: String(input?.signature ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keySecret) throw new Error("Payments are not configured");
    if (!data.orderId || !data.paymentId || !data.signature) {
      throw new Error("Payment could not be verified");
    }

    const expected = createHmac("sha256", keySecret)
      .update(`${data.orderId}|${data.paymentId}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(data.signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Payment could not be verified");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const base = existing?.expires_at ? Date.parse(existing.expires_at) : 0;
    const from = Math.max(Date.now(), Number.isFinite(base) ? base : 0);
    const expiresAt = new Date(from + THIRTY_DAYS_MS).toISOString();

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        { user_id: context.userId, expires_at: expiresAt, last_payment_id: data.paymentId },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);

    return { expiresAt };
  });
