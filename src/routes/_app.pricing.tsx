import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Crown,
  CreditCard,
  Landmark,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_app/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — From The Last Bench" },
      { name: "description", content: "Unlock every note, shield, and mission. Choose the plan that fits your cadence." },
      { property: "og:title", content: "Pricing — From The Last Bench" },
      { property: "og:description", content: "Unlock every note, shield, and mission. Choose the plan that fits your cadence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

type Plan = {
  id: "monthly" | "lifetime";
  name: string;
  price: number;
  unit: string;
  badge: string;
  description: string;
  features: string[];
  icon: React.ElementType;
  cta: string;
};

const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "Monthly Pro",
    price: 15,
    unit: "/ Month",
    badge: "Rolling Access",
    description: "Full vault access, renewed every 30 days. Cancel anytime.",
    features: [
      "Every note & chapter PDF",
      "Active revision cores",
      "Ghost task tracking",
      "Performance reports",
    ],
    icon: Zap,
    cta: "Get Started",
  },
  {
    id: "lifetime",
    name: "Lifetime Access",
    price: 149,
    unit: " One-Time",
    badge: "Forever Yours",
    description: "Pay once. Own every current and future note forever.",
    features: [
      "Everything in Monthly Pro",
      "All future notes & updates",
      "Priority war-council rank",
      "No renewals, ever",
    ],
    icon: Crown,
    cta: "Get Started",
  },
];

const PAYMENT_METHODS = [
  { id: "upi", label: "UPI", sub: "Google Pay, PhonePe, Paytm", icon: Smartphone },
  { id: "card", label: "Cards", sub: "Visa, Mastercard, RuPay", icon: CreditCard },
  { id: "netbanking", label: "Net Banking", sub: "All major banks", icon: Landmark },
];

function generateTransactionId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "FTLB-";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}

function PricingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[0]);
  const [view, setView] = useState<"summary" | "success">("summary");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [processing, setProcessing] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  const openSummary = useCallback((plan: Plan) => {
    setSelectedPlan(plan);
    setPaymentMethod("upi");
    setView("summary");
    setProcessing(false);
    setTransactionId(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    // Reset after exit animation so reopening starts fresh.
    window.setTimeout(() => {
      setView("summary");
      setProcessing(false);
      setTransactionId(null);
    }, 200);
  }, []);

  const confirmPayment = useCallback(() => {
    setProcessing(true);
    window.setTimeout(() => {
      simulatePayment();
      setTransactionId(generateTransactionId());
      setProcessing(false);
      setView("success");
    }, 900);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-5 pb-28 pt-6">
      <header className="mb-8 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-amber">
          Choose Your Path
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Unlock the Vault
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
          No hidden fees. Cancel anytime. Full access to every note, shield, and battle plan.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onSelect={openSummary} />
        ))}
      </section>

      <div className="mt-8 text-center">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to Home
        </Link>
      </div>

      <PaymentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={selectedPlan}
        view={view}
        paymentMethod={paymentMethod}
        onMethodChange={setPaymentMethod}
        processing={processing}
        transactionId={transactionId}
        onConfirm={confirmPayment}
        onDone={closeModal}
      />
    </div>
  );
}

function PlanCard({ plan, onSelect }: { plan: Plan; onSelect: (plan: Plan) => void }) {
  const Icon = plan.icon;
  const isLifetime = plan.id === "lifetime";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card p-6 shadow-lg transition-transform active:scale-[0.98]",
        isLifetime
          ? "border-accent-amber/40 shadow-amber-500/10"
          : "border-border shadow-black/20",
      )}
    >
      {isLifetime && (
        <div className="absolute right-4 top-4 rounded-full bg-accent-amber/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-accent-amber">
          Best Value
        </div>
      )}

      <div className="flex items-start gap-4">
        <div
          className={cn(
            "grid h-14 w-14 shrink-0 place-items-center rounded-2xl ring-1",
            isLifetime
              ? "bg-accent-amber/15 text-accent-amber ring-accent-amber/40"
              : "bg-primary/15 text-primary ring-primary/40",
          )}
        >
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
            {plan.badge}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-foreground">{plan.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-black text-foreground">₹{plan.price}</span>
        <span className="text-sm font-semibold text-muted-foreground">{plan.unit}</span>
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm text-foreground/90">
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full",
                isLifetime ? "bg-accent-amber/20 text-accent-amber" : "bg-primary/20 text-primary",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        className={cn(
          "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black uppercase tracking-widest transition-all hover:brightness-110",
          isLifetime
            ? "bg-accent-amber text-accent-amber-foreground shadow-lg shadow-amber-500/20"
            : "bg-primary text-primary-foreground shadow-lg shadow-primary/20",
        )}
      >
        <Sparkles className="h-4 w-4" />
        {plan.cta}
      </button>
    </div>
  );
}

function PaymentModal({
  open,
  onOpenChange,
  plan,
  view,
  paymentMethod,
  onMethodChange,
  processing,
  transactionId,
  onConfirm,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan;
  view: "summary" | "success";
  paymentMethod: string;
  onMethodChange: (id: string) => void;
  processing: boolean;
  transactionId: string | null;
  onConfirm: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-0 shadow-2xl">
        {view === "summary" ? (
          <SummaryView
            plan={plan}
            paymentMethod={paymentMethod}
            onMethodChange={onMethodChange}
            processing={processing}
            onConfirm={onConfirm}
          />
        ) : (
          <SuccessView plan={plan} transactionId={transactionId} onDone={onDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryView({
  plan,
  paymentMethod,
  onMethodChange,
  processing,
  onConfirm,
}: {
  plan: Plan;
  paymentMethod: string;
  onMethodChange: (id: string) => void;
  processing: boolean;
  onConfirm: () => void;
}) {
  const gst = useMemo(() => Math.round(plan.price * 0.18), [plan.price]);
  const total = plan.price + gst;

  return (
    <div className="p-6">
      <DialogHeader className="text-left">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
          Payment Summary
        </p>
        <DialogTitle className="mt-1 text-2xl font-bold text-foreground">
          {plan.name}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Review your plan and pick a mock payment method.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-6 space-y-3 rounded-2xl border border-border bg-background/50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Plan price</span>
          <span className="font-semibold text-foreground">₹{plan.price}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">GST (18%)</span>
          <span className="font-semibold text-foreground">₹{gst}</span>
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-foreground">Total</span>
            <span className="text-xl font-black text-accent-amber">₹{total}</span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
          Pay With
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {PAYMENT_METHODS.map((method) => {
            const Icon = method.icon;
            const active = paymentMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => onMethodChange(method.id)}
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
                    active ? "bg-accent-amber/20 text-accent-amber" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">{method.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{method.sub}</span>
                </span>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full border",
                    active
                      ? "border-accent-amber bg-accent-amber text-accent-amber-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {active && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={processing}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3.5 text-sm font-black uppercase tracking-widest text-accent-amber-foreground shadow-lg shadow-amber-500/20 transition-all hover:brightness-110 disabled:opacity-60"
      >
        {processing ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-amber-foreground/30 border-t-accent-amber-foreground" />
            Processing…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Confirm Payment · ₹{plan.price + Math.round(plan.price * 0.18)}
          </>
        )}
      </button>

      <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Mock payment · No real charge
      </p>
    </div>
  );
}

function SuccessView({
  plan,
  transactionId,
  onDone,
}: {
  plan: Plan;
  transactionId: string | null;
  onDone: () => void;
}) {
  return (
    <div className="p-6 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success ring-1 ring-success/40">
        <Check className="h-10 w-10" strokeWidth={2.5} />
      </div>

      <DialogHeader className="mt-5">
        <DialogTitle className="text-2xl font-bold text-foreground">Payment Successful</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Welcome to the vault, Cadet. Your access is now unlocked.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-5 rounded-2xl border border-border bg-background/50 p-4 text-left">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
          Transaction ID
        </p>
        <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-foreground">
          {transactionId ?? "—"}
        </p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-semibold text-foreground">{plan.name}</span>
        </div>
      </div>

      <div className="mt-5 text-left">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
          Unlocked Features
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5 text-sm text-foreground/90">
              <Check className="h-4 w-4 text-success" strokeWidth={2.5} />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:brightness-110"
      >
        Done
      </button>
    </div>
  );
}
