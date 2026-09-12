import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, FlaskConical, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  getPurchaseAnalytics,
  listUsers,
  setUserAdmin,
  type AdminUser,
  type PurchaseAnalytics,
} from "@/lib/admin.functions";
import { bypassAllTimers, getAllItems, getFracturedItems, restoreItem, setDisplayTier, type RevisionItem } from "@/lib/revision-engine";
import { addStudySession, type StudySubject } from "@/lib/study-sessions";
import { IS_TESTING_MODE } from "@/lib/testing-mode";
import { StyledSelect } from "@/components/StyledSelect";
import { cn } from "@/lib/utils";

const card = "flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border";
const heading =
  "flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground";

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** 3. Purchase analytics summary. */
export function PurchaseAnalyticsCard() {
  const fetchAnalytics = useServerFn(getPurchaseAnalytics);
  const [data, setData] = useState<PurchaseAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetchAnalytics();
        if (active) setData(res);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load analytics");
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchAnalytics]);

  return (
    <section className={card}>
      <h2 className={heading}>
        <BarChart3 className="h-4 w-4" /> Purchase analytics
      </h2>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!data && !error ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Revenue", value: inr(data.totalRevenue) },
              { label: "Purchases", value: String(data.totalPurchases) },
              { label: "Buyers", value: String(data.buyers) },
              { label: "Last 7 days", value: String(data.last7Days) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/40 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1 text-lg font-black">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {data.topNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No purchases yet.</p>
            ) : (
              data.topNotes.map((n) => (
                <div
                  key={n.note_id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs"
                >
                  <span className="truncate font-semibold">{n.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {n.count} sold · {inr(n.revenue)}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Last 30 days: {data.last30Days} purchases.
          </p>
        </>
      ) : null}
    </section>
  );
}

/** 2a. User management. */
export function UserManagementCard() {
  const fetchUsers = useServerFn(listUsers);
  const toggleAdmin = useServerFn(setUserAdmin);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const load = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, [fetchUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  const flip = async (u: AdminUser) => {
    setBusy(u.id);
    try {
      const res = await toggleAdmin({ data: { userId: u.id, admin: !u.is_admin } });
      if (!res.ok) {
        toast.error(res.error ?? "Update failed");
        return;
      }
      toast.success(u.is_admin ? "Admin access removed" : "Admin access granted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };


  const q = query.trim().toLowerCase();
  const filtered = (users ?? []).filter(
    (u) =>
      !q ||
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <section className={card}>
      <h2 className={heading}>
        <Users className="h-4 w-4" /> User management ({users?.length ?? 0})
      </h2>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder="Search by name or email…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent-amber"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!users ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No users match that search.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pageUsers.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {u.full_name || u.email || "Student"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {u.email} · {u.purchases} purchase{u.purchases === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === u.id}
                onClick={() => void flip(u)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ring-1 transition-colors",
                  u.is_admin
                    ? "bg-accent-amber text-accent-amber-foreground ring-accent-amber"
                    : "bg-background text-muted-foreground ring-border hover:text-foreground",
                )}
              >
                {busy === u.id ? "…" : u.is_admin ? "Admin" : "Make admin"}
              </button>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full bg-background px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-border disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[11px] text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-full bg-background px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-border disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}


/** 4. Demo / testing tools — level badges, focus hours and library shortcuts. */
export function TestingToolsCard() {
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [hours, setHours] = useState("2");
  const [subject, setSubject] = useState<StudySubject>("Physics");

  const refresh = useCallback(() => setItems(getAllItems()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const grant = (id: string, tier: 1 | 2 | 3 | 4 | 5 | null) => {
    setDisplayTier(id, tier);
    refresh();
    toast.success(tier ? `Level ${tier} badge granted` : "Badge revoked");
  };

  const addHours = () => {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return toast.error("Enter a valid number of hours");
    addStudySession({
      userId: "demo",
      subject,
      topic: "Admin demo session",
      durationMinutes: Math.round(h * 60),
      timestamp: Date.now(),
    });
    toast.success(`${h}h of ${subject} focus added`);
  };

  return (
    <section className={card}>
      <h2 className={heading}>
        <FlaskConical className="h-4 w-4" /> Demo &amp; Role Testing
      </h2>
      <p className="text-[11px] text-muted-foreground">
        Testing mode is {IS_TESTING_MODE ? "ON — every user is treated as Premium" : "OFF"}. Grant
        level badges and focus hours below to test any rank state instantly.
      </p>

      <button
        type="button"
        onClick={() => {
          try {
            for (const f of getFracturedItems()) restoreItem(f.id, "easy");
            bypassAllTimers();
            localStorage.setItem("ftlb.devpass.bypass", String(Date.now()));
            window.dispatchEvent(new CustomEvent("devpass:bypass"));
            refresh();
            toast.success("Lockdown cleared and recall timers released");
          } catch {
            toast.error("Could not clear lockdown");
          }
        }}
        className="self-start rounded-xl bg-amber-400/15 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/25"
      >
        Bypass lockdown &amp; recall timers
      </button>


      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Focus hours
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 block w-24 rounded-lg bg-muted px-2 py-1.5 text-sm font-normal text-foreground"
          />
        </label>
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Subject
          <div className="mt-1 w-40">
            <StyledSelect
              ariaLabel="Subject"
              value={subject}
              options={(["Physics", "Chemistry", "Math/Bio", "Other"] as StudySubject[]).map(
                (s) => ({ value: s, label: s }),
              )}
              onChange={(v) => setSubject(v)}
            />
          </div>
        </label>
        <button
          type="button"
          onClick={addHours}
          className="rounded-lg bg-accent-amber px-3 py-2 text-[10px] font-black uppercase tracking-widest text-accent-amber-foreground"
        >
          Add focus hours
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tracked chapters yet on this device — start one from the Library to test badges.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl bg-muted/40 p-2.5 ring-1 ring-border">
              <p className="truncate text-xs font-semibold">
                {it.name}
                <span className="ml-2 font-normal text-muted-foreground">
                  badge: {it.displayTier ? `Level ${it.displayTier}` : "none"}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => grant(it.id, t)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ring-1 transition",
                      it.displayTier === t
                        ? "bg-accent-amber text-accent-amber-foreground ring-accent-amber"
                        : "text-muted-foreground ring-border",
                    )}
                  >
                    T{t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => grant(it.id, null)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-destructive ring-1 ring-destructive/40"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
