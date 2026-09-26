import { supabase } from "@/integrations/supabase/client";

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
    const t = c.members.find((x) => x.userTag === m.userTag)!;
    t.productivityRank = i + 1;
  });
}

// -------- SUPABASE MULTIPLAYER CONNECTORS --------

export async function forgeCouncil(name: string): Promise<Council> {
  const me = getMe();
  const councilTag = makeCouncilTag();
  const councilName = name.trim() || "The War Council";

  const { data: { user } } = await supabase.auth.getUser();

  // Create locally
  const c: Council = {
    councilTag,
    name: councilName,
    createdAt: Date.now(),
    members: [
      {
        userTag: me.userTag,
        ...(user?.id ? { userId: user.id } : {}),
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
        body: `Council forged. Share your Council Tag or Player Tag with real-life allies.`,
        at: Date.now(),
      },
    ],
    mockLedger: [],
    votes: [],
  };

  // Sync to Remote Database
  if (user) {
    const { data: dbCouncil } = await supabase
      .from("councils")
      .insert([{ council_tag: councilTag, name: councilName, created_by: user.id }])
      .select()
      .single();

    if (dbCouncil) {
      c.id = dbCouncil.id;
      await supabase.from("council_members").insert([
        {
          council_id: dbCouncil.id,
          user_id: user.id,
          user_tag: me.userTag,
          name: me.name,
          is_leader: true,
          daily_stats: defaultDaily(),
        },
      ]);
    }
  }

  save(c);
  return c;
}

export async function joinCouncilByTag(tag: string): Promise<{ ok: boolean; error?: string }> {
  const clean = tag.trim().toUpperCase();
  const formattedTag = clean.startsWith("#") ? clean : `#${clean}`;
  const me = getMe();

  const { data: { user } } = await supabase.auth.getUser();

  // 1. Check Supabase Remote Database
  let targetCouncilId: string | null = null;
  let targetCouncilTag: string = formattedTag;
  let targetCouncilName: string = "War Council";

  const { data: matchedCouncil } = await supabase
    .from("councils")
    .select("id, council_tag, name")
    .eq("council_tag", formattedTag)
    .maybeSingle();

  if (matchedCouncil) {
    targetCouncilId = matchedCouncil.id;
    targetCouncilTag = matchedCouncil.council_tag;
    targetCouncilName = matchedCouncil.name;
  } else {
    // Search by member tag
    const { data: memberMatch } = await supabase
      .from("council_members")
      .select("council_id")
      .eq("user_tag", formattedTag)
      .maybeSingle();

    if (memberMatch) {
      const { data: parentCouncil } = await supabase
        .from("councils")
        .select("id, council_tag, name")
        .eq("id", memberMatch.council_id)
        .maybeSingle();

      if (parentCouncil) {
        targetCouncilId = parentCouncil.id;
        targetCouncilTag = parentCouncil.council_tag;
        targetCouncilName = parentCouncil.name;
      }
    }
  }

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
        ...(user?.id ? { userId: user.id } : {}),
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

  // Check seat limit on Supabase
  const { data: currentMembers } = await supabase
    .from("council_members")
    .select("user_id, user_tag")
    .eq("council_id", targetCouncilId);

  if (currentMembers && currentMembers.length >= MAX) {
    return { ok: false, error: "Council is full (Maximum 5 seats occupied)." };
  }

  if (currentMembers?.some((m) => m.user_tag === me.userTag || (user && m.user_id === user.id))) {
    return { ok: false, error: "You are already a member of this council." };
  }

  // Join in Supabase
  if (user) {
    await supabase.from("council_members").insert([
      {
        council_id: targetCouncilId,
        user_id: user.id,
        user_tag: me.userTag,
        name: me.name,
        is_leader: false,
        daily_stats: defaultDaily(),
      },
    ]);
  }

  // Hydrate local session
  const newMember: Member = {
    userTag: me.userTag,
    ...(user?.id ? { userId: user.id } : {}),
    name: me.name,
    joinedAt: Date.now(),
    isLeader: false,
    productivityRank: (currentMembers?.length || 0) + 1,
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
  const me = getMe();
  const c = getCouncil();
  if (!c) return;

  if (c.id) {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("council_members").delete().eq("council_id", c.id).eq("user_id", user.id);
      }
    });
  }

  c.members = c.members.filter((m) => m.userTag !== me.userTag);
  if (c.members.length === 0) {
    save(null);
    return;
  }
  if (!c.members.some((m) => m.isLeader)) c.members[0].isLeader = true;
  save(c);
}

export function dissolveCouncil() {
  const c = getCouncil();
  if (c?.id) {
    supabase.from("councils").delete().eq("id", c.id);
  }
  save(null);
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

  if (c.id) {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("council_members")
          .update({ daily_stats: m.daily })
          .eq("council_id", c.id)
          .eq("user_id", user.id);
      }
    });
  }

  save(c);
}

export const MAX_MEMBERS = MAX;
