import { useEffect, useState, type ReactNode } from "react";
import { Crown, Eye, Lock, ShieldCheck, Sparkles } from "lucide-react";
import {
  isTrialActive,
  trialDaysRemaining,
  paidDaysRemaining,
  isPaidActive,
  accountTrialRemainingMs,
  accountTrialDaysRemaining,
} from "@/lib/subscription-store";
import { IS_TESTING_MODE } from "@/lib/testing-mode";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { CheckoutModal, PASS } from "@/components/CheckoutModal";
import { getMySubscription } from "@/lib/subscription.functions";



export function DisciplineGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, checking: adminChecking } = useIsAdmin();
  const [active, setActive] = useState<boolean | null>(null);
  const [trialDays, setTrialDays] = useState(0);
  const [paidDays, setPaidDays] = useState(0);
  const [onTrial, setOnTrial] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [adminPreview, setAdminPreview] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [serverPaidUntil, setServerPaidUntil] = useState<number | null>(null);

  /** Server-verified pass expiry for the signed-in user. */
  const loadServerPass = async (): Promise<number | null> => {
    if (!user) return null;
    try {
      const { expiresAt } = await getMySubscription();
      const ms = expiresAt ? Date.parse(expiresAt) : NaN;
      const value = Number.isFinite(ms) ? ms : null;
      setServerPaidUntil(value);
      return value;
    } catch {
      return null;
    }
  };

  const refresh = (serverUntil: number | null = serverPaidUntil) => {
    const now = Date.now();
    // Signed-in users: the 7-day trial is anchored to the account's
    // created_at so it behaves identically on every device. Signed-out
    // visitors fall back to the device-local trial clock.
    const createdAtMs = user?.created_at ? Date.parse(user.created_at) : null;
    const trialLeft = createdAtMs
      ? accountTrialRemainingMs(createdAtMs, now)
      : (isTrialActive(now) ? trialDaysRemaining(now) * 24 * 60 * 60 * 1000 : 0);
    setOnTrial(trialLeft > 0);
    setTrialDays(
      createdAtMs ? accountTrialDaysRemaining(createdAtMs, now) : trialDaysRemaining(now),
    );
    // Signed-in users: the paid window is whatever the backend has verified.
    const serverActive = !!serverUntil && serverUntil > now;
    const serverDays = serverActive
      ? Math.ceil((serverUntil! - now) / (24 * 60 * 60 * 1000))
      : 0;
    setPaidDays(user ? serverDays : paidDaysRemaining(now));
    setActive(
      IS_TESTING_MODE ||
        isAdmin === true ||
        trialLeft > 0 ||
        (user ? serverActive : isPaidActive(now)),
    );
  };

  useEffect(() => {
    // Wait for the admin role check before deciding — otherwise the paywall
    // modal would flash for admins on first paint.
    if (authLoading || adminChecking) return;
    let cancelled = false;
    void (async () => {
      const until = await loadServerPass();
      if (!cancelled) refresh(until);
    })();
    const id = window.setInterval(() => refresh(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, adminChecking, isAdmin, user?.id]);

  const paywall = (preview: boolean) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-5 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-400/30 bg-[oklch(0.12_0.03_60)] p-7 text-center shadow-2xl">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 30% 0%, oklch(0.55 0.18 60 / 0.35), transparent 55%), radial-gradient(circle at 80% 100%, oklch(0.4 0.15 20 / 0.35), transparent 55%)",
          }}
        />
        <div className="relative">
          {preview && (
            <p className="mb-4 rounded-xl border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-violet-300">
              Admin preview of the student paywall
            </p>
          )}
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40">
            <Lock className="h-7 w-7" />
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300">
            7-Day Free Trial Completed
          </p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
            Cadet, your vault is sealed.
          </h2>
          <p className="mt-3 text-sm text-white/70">
            Keep your vault open and protect your shields.
          </p>
          <div className="mt-5 rounded-2xl border border-amber-400/30 bg-black/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300/80">
              {PASS.name}
            </p>
            <p className="mt-1 text-4xl font-black text-white">
              ₹{PASS.price}
              <span className="text-base font-bold text-white/60"> / 30 Days</span>
            </p>
            <p className="mt-1 text-[11px] text-white/50">{PASS.billing}</p>
          </div>
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-black shadow-lg shadow-amber-500/25 hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" />
            Pay Now · ₹{PASS.price}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => {
                setCheckoutOpen(false);
                setAdminPreview(false);
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white/70 hover:bg-white/5"
            >
              Exit preview
            </button>
          )}
          <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40">
            Simulated payment · No real charge
          </p>
        </div>
      </div>
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        previewOnly={preview}
        onActivated={() => {
          refresh();
          setFlash("Payment confirmed. Welcome back, Cadet.");
          setTimeout(() => setFlash(null), 2400);
        }}
      />
    </div>
  );

  if (active === null) return null;

  if (!active) return paywall(false);

  if (adminPreview) return paywall(true);


  return (
    <div className="relative">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-2 px-5 pt-3">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur ${
            isAdmin
              ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
              : IS_TESTING_MODE
                ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
                : onTrial
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
          }`}
        >
          {isAdmin ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
          {isAdmin
            ? "Admin · Full Access"
            : IS_TESTING_MODE
              ? "Demo Mode · All features unlocked"
              : onTrial
                ? `Trial · ${trialDays} day${trialDays === 1 ? "" : "s"} remaining`
                : `Member · ${paidDays} day${paidDays === 1 ? "" : "s"} remaining`}

        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAdminPreview(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300 backdrop-blur hover:bg-violet-400/20"
          >
            <Eye className="h-3 w-3" />
            Preview Paywall
          </button>
        )}
      </div>

      {flash && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
          <div className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-200 backdrop-blur">
            {flash}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
