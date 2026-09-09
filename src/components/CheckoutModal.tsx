import { useCallback, useMemo, useState } from "react";
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
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  QrCode,
  Smartphone,
  Zap,
} from "lucide-react";

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

export const UPI_ID = "6376104233-sa01@axl";
export const UPI_PAYEE_NAME = "fromTheLastBench";
export const QR_IMAGE = "/assets/phonepe-qr.png";

export function upiDeepLink(amount: number, note?: string) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: String(amount),
    cu: "INR",
  });
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}

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
  /** Amount in rupees, loaded into the UPI deep link. */
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
  /** Called after the payment is accepted (pass activated / note unlocked). */
  onActivated?: () => void | Promise<void>;
  /** Admin preview: walk the whole flow without granting real access. */
  previewOnly?: boolean;
  /** What the student is paying for. Defaults to the Discipline Hub Pass. */
  item?: CheckoutItem;
}) {
  const [tab, setTab] = useState<"upi" | "utr">("upi");
  const [utr, setUtr] = useState("");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [done, setDone] = useState<{ expiresAt: number | null; reference: string } | null>(null);

  const isPass = item.kind === "pass";
  const deepLink = useMemo(() => upiDeepLink(item.price, item.title), [item.price, item.title]);

  const reset = useCallback(() => {
    setTab("upi");
    setUtr("");
    setProcessing(false);
    setCopied(false);
    setDone(null);
  }, []);

  const activate = useCallback(
    (ref: string) => {
      setProcessing(true);
      window.setTimeout(() => {
        void (async () => {
          let expiresAt: number | null = null;
          if (isPass) {
            expiresAt = previewOnly
              ? Date.now() + 30 * 24 * 60 * 60 * 1000
              : simulatePayment();
          }
          setDone({ expiresAt, reference: ref });
          setProcessing(false);
          if (!previewOnly) await onActivated?.();
        })();
      }, 900);
    },
    [isPass, onActivated, previewOnly],
  );

  const copyUpi = useCallback(() => {
    void navigator.clipboard?.writeText(UPI_ID);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, []);

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
              <Row label="Reference" value={done.reference || "—"} mono />
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
                {isPass ? `₹${item.price} ${PASS.unit} · ${PASS.billing}` : `₹${item.price} · Lifetime access to this pack`}
              </DialogDescription>
            </DialogHeader>

            {previewOnly && (
              <p className="mt-3 rounded-xl border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-violet-300">
                Admin preview of the student checkout
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background/50 p-1">
              <TabBtn active={tab === "upi"} onClick={() => setTab("upi")} icon={QrCode}>
                Pay via UPI / QR
              </TabBtn>
              <TabBtn active={tab === "utr"} onClick={() => setTab("utr")} icon={Smartphone}>
                Manual Verification
              </TabBtn>
            </div>

            {tab === "upi" ? (
              <div className="mt-5">
                {qrFailed ? (
                  <div className="mx-auto grid h-52 w-52 place-items-center rounded-2xl border-2 border-dashed border-border bg-background/60 text-muted-foreground">
                    <div className="px-3 text-center">
                      <QrCode className="mx-auto h-14 w-14" />
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
                        Add your QR at /assets/phonepe-qr.png
                      </p>
                    </div>
                  </div>
                ) : (
                  <img
                    src={QR_IMAGE}
                    alt={`PhonePe UPI QR code for ${UPI_ID}`}
                    onError={() => setQrFailed(true)}
                    className="mx-auto h-52 w-52 rounded-2xl border border-border bg-white object-contain p-2"
                  />
                )}

                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                      UPI ID
                    </p>
                    <p className="truncate font-mono text-sm font-semibold text-foreground">
                      {UPI_ID}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyUpi}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-background"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <a
                  href={deepLink}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3.5 text-sm font-black uppercase tracking-widest text-accent-amber-foreground shadow-lg shadow-amber-500/20 hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" />
                  Pay via UPI App · ₹{item.price}
                </a>

                <button
                  type="button"
                  onClick={() => setTab("utr")}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-border px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Already paid? Submit UTR
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                    12-digit UTR / Reference Number
                  </span>
                  <input
                    value={utr}
                    inputMode="numeric"
                    maxLength={12}
                    onChange={(e) => setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder="402312345678"
                    className="mt-2 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 font-mono text-sm tracking-widest text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent-amber/60"
                  />
                </label>

                <button
                  type="button"
                  disabled={processing || utr.length !== 12}
                  onClick={() => activate(utr)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3.5 text-sm font-black uppercase tracking-widest text-accent-amber-foreground shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-50"
                >
                  {processing ? "Verifying…" : "Submit UTR Number"}
                </button>
                <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  Enter the exact 12-digit UTR from your UPI app
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all",
        active
          ? "bg-accent-amber text-accent-amber-foreground shadow"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
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
