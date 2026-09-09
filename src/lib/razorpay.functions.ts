import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "crypto";

/** Public key id for the browser checkout widget. */
export const getRazorpayKey = createServerFn({ method: "GET" }).handler(async () => {
  return { keyId: process.env["RAZORPAY_KEY_ID"] ?? "" };
});

/** Creates a Razorpay order for the given amount (in rupees). */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { amount: number; label: string }) => {
    const amount = Number(input?.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      throw new Error("Invalid amount");
    }
    const label = String(input?.label ?? "").slice(0, 60);
    return { amount: Math.round(amount), label };
  })
  .handler(async ({ data }) => {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) throw new Error("Razorpay is not configured");

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: data.amount * 100,
        currency: "INR",
        notes: { label: data.label },
      }),
    });

    if (!res.ok) {
      console.error("razorpay order failed", res.status, await res.text());
      throw new Error("Could not start the payment. Please try again.");
    }

    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
  });

/** Verifies the signature Razorpay returns after a successful payment. */
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .inputValidator((input: { orderId: string; paymentId: string; signature: string }) => ({
    orderId: String(input?.orderId ?? ""),
    paymentId: String(input?.paymentId ?? ""),
    signature: String(input?.signature ?? ""),
  }))
  .handler(async ({ data }) => {
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keySecret) throw new Error("Razorpay is not configured");
    if (!data.orderId || !data.paymentId || !data.signature) return { valid: false };

    const expected = createHmac("sha256", keySecret)
      .update(`${data.orderId}|${data.paymentId}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(data.signature);
    const valid = a.length === b.length && timingSafeEqual(a, b);
    return { valid, reference: valid ? data.paymentId : "" };
  });
