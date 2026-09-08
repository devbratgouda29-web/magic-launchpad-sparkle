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
import {
  Check,
  Copy,
  CreditCard,
  Landmark,
  QrCode,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

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

export const UPI_ID = "fromthelastbench@upi";

const CARD_METHODS = [
  { id: "card", label: "Cards", sub: "Visa, Mastercard, RuPay", icon: CreditCard },
  { id: "netbanking", label: "Net Banking", sub: "All major banks", icon: Landmark },
  { id: "wallet", label: "Wallets", sub: "Paytm, Amazon Pay", icon: Smartphone },
];

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CheckoutModal({
  open,
  onOpenChange,
  onActivated,
  previewOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the pass is activated (so parents can refresh their gate). */
  onActivated?: () => void;
  /** Admin preview: walk the whole flow without granting real access. */
  previewOnly?: boolean;
}) {
  const [tab, setTab] = useState<"card" | "upi">("upi");
  const [method, setMethod] = useState("card");
  const [utr, setUtr] = useState("");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTab("upi");
    setMethod("card");
    setUtr("");
    setProcessing(false);
    setCopied(false);
    setExpiresAt(null);
    setReference(null);
  }, []);

  const activate = useCallback(
    (ref: string) => {
      setProcessing(true);
      window.setTimeout(() => {
        const until = previewOnly
          ? Date.now() + 30 * 24 * 60 * 60 * 1000
          : simulatePayment();
        setExpiresAt(until);
        setReference(ref);
        setProcessing(false);
        if (!previewOnly) onActivated?.();
      }, 900);
    },
    [onActivated, previewOnly],
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
        {expiresAt ? (
          <div className="p-6 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success ring-1 ring-success/40">
              <Check className="h-10 w-10" strokeWidth={2.5} />
            </div>
            <DialogHeader className="mt-5">
              <DialogTitle className="text-2xl font-bold text-foreground">
                Pass Activated for 30 Days
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Welcome to the vault, Cadet. Your Discipline Hub Pass is live.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-3 rounded-2xl border border-border bg-background/50 p-4 text-left">
              <Row label="Plan" value={PASS.name} />
              <Row label="Amount" value={`₹${PASS.price}`} />
              <Row label="Reference" value={reference ?? "—"} mono />
              <div className="border-t border-border pt-3">
                <Row label="Expires on" value={formatDate(expiresAt)} strong />
              </div>
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
                {PASS.name}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                ₹{PASS.price} {PASS.unit} · {PASS.billing}
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
              <TabBtn active={tab === "card"} onClick={() => setTab("card")} icon={CreditCard}>
                Card / Netbanking
              </TabBtn>
            </div>

            {tab === "upi" ? (
              <div className="mt-5">
                <div className="mx-auto grid h-48 w-48 place-items-center rounded-2xl border-2 border-dashed border-border bg-background/60 text-muted-foreground">
                  <div className="text-center">
                    <QrCode className="mx-auto h-16 w-16" />
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
                      QR code placeholder
                    </p>
                  </div>
                </div>

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

                <label className="mt-4 block">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                    Transaction UTR / Reference ID
                  </span>
                  <input
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="e.g. 402312345678"
                    className="mt-2 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent-amber/60"
                  />
                </label>

                <button
                  type="button"
                  disabled={processing || utr.trim().length < 6}
                  onClick={() => activate(utr.trim())}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3.5 text-sm font-black uppercase tracking-widest text-accent-amber-foreground shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-50"
                >
                  {processing ? "Verifying…" : "Submit Payment Verification"}
                </button>
                <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  Enter at least 6 characters of your UTR
                </p>
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex flex-col gap-2.5">
                  {CARD_METHODS.map((m) => {
                    const Icon = m.icon;
                    const active = method === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                          active
                            ? "border-accent-amber/60 bg-accent-amber/10 ring-1 ring-accent-amber/40"
                            : "border-border bg-background/50 hover:bg-background",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                            active
                              ? "bg-accent-amber/20 text-accent-amber"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-foreground">{m.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{m.sub}</span>
                        </span>
                        {active && <Check className="h-4 w-4 text-accent-amber" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={processing}
                  onClick={() => activate(`FTLB-${Date.now().toString(36).toUpperCase()}`)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3.5 text-sm font-black uppercase tracking-widest text-accent-amber-foreground shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {processing ? "Processing…" : `Confirm Payment · ₹${PASS.price}`}
                </button>
              </div>
            )}

            <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Simulated payment · No real charge
            </p>
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
