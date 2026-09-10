import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { simulatePayment } from "@/lib/subscription-store";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/razorpay.functions";
import { Check, CreditCard, ShieldCheck, Zap } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export const PASS = {
  name: "Discipline Hub Pass",
  price: 15,
  unit: "/ 30 Days",
  billing: "Billed monthly · Rolling 30-day access",
  features: [
    "Every note & chapter PDF",
    "Active revision cores",
    "Ghost task tracking",
    "Performance reports",
  ],
};

export const BRAND_NAME = "from The Last Bench";
export const BRAND_DESCRIPTION = "Study Notes Purchase";
export const BRAND_LOGO =
  "https://nrzwxgiljnotoizhblhc.supabase.co/storage/v1/object/public/Logo/1786358552177.png";
export const BRAND_COLOR = "#8B0000";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type CheckoutItem = {
  /** What is being bought — shown as the modal title. */
  title: string;
  /** Amount in rupees charged through Razorpay. */
  price: number;
  /** `pass` extends the Discipline Hub Pass, `note` unlocks a single pack. */
  kind: "pass" | "note";
};

const PASS_ITEM: CheckoutItem = { title: PASS.name, price: PASS.price, kind: "pass" };

export function CheckoutModal({
  open,
  onOpenChange,
  onActivated,
  previewOnly = false,
  item = PASS_ITEM,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the payment is verified (pass activated / note unlocked). */
  onActivated?: () => void | Promise<void>;
  /** Admin preview: walk the whole flow without granting real access. */
  previewOnly?: boolean;
  /** What the student is paying for. Defaults to the Discipline Hub Pass. */
  item?: CheckoutItem;
}) {
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [done, setDone] = useState<{ expiresAt: number | null; reference: string } | null>(null);

  const isPass = item.kind === "pass";

  const reset = useCallback(() => {
    setProcessing(false);
    setPayError(null);
    setDone(null);
  }, []);

  const activate = useCallback(
    async (ref: string) => {
      let expiresAt: number | null = null;
      if (isPass) {
        expiresAt = previewOnly ? Date.now() + 30 * 24 * 60 * 60 * 1000 : simulatePayment();
      }
      if (!previewOnly) await onActivated?.();
      setDone({ expiresAt, reference: ref });
      setProcessing(false);
    },
    [isPass, onActivated, previewOnly],
  );

  const payWithRazorpay = useCallback(async () => {
    setPayError(null);
    if (previewOnly) {
      setProcessing(true);
      await activate("PREVIEW-RZP");
      return;
    }
    setProcessing(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) throw new Error("Could not load the payment window.");
      const order = await createRazorpayOrder({
        data: { amount: item.price, label: item.title },
      });
      setProcessing(false);
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: BRAND_NAME,
        description: BRAND_DESCRIPTION,
        image: BRAND_LOGO,
        theme: { color: BRAND_COLOR },
        notes: { item: item.title },
        // Show every standard method inside the Razorpay popup:
        // UPI apps + dynamic UPI QR, cards, netbanking and wallets.
        method: { upi: true, card: true, netbanking: true, wallet: true, emi: true, paylater: true },
        config: {
          display: {
            blocks: {
              upi: {
                name: "Pay via UPI (GPay / PhonePe / Paytm / QR)",
                instruments: [{ method: "upi", flows: ["intent", "qr", "collect"] }],
              },
            },
            sequence: ["block.upi", "method.card", "method.netbanking", "method.wallet"],
            preferences: { show_default_blocks: true },
          },
        },
        // Closing the popup without paying must leave everything locked.
        modal: { ondismiss: () => setProcessing(false), confirm_close: true },
        handler: (resp: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          void (async () => {
            setProcessing(true);
            try {
              if (!resp?.razorpay_payment_id || !resp?.razorpay_signature) {
                setProcessing(false);
                setPayError("Payment was not completed. Nothing has been unlocked.");
                return;
              }
              const result = await verifyRazorpayPayment({
                data: {
                  orderId: resp.razorpay_order_id,
                  paymentId: resp.razorpay_payment_id,
                  signature: resp.razorpay_signature,
                },
              });
              if (result.valid && result.reference) await activate(result.reference);
              else {
                setProcessing(false);
                setPayError("We could not verify that payment. Please contact support.");
              }
            } catch {
              setProcessing(false);
              setPayError("Payment verification failed. Please contact support.");
            }
          })();
        },
      });
      rzp.open();
    } catch (err) {
      setProcessing(false);
      setPayError(err instanceof Error ? err.message : "Payment could not be started.");
    }
  }, [activate, item.price, item.title, previewOnly]);

  const close = useCallback(() => {
    onOpenChange(false);
    window.setTimeout(reset, 220);
  }, [onOpenChange, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) window.setTimeout(reset, 220);
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-0 shadow-2xl">
        {done ? (
          <div className="p-6 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success ring-1 ring-success/40">
              <Check className="h-10 w-10" strokeWidth={2.5} />
            </div>
            <DialogHeader className="mt-5">
              <DialogTitle className="text-2xl font-bold text-foreground">
                {isPass ? "Pass Activated for 30 Days" : "Note Unlocked"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {isPass
                  ? "Welcome to the vault, Cadet. Your Discipline Hub Pass is live."
                  : `${item.title} is now in your library, Cadet.`}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-3 rounded-2xl border border-border bg-background/50 p-4 text-left">
              <Row label={isPass ? "Plan" : "Note"} value={item.title} />
              <Row label="Amount" value={`₹${item.price}`} />
              <Row label="Payment ID" value={done.reference || "—"} mono />
              {done.expiresAt && (
                <div className="border-t border-border pt-3">
                  <Row label="Expires on" value={formatDate(done.expiresAt)} strong />
                </div>
              )}
            </div>

            {previewOnly && (
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-violet-400">
                Admin preview · nothing was charged or changed
              </p>
            )}

            <button
              type="button"
              onClick={close}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3.5 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6">
            <DialogHeader className="text-left">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                Checkout
              </p>
              <DialogTitle className="mt-1 text-2xl font-bold text-foreground">
                {item.title}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {isPass
                  ? `₹${item.price} ${PASS.unit} · ${PASS.billing}`
                  : `₹${item.price} · Lifetime access to this pack`}
              </DialogDescription>
            </DialogHeader>

            {previewOnly && (
              <p className="mt-3 rounded-xl border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-violet-300">
                Admin preview of the student checkout
              </p>
            )}

            <button
              type="button"
              disabled={processing}
              onClick={() => void payWithRazorpay()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {processing ? "Opening…" : `Pay Securely · ₹${item.price}`}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
              <ShieldCheck className="h-3.5 w-3.5" />
              UPI · Card · Netbanking · Wallet
            </p>

            {payError && (
              <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive">
                {payError}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate font-semibold text-foreground",
          mono && "font-mono text-xs",
          strong && "text-base font-black text-accent-amber",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export const PASS_ICON = Zap;
