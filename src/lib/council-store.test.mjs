import { beforeEach, describe, expect, mock, test } from "bun:test";

// War Council store — Supabase is the PRIMARY source of truth.
// Every remote failure surfaces as a thrown error / returned error (never a
// silent fallback), while leave/dissolve always clear the local session.

const remoteError = Error("Table missing from schema cache");
let authFails = false;
let signedOut = false;
let throws = false;
let results = [];
const calls = [];

const query = (table) => {
  const builder = {
    table,
    action: "select",
    payload: null,
    filters: [],
    insert(p) { this.payload = p; this.action = "insert"; return this; },
    update(p) { this.payload = p; this.action = "update"; return this; },
    delete() { this.action = "delete"; return this; },
    select() { return this; },
    single() { return this; },
    maybeSingle() { return this; },
    eq(col, val) { this.filters.push(["eq", col, val]); return this; },
    ilike(col, val) { this.filters.push(["ilike", col, val]); return this; },
    order() { return this; },
    then(resolve, reject) {
      calls.push({
        table: this.table,
        action: this.action,
        payload: this.payload,
        filters: this.filters,
      });
      const outcome = throws
        ? Promise.reject(remoteError)
        : Promise.resolve(results.shift() ?? { data: null, error: remoteError });
      return outcome.then(resolve, reject);
    },
  };
  return builder;
};

mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => {
        if (authFails) throw remoteError;
        if (signedOut) return { data: { user: null }, error: null };
        return { data: { user: { id: "user-1" } }, error: null };
      },
    },
    from: (table) => query(table),
  },
}));

const store = await import("./council-store");

const memory = new Map;
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  },
});

beforeEach(() => {
  memory.clear();
  authFails = false;
  signedOut = false;
  throws = false;
  results = [];
  calls.length = 0;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function seedLocalCouncil() {
  const council = {
    id: "council-1",
    councilTag: "#CNL-TEST",
    name: "Friends",
    createdAt: Date.now(),
    members: [{
      userTag: "#USR-ME1",
      userId: "user-1",
      name: "You",
      joinedAt: Date.now(),
      isLeader: true,
      productivityRank: 1,
      daily: {
        wakeUpAt: null,
        focusMinutes: 0,
        tasksDone: 0,
        tasksTotal: 0,
        revisionCoresCleared: 0,
        chapterCores: {},
        tier: "Recruit",
        characterRank: "Cadet",
      },
    }],
    chat: [],
    mockLedger: [],
    votes: [],
  };
  memory.set("ftlb.council.me.v1", JSON.stringify({ userTag: "#USR-ME1", name: "You", userId: "user-1" }));
  memory.set("ftlb.council.v1", JSON.stringify(council));
  return council;
}

describe("forgeCouncil (Supabase primary)", () => {
  test("inserts the council and leader seat into Supabase and stores the session locally", async () => {
    results = [
      { data: { id: "council-1", council_tag: "#CNL-ABCD", name: "Allies" }, error: null },
      { data: null, error: null },
    ];
    const council = await store.forgeCouncil("Allies");
    expect(council?.councilTag).toBe("#CNL-ABCD");
    expect(council?.members).toHaveLength(1);
    expect(council?.members[0].isLeader).toBe(true);
    expect(store.getCouncil()?.councilTag).toBe("#CNL-ABCD");
    expect(calls[0]).toEqual({ table: "councils", action: "insert", filters: [], payload: [expect.objectContaining({ name: "Allies", created_by: "user-1" })] });
    expect(calls[1]).toEqual({ table: "council_members", action: "insert", filters: [], payload: [expect.objectContaining({ council_id: "council-1", user_id: "user-1", is_leader: true })] });
  });

  test("returns null and leaves no local session when the database insert fails", async () => {
    const council = await store.forgeCouncil("Allies");
    expect(council).toBeNull();
    expect(store.getCouncil()).toBeNull();
    expect(calls[0].table).toBe("councils");
    expect(calls[0].action).toBe("insert");
  });

  test("requires a signed-in user", async () => {
    signedOut = true;
    expect(await store.forgeCouncil("Allies")).toBeNull();
    expect(store.getCouncil()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("surfaces authentication failures instead of hiding them", async () => {
    authFails = true;
    expect(await store.forgeCouncil("Allies")).toBeNull();
    expect(store.getCouncil()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("joinCouncilByTag (Supabase primary)", () => {
  test("joins by council tag with a case-insensitive lookup and hydrates the roster", async () => {
    const iso = new Date().toISOString();
    results = [
      { data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends" }, error: null },
      { data: [{ user_id: "ally-1", user_tag: "#USR-ALL1" }], error: null },
      { data: null, error: null },
      { data: { council_id: "council-2" }, error: null },
      { data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends", created_at: iso }, error: null },
      { data: [{ user_id: "user-1", user_tag: "#USR-ME1", name: "You", is_leader: false, daily_stats: {}, created_at: iso }], error: null },
    ];
    expect(await store.joinCouncilByTag("cnl-abcd")).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ table: "councils", action: "select", filters: [["ilike", "council_tag", "#CNL-ABCD"]] });
    expect(calls[2]).toMatchObject({ table: "council_members", action: "insert", payload: [expect.objectContaining({ council_id: "council-2", user_id: "user-1" })] });
    const council = store.getCouncil();
    expect(council?.id).toBe("council-2");
    expect(council?.members).toHaveLength(1);
  });

  test("rejects a full council without inserting a seat", async () => {
    results = [
      { data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends" }, error: null },
      { data: Array.from({ length: 5 }, (_, i) => ({ user_id: `u${i}`, user_tag: `#U${i}` })), error: null },
    ];
    expect(await store.joinCouncilByTag("CNL-ABCD")).toEqual({ ok: false, error: "Council is full (Maximum 5 seats occupied)." });
    expect(calls).toHaveLength(2);
    expect(store.getCouncil()).toBeNull();
  });

  test("rejects joining a council the user is already in", async () => {
    results = [
      { data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends" }, error: null },
      { data: [{ user_id: "user-1", user_tag: "#USR-ME1" }], error: null },
    ];
    expect(await store.joinCouncilByTag("CNL-ABCD")).toEqual({ ok: false, error: "You are already a member of this council." });
    expect(calls).toHaveLength(2);
    expect(store.getCouncil()).toBeNull();
  });

  test("unknown tag returns a safe error without inventing membership", async () => {
    results = [{ data: null, error: null }, { data: null, error: null }];
    expect(await store.joinCouncilByTag("CNL-NONE")).toEqual({ ok: false, error: "No active council found with that tag." });
    expect(store.getCouncil()).toBeNull();
  });

  test("database failures surface as errors instead of a fake local join", async () => {
    throws = true;
    const outcome = await store.joinCouncilByTag("CNL-ABCD");
    expect(outcome.ok).toBe(false);
    expect(store.getCouncil()).toBeNull();
  });

  test("requires a signed-in user", async () => {
    signedOut = true;
    expect((await store.joinCouncilByTag("CNL-ABCD")).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("refreshCouncilFromSupabase", () => {
  test("rebuilds the local session from the database membership", async () => {
    const iso = new Date().toISOString();
    results = [
      { data: { council_id: "council-2" }, error: null },
      { data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends", created_at: iso }, error: null },
      { data: [
        { user_id: "user-1", user_tag: "#USR-ME1", name: "You", is_leader: true, daily_stats: { focusMinutes: 30 }, created_at: iso },
        { user_id: "ally-1", user_tag: "#USR-ALL1", name: "Ally", is_leader: false, daily_stats: { focusMinutes: 90 }, created_at: iso },
      ], error: null },
    ];
    const council = await store.refreshCouncilFromSupabase();
    expect(council?.councilTag).toBe("#CNL-ABCD");
    expect(council?.members).toHaveLength(2);
    expect(council?.members[1].productivityRank).toBe(1);
    expect(store.getCouncil()?.members[1].name).toBe("Ally");
  });

  test("clears a stale local cache when the database has no membership", async () => {
    seedLocalCouncil();
    results = [{ data: null, error: null }];
    expect(await store.refreshCouncilFromSupabase()).toBeNull();
    expect(store.getCouncil()).toBeNull();
  });

  test("falls back to the local cache on failure without clearing it", async () => {
    seedLocalCouncil();
    throws = true;
    expect(await store.refreshCouncilFromSupabase()?.councilTag).toBeUndefined();
    expect(store.getCouncil()?.councilTag).toBe("#CNL-TEST");
  });
});

describe("leaveCouncil", () => {
  test("clears the local seat immediately, then deletes it in Supabase", async () => {
    seedLocalCouncil();
    results = [{ data: null, error: null }];
    store.leaveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
    expect(calls).toEqual([{
      table: "council_members",
      action: "delete",
      payload: null,
      filters: [["eq", "council_id", "council-1"], ["eq", "user_id", "user-1"]],
    }]);
  });

  test("still clears the local seat when authentication throws", async () => {
    seedLocalCouncil();
    authFails = true;
    store.leaveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("still clears the local seat when the database delete fails", async () => {
    seedLocalCouncil();
    store.leaveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
  });

  test("is a no-op without a local council", () => {
    store.leaveCouncil();
    expect(store.getCouncil()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("dissolveCouncil", () => {
  test("clears the local session immediately, then deletes the council row", async () => {
    seedLocalCouncil();
    results = [{ data: null, error: null }];
    store.dissolveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
    expect(calls).toEqual([{
      table: "councils",
      action: "delete",
      payload: null,
      filters: [["eq", "id", "council-1"]],
    }]);
  });

  test("still clears the local session despite a rejected delete", async () => {
    seedLocalCouncil();
    throws = true;
    store.dissolveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
  });
});

describe("updateMyDaily", () => {
  test("saves locally and syncs daily_stats to the member seat", async () => {
    seedLocalCouncil();
    results = [{ data: null, error: null }];
    store.updateMyDaily({ tasksDone: 1, tasksTotal: 3 });
    await flush();
    const member = store.getCouncil()?.members[0];
    expect(member?.daily.tasksDone).toBe(1);
    expect(member?.daily.tasksTotal).toBe(3);
    expect(calls).toEqual([{
      table: "council_members",
      action: "update",
      payload: expect.objectContaining({ tasksDone: 1, tasksTotal: 3 }),
      filters: [["eq", "council_id", "council-1"], ["eq", "user_id", "user-1"]],
    }]);
  });

  test("keeps local stats when the remote sync fails", async () => {
    seedLocalCouncil();
    throws = true;
    store.updateMyDaily({ tasksDone: 1, tasksTotal: 3 });
    await flush();
    const member = store.getCouncil()?.members[0];
    expect(member?.daily.tasksDone).toBe(1);
    expect(member?.daily.tasksTotal).toBe(3);
  });

  test("does nothing without a local council", () => {
    store.updateMyDaily({ tasksDone: 1 });
    expect(store.getCouncil()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
