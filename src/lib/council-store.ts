import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// THE WAR COUNCIL — Supabase is the PRIMARY SOURCE OF TRUTH.
// Every council action writes/reads the database first; any failure surfaces
// as a visible toast alert. There are NO silent local-only fallbacks that
// hide network errors. A local cache mirrors the database so the roster
// renders instantly and chat/ledger-only data survives between visits.

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return String(error ?? "Unknown error");
}

// Surface every database failure to the user immediately.
function alertCouncilFailure(action: string, error: unknown) {
  console.error(`[War Council] ${action} failed:`, error);
  toast.error(`${action} failed`, { description: errorMessage(error) });
}

async function safelySync(action: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    alertCouncilFailure(action, error);
  }
}



// THE WAR COUNCIL — Supabase-backed store for the multiplayer accountability cell.
// Real-life friends only: no random matchmaking, no public directories.
// A single user can create/join exactly ONE council; max 5 members per council.

export const CORE_TIERS = [
  "BRONZE CORE",
  "IRON CORE",
  "STEEL SENTINEL",
  "TITANIUM WARDEN",
  "PLATINUM CORE",
] as const;
export type CoreTier = (typeof CORE_TIERS)[number];

export type MemberDailyStats = {
  wakeUpAt: number | null;
  focusMinutes: number;
  tasksDone: number;
  tasksTotal: number;
  revisionCoresCleared: number;
  ghostsDone?: number;
  ghostsTotal?: number;
  chapterCores: Record<string, string>;
  coreLoops?: Record<string, number>;
  tier: string;
  characterRank: string;
};

export type MockScore = {
  id: string;
  memberTag: string;
  examName: string;
  score: number;
  scoreMax: number;
  loggedAt: number;
};

export type ExileVote = {
  targetTag: string;
  voterTag: string;
  down: boolean;
  at: number;
};

export type ChatMessage = {
  id: string;
  memberTag: string;
  kind: "text" | "image";
  body: string;
  at: number;
};

export type Member = {
  userTag: string; // #USR-XXXX
  userId?: string;
  name: string;
  joinedAt: number;
  isLeader: boolean;
  productivityRank: number;
  daily: MemberDailyStats;
  warlordUntil?: number;
};

export interface WeeklyWinner {
  week: number;
  winner: string;
  score: string;
}

export interface WallOfHonorEntry {
  month: string;
  overlord: string;
  score: string;
}

export type Council = {
  id?: string;
  councilTag: string; // #CNL-XXXX
  name: string;
  createdAt: number;
  members: Member[];
  chat: ChatMessage[];
  mockLedger: MockScore[];
  votes: ExileVote[];
  lastDailyReportAt?: number;
  lastWarlordAt?: number;
  weeklyWinners?: WeeklyWinner[];
  wallOfHonor?: WallOfHonorEntry[];
};

export type Me = { userTag: string; name: string; userId?: string };

const K_ME = "ftlb.council.me.v1";
const K_COUNCIL = "ftlb.council.v1";
const MAX = 5;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeCouncil(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function emit() {
  for (const l of listeners) l();
}

function rand(n: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
export function makeUserTag() {
  return "#USR-" + rand(4);
}
export function makeCouncilTag() {
  return "#CNL-" + rand(4);
}

// -------- Me --------
export function getMe(): Me {
  if (typeof window === "undefined") return { userTag: "#USR-XXXX", name: "You" };
  try {
    const raw = localStorage.getItem(K_ME);
    if (raw) return JSON.parse(raw);
  } catch {}
  const me: Me = { userTag: makeUserTag(), name: "You" };
  localStorage.setItem(K_ME, JSON.stringify(me));
  return me;
}

export function setMyName(name: string) {
  const me = getMe();
  const next = { ...me, name: name.trim() || me.name };
  localStorage.setItem(K_ME, JSON.stringify(next));
  const c = getCouncil();
  if (c) {
    const m = c.members.find((x) => x.userTag === next.userTag);
    if (m) {
      m.name = next.name;
      save(c);
    }
  }
  emit();
}

export function setMyUserId(userId: string | null | undefined) {
  if (typeof window === "undefined") return;
  const me = getMe();
  const c = getCouncil();
  const memberNeedsStamp =
    c?.members.some((m) => m.userTag === me.userTag && m.userId !== (userId ?? undefined)) ?? false;
  if (me.userId === (userId ?? undefined) && !memberNeedsStamp) return;
  const next: Me = { ...me, ...(userId ? { userId } : {}) };
  if (!userId) delete next.userId;
  localStorage.setItem(K_ME, JSON.stringify(next));
  if (c) {
    const m = c.members.find((x) => x.userTag === me.userTag);
    if (m) {
      if (userId) m.userId = userId;
      else delete m.userId;
      save(c);
      return;
    }
  }
  emit();
}

// -------- Council Storage --------
export function getCouncil(): Council | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(K_COUNCIL);
    return raw ? (JSON.parse(raw) as Council) : null;
  } catch {
    return null;
  }
}

function save(c: Council | null) {
  if (typeof window === "undefined") return;
  if (c === null) localStorage.removeItem(K_COUNCIL);
  else localStorage.setItem(K_COUNCIL, JSON.stringify(c));
  emit();
}

// Rebuild the local council session from Supabase — the database wins.
// Called when the council screen opens so multi-device state stays honest.
export async function refreshCouncilFromSupabase(): Promise<Council | null> {
  if (typeof window === "undefined") return null;
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    alertCouncilFailure("Sync council", authError);
    return getCouncil();
  }
  if (!user) return null;
  try {
    const { data: seat, error: seatError } = await supabase
      .from("council_members").select("council_id")
      .eq("user_id", user.id).maybeSingle();
    if (seatError) throw seatError;
    if (!seat) {
      if (getCouncil()) save(null); // stale local cache — the database has no membership
      return null;
    }
    const { data: dbCouncil, error: councilError } = await supabase
      .from("councils").select("id, council_tag, name, created_at")
      .eq("id", seat.council_id).maybeSingle();
    if (councilError) throw councilError;
    if (!dbCouncil) {
      if (getCouncil()) save(null);
      return null;
    }
    const { data: memberRows, error: membersError } = await supabase
      .from("council_members")
      .select("user_id, user_tag, name, is_leader, daily_stats, created_at")
      .eq("council_id", dbCouncil.id)
      .order("created_at");
    if (membersError) throw membersError;

    const prior = getCouncil();
    const sameCouncil = prior?.id === dbCouncil.id ? prior : null;
    const members: Member[] = (memberRows ?? []).map((row) => {
      const prev = sameCouncil?.members.find((m) => m.userTag === row.user_tag);
      const daily = { ...defaultDaily(), ...(row.daily_stats ?? {}) as Partial<MemberDailyStats> };
      const joinedAt = new Date(row.created_at).getTime();
      return {
        userTag: row.user_tag,
        userId: row.user_id,
        name: row.name,
        joinedAt: Number.isFinite(joinedAt) ? joinedAt : (prev?.joinedAt ?? Date.now()),
        isLeader: row.is_leader,
        productivityRank: prev?.productivityRank ?? 1,
        daily,
        ...(prev?.warlordUntil ? { warlordUntil: prev.warlordUntil } : {}),
      };
    });

    const priorCreatedAt = sameCouncil?.createdAt ?? 0;
    const remoteCreatedAt = new Date(dbCouncil.created_at).getTime();
    const refreshed: Council = {
      id: dbCouncil.id,
      councilTag: dbCouncil.council_tag,
      name: dbCouncil.name,
      createdAt: Number.isFinite(remoteCreatedAt) && remoteCreatedAt > 0 ? remoteCreatedAt : priorCreatedAt || Date.now(),
      members,
      chat: sameCouncil?.chat ?? [
        {
          id: "sys-" + Date.now(),
          memberTag: "#SYSTEM",
          kind: "text",
          body: `Council synced from the database. Tag: ${dbCouncil.council_tag}`,
          at: Date.now(),
        },
      ],
      mockLedger: sameCouncil?.mockLedger ?? [],
      votes: sameCouncil?.votes ?? [],
      ...(sameCouncil?.weeklyWinners ? { weeklyWinners: sameCouncil.weeklyWinners } : {}),
      ...(sameCouncil?.wallOfHonor ? { wallOfHonor: sameCouncil.wallOfHonor } : {}),
    };
    recomputeRanks(refreshed);
    save(refreshed);
    return refreshed;
  } catch (error) {
    alertCouncilFailure("Sync council", error);
    return getCouncil();
  }
}

function defaultDaily(): MemberDailyStats {
  return {
    wakeUpAt: null,
    focusMinutes: 0,
    tasksDone: 0,
    tasksTotal: 0,
    revisionCoresCleared: 0,
    chapterCores: {},
    coreLoops: {},
    tier: "Recruit",
    characterRank: "Cadet",
  };
}

const TIERS = ["Recruit", "Squire", "Knight", "Warlord", "Sovereign"];
const CHAR_RANKS = [
  "Cadet",
  "Corporal",
  "Sergeant",
  "Lieutenant",
  "Captain",
  "Major",
  "Colonel",
  "Commander",
  "Brigadier",
  "General",
  "High General",
  "Warlord",
  "Overlord",
  "Sovereign",
  "Field Marshal",
];

export function deriveProgression(daily: Pick<MemberDailyStats, "focusMinutes" | "tasksDone" | "revisionCoresCleared">) {
  const score = daily.focusMinutes + daily.tasksDone * 30 + daily.revisionCoresCleared * 45;
  const rankIdx = Math.min(CHAR_RANKS.length - 1, Math.floor(score / 60));
  const tierIdx = Math.min(TIERS.length - 1, Math.floor(rankIdx / 3));
  return { tier: TIERS[tierIdx], characterRank: CHAR_RANKS[rankIdx] };
}

function recomputeRanks(c: Council) {
  const sorted = [...c.members].sort((a, b) => {
    const sa = a.daily.focusMinutes + a.daily.tasksDone * 30 + (a.daily.ghostsDone ?? 0) * 15;
    const sb = b.daily.focusMinutes + b.daily.tasksDone * 30 + (b.daily.ghostsDone ?? 0) * 15;
    return sb - sa;
  });
  sorted.forEach((m, i) => {
    const t = c.members.find((x) => x.userTag === m.userTag);
    if (t) t.productivityRank = i + 1;
  });
}

// -------- SUPABASE MULTIPLAYER CONNECTORS --------

export async function forgeCouncil(name: string): Promise<Council | null> {
  const me = getMe();
  const councilTag = makeCouncilTag();
  const councilName = name.trim() || "The War Council";

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    alertCouncilFailure("Forge council", authError);
    return null;
  }
  if (!user) {
    toast.error("Sign in required", { description: "Create a free account to forge a council." });
    return null;
  }

  let dbCouncilId: string;
  try {
    const { data: dbCouncil, error: insertError } = await supabase
      .from("councils")
      .insert([{ council_tag: councilTag, name: councilName, created_by: user.id }])
      .select("id, council_tag, name")
      .single();
    if (insertError) throw insertError;
    if (!dbCouncil) throw new Error("Council creation returned no record.");

    const { error: memberError } = await supabase.from("council_members").insert([{
      council_id: dbCouncil.id, user_id: user.id, user_tag: me.userTag,
      name: me.name, is_leader: true, daily_stats: defaultDaily(),
    }]);
    if (memberError) throw memberError;
    dbCouncilId = dbCouncil.id;
  } catch (error) {
    alertCouncilFailure("Forge council", error);
    return null;
  }

  const c: Council = {
    id: dbCouncilId,
    councilTag,
    name: councilName,
    createdAt: Date.now(),
    members: [
      {
        userTag: me.userTag,
        userId: user.id,
        name: me.name,
        joinedAt: Date.now(),
        isLeader: true,
        productivityRank: 1,
        daily: defaultDaily(),
      },
    ],
    chat: [
      {
        id: "sys-" + Date.now(),
        memberTag: "#SYSTEM",
        kind: "text",
        body: `Council forged. Share your Council Tag (${councilTag}) with real-life allies.`,
        at: Date.now(),
      },
    ],
    mockLedger: [],
    votes: [],
  };

  save(c);
  return c;
}

export async function joinCouncilByTag(tag: string): Promise<{ ok: boolean; error?: string }> {
  const clean = tag.trim().toUpperCase();
  const formattedTag = clean.startsWith("#") ? clean : `#${clean}`;
  const me = getMe();

  let userId: string | undefined;
  let targetCouncilId: string | null = null;
  let targetCouncilTag = formattedTag;
  let targetCouncilName = "War Council";

  await safelySync("Find council", async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    userId = user?.id;
    const { data: matchedCouncil, error: lookupError } = await councilDb
      .from("councils").select("id, council_tag, name")
      .ilike("council_tag", formattedTag).maybeSingle();
    if (lookupError) throw lookupError;
    if (matchedCouncil) {
      targetCouncilId = matchedCouncil.id;
      targetCouncilTag = matchedCouncil.council_tag;
      targetCouncilName = matchedCouncil.name;
      return;
    }
    const { data: memberMatch, error: memberError } = await councilDb
      .from("council_members").select("council_id")
      .ilike("user_tag", formattedTag).maybeSingle();
    if (memberError) throw memberError;
    if (!memberMatch) return;
    const { data: parentCouncil, error: parentError } = await councilDb
      .from("councils").select("id, council_tag, name")
      .eq("id", memberMatch.council_id).maybeSingle();
    if (parentError) throw parentError;
    if (parentCouncil) {
      targetCouncilId = parentCouncil.id;
      targetCouncilTag = parentCouncil.council_tag;
      targetCouncilName = parentCouncil.name;
    }
  });

  // 2. Fallback to Local Storage check if Supabase didn't match
  if (!targetCouncilId) {
    const localC = getCouncil();
    if (
      localC &&
      (localC.councilTag.toUpperCase() === formattedTag ||
        localC.members.some((m) => m.userTag.toUpperCase() === formattedTag))
    ) {
      if (localC.members.some((m) => m.userTag === me.userTag)) {
        return { ok: false, error: "You are already a member of this council." };
      }
      if (localC.members.length >= MAX) {
        return { ok: false, error: "Council is full (Maximum 5 seats occupied)." };
      }

      localC.members.push({
        userTag: me.userTag,
        ...(userId ? { userId } : {}),
        name: me.name,
        joinedAt: Date.now(),
        isLeader: false,
        productivityRank: localC.members.length + 1,
        daily: defaultDaily(),
      });

      recomputeRanks(localC);
      save(localC);
      return { ok: true };
    }

    return { ok: false, error: "No active council found with that tag." };
  }

  let memberCount = 0;
  let joinError: string | undefined;
  const councilId = targetCouncilId;
  await safelySync("Join council", async () => {
    const { data: currentMembers, error: membersError } = await councilDb
      .from("council_members").select("user_id, user_tag")
      .eq("council_id", councilId);
    if (membersError) throw membersError;
    memberCount = currentMembers?.length ?? 0;
    if (memberCount >= MAX) {
      joinError = "Council is full (Maximum 5 seats occupied).";
      return;
    }
    if (currentMembers?.some((m) => m.user_tag === me.userTag || (userId && m.user_id === userId))) {
      joinError = "You are already a member of this council.";
      return;
    }
    if (!userId) return;
    const { error: insertError } = await councilDb.from("council_members").insert([{
      council_id: councilId, user_id: userId, user_tag: me.userTag,
      name: me.name, is_leader: false, daily_stats: defaultDaily(),
    }]);
    if (insertError) throw insertError;
  });
  if (joinError) return { ok: false, error: joinError };

  // Hydrate local session
  const newMember: Member = {
    userTag: me.userTag,
    ...(userId ? { userId } : {}),
    name: me.name,
    joinedAt: Date.now(),
    isLeader: false,
    productivityRank: memberCount + 1,
    daily: defaultDaily(),
  };

  const joinedCouncil: Council = {
    id: targetCouncilId,
    councilTag: targetCouncilTag,
    name: targetCouncilName,
    createdAt: Date.now(),
    members: [newMember],
    chat: [
      {
        id: "sys-" + Date.now(),
        memberTag: "#SYSTEM",
        kind: "text",
        body: `${me.name} (${me.userTag}) joined the War Council!`,
        at: Date.now(),
      },
    ],
    mockLedger: [],
    votes: [],
  };

  save(joinedCouncil);
  return { ok: true };
}

export function leaveCouncil() {
  const c = getCouncil();
  // Clear immediately, even when authentication or the remote delete fails.
  save(null);
  const councilId = c?.id;
  if (!councilId) return;
  void safelySync("Leave council", async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) return;
    const { error } = await councilDb.from("council_members").delete()
      .eq("council_id", councilId).eq("user_id", user.id);
    if (error) throw error;
  });
}

export function dissolveCouncil() {
  const c = getCouncil();
  save(null);
  const councilId = c?.id;
  if (!councilId) return;
  void safelySync("Dissolve council", async () => {
    const { error } = await councilDb.from("councils").delete().eq("id", councilId);
    if (error) throw error;
  });
}

// -------- Chat --------
export function sendChat(text: string) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  const t = text.trim();
  if (!t) return;
  c.chat.push({
    id: "m-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    memberTag: me.userTag,
    kind: "text",
    body: t,
    at: Date.now(),
  });
  save(c);
}

export type ImageCheck = { ok: true; dataUrl: string } | { ok: false; error: string };

export async function processAcademicImage(file: File): Promise<ImageCheck> {
  if (!file.type.startsWith("image/"))
    return { ok: false, error: "Only image files are allowed." };
  if (file.size > 400 * 1024)
    return {
      ok: false,
      error: "Image too large (limit 400 KB). Compress or crop to the diagram only.",
    };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { ok: false, error: "Could not read image." };

  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "Canvas unavailable." };
  ctx.drawImage(bitmap, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let vividCount = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 4 * 50) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat > 0.35 && max > 60) vividCount++;
    samples++;
  }
  const vividRatio = samples ? vividCount / samples : 0;
  if (vividRatio > 0.12) {
    return {
      ok: false,
      error: "Only clear, high-contrast academic diagrams or proofs are allowed.",
    };
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    y = Math.max(0, Math.min(255, (y - 150) * 1.9 + 200));
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  if (dataUrl.length > 350 * 1024 * 1.4)
    return { ok: false, error: "Processed image still too large. Crop tighter." };
  return { ok: true, dataUrl };
}

export function sendImage(dataUrl: string) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  c.chat.push({
    id: "i-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    memberTag: me.userTag,
    kind: "image",
    body: dataUrl,
    at: Date.now(),
  });
  save(c);
}

// -------- Mock ledger --------
export function logMockScore(input: { examName: string; score: number; scoreMax: number }) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  c.mockLedger.push({
    id: "mk-" + Date.now(),
    memberTag: me.userTag,
    examName: input.examName.trim() || "Mock",
    score: Math.max(0, Math.floor(input.score)),
    scoreMax: Math.max(1, Math.floor(input.scoreMax)),
    loggedAt: Date.now(),
  });
  save(c);
}

// -------- Vote to exile --------
export function castExileVote(targetTag: string, down: boolean) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  if (targetTag === me.userTag) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  c.votes = c.votes.filter(
    (v) => !(v.voterTag === me.userTag && v.targetTag === targetTag) && v.at >= cutoff,
  );
  c.votes.push({ targetTag, voterTag: me.userTag, down, at: Date.now() });
  const others = c.members.filter((m) => m.userTag !== targetTag);
  const downs = c.votes.filter(
    (v) => v.targetTag === targetTag && v.down && v.at >= cutoff,
  ).length;
  if (others.length >= 4 && downs >= 3) {
    c.members = c.members.filter((m) => m.userTag !== targetTag);
    c.chat = c.chat.filter((m) => m.memberTag !== targetTag);
    c.mockLedger = c.mockLedger.filter((m) => m.memberTag !== targetTag);
    c.votes = c.votes.filter((v) => v.targetTag !== targetTag && v.voterTag !== targetTag);
    c.chat.push({
      id: "sys-" + Date.now(),
      memberTag: "#SYSTEM",
      kind: "text",
      body: `${targetTag} was exiled by council vote. Data purged. Slot open.`,
      at: Date.now(),
    });
  }
  save(c);
}

export function activeDownVotes(targetTag: string): number {
  const c = getCouncil();
  if (!c) return 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return c.votes.filter((v) => v.targetTag === targetTag && v.down && v.at >= cutoff).length;
}

// -------- Warlord & Overlord Crowning --------
export function maybeCrownWarlord() {
  const c = getCouncil();
  if (!c || c.members.length === 0) return;
  const now = new Date();
  const sun = new Date(now);
  const day = sun.getDay();
  sun.setHours(0, 0, 0, 0);
  sun.setDate(sun.getDate() - day);
  if (c.lastWarlordAt && c.lastWarlordAt >= sun.getTime()) return;
  const winner = [...c.members].sort((a, b) => {
    const sa = a.daily.focusMinutes * 2 + a.daily.tasksDone * 10 + (a.daily.ghostsDone ?? 0) * 15;
    const sb = b.daily.focusMinutes * 2 + b.daily.tasksDone * 10 + (b.daily.ghostsDone ?? 0) * 15;
    return sb - sa;
  })[0];
  c.members.forEach((m) => (m.warlordUntil = undefined));
  winner.warlordUntil = sun.getTime() + 7 * 24 * 60 * 60 * 1000;
  c.lastWarlordAt = Date.now();
  c.chat.push({
    id: "sys-" + Date.now(),
    memberTag: "#SYSTEM",
    kind: "text",
    body: `👑 ${winner.name} (${winner.userTag}) is this week's Council Warlord.`,
    at: Date.now(),
  });
  save(c);
}

// -------- Self stats (current user) --------
export function updateMyDaily(patch: Partial<MemberDailyStats>) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  const m = c.members.find((x) => x.userTag === me.userTag);
  if (!m) return;
  m.daily = { ...m.daily, ...patch, ...deriveProgression({ ...m.daily, ...patch }) };
  recomputeRanks(c);

  save(c);
  const councilId = c.id;
  if (councilId) {
    void safelySync("Update daily stats", async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return;
      const { error } = await councilDb.from("council_members")
        .update({ daily_stats: m.daily }).eq("council_id", councilId).eq("user_id", user.id);
      if (error) throw error;
    });
  }
}

export const MAX_MEMBERS = MAX;
