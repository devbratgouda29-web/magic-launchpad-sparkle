import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Sparkles, Zap } from "lucide-react";
import { CheckoutModal, PASS } from "@/components/CheckoutModal";

export const Route = createFileRoute("/_app/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — From The Last Bench" },
      {
        name: "description",
        content:
          "Discipline Hub Pass — ₹25 for 30 days. Unlock every note, shield, and mission.",
      },
      { property: "og:title", content: "Pricing — From The Last Bench" },
      {
        property: "og:description",
        content: "Discipline Hub Pass — ₹25 for 30 days. Unlock every note, shield, and mission.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [open, setOpen] = useState(false);

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
          One simple pass. No hidden fees. Cancel anytime.
        </p>
      </header>

      <section className="rounded-3xl border border-accent-amber/40 bg-card p-6 shadow-lg shadow-amber-500/10">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent-amber/15 text-accent-amber ring-1 ring-accent-amber/40">
            <Zap className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
              Rolling Access
            </p>
            <h2 className="mt-0.5 text-xl font-bold text-foreground">{PASS.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{PASS.billing}</p>
          </div>
        </div>

        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-4xl font-black text-foreground">₹{PASS.price}</span>
          <span className="text-sm font-semibold text-muted-foreground">{PASS.unit}</span>
        </div>

        <ul className="mt-5 flex flex-col gap-2.5">
          {PASS.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5 text-sm text-foreground/90">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-amber/20 text-accent-amber">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3.5 text-sm font-black uppercase tracking-widest text-accent-amber-foreground shadow-lg shadow-amber-500/20 transition-all hover:brightness-110"
        >
          <Sparkles className="h-4 w-4" />
          Get Started
        </button>
      </section>

      <div className="mt-8 text-center">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to Home
        </Link>
      </div>

      <CheckoutModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
