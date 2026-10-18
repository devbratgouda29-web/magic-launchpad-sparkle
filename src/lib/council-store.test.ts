import { beforeEach, describe, expect, mock, test } from "bun:test";

const remoteError = new Error("Table missing from schema cache");
let authFails = false;
let results: unknown[] = [];
let throws = false;
const query = () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["insert", "select", "single", "maybeSingle", "eq", "ilike", "delete", "update"])
    builder[method] = () => builder;
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    (throws ? Promise.reject(remoteError) : Promise.resolve(results.shift() ?? { data: null, error: remoteError })).then(resolve, reject);
  return builder;
};
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => {
      if (authFails) throw remoteError;
      return { data: { user: { id: "user-1" } }, error: null };
    } },
    from: query,
  },
}));
const store = await import("./council-store");
const memory = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  },
});
beforeEach(() => { memory.clear(); authFails = false; throws = false; results = []; });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function seedRemoteCouncil() {
  const council = await store.forgeCouncil("Friends");
  council.id = "council-1";
  memory.set("ftlb.council.v1", JSON.stringify(council));
  return council;
}

describe("Council database failure recovery", () => {
  test("forge keeps local council when authentication throws", async () => {
    authFails = true;
    const council = await store.forgeCouncil("Allies");
    expect(store.getCouncil()?.councilTag).toBe(council.councilTag);
    expect(council.members).toHaveLength(1);
  });
  test("forge keeps local council on returned schema errors", async () => {
    await store.forgeCouncil("Allies");
    expect(store.getCouncil()?.name).toBe("Allies");
  });
  test("local join succeeds when remote queries throw", async () => {
    const council = await store.forgeCouncil("Allies");
    memory.set("ftlb.council.me.v1", JSON.stringify({ userTag: "#USR-NEW1", name: "New ally" }));
    throws = true;
    expect(await store.joinCouncilByTag(council.councilTag)).toEqual({ ok: true });
    expect(store.getCouncil()?.members).toHaveLength(2);
  });
  test("remote match still joins locally when member query fails", async () => {
    results = [{ data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends" }, error: null }];
    expect(await store.joinCouncilByTag("CNL-ABCD")).toEqual({ ok: true });
    expect(store.getCouncil()?.id).toBe("council-2");
  });
  test("unknown council returns a safe error without inventing membership", async () => {
    throws = true;
    expect((await store.joinCouncilByTag("CNL-NONE")).ok).toBe(false);
    expect(store.getCouncil()).toBeNull();
  });
  test("leave clears immediately even if authentication throws", async () => {
    await seedRemoteCouncil();
    authFails = true;
    store.leaveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
  });
  test("leave awaits deletion and handles returned or thrown errors", async () => {
    for (const failure of [false, true]) {
      await seedRemoteCouncil();
      throws = failure;
      store.leaveCouncil();
      expect(store.getCouncil()).toBeNull();
      await flush();
      expect(store.getCouncil()).toBeNull();
    }
  });
  test("dissolve clears locally despite rejected deletion", async () => {
    await seedRemoteCouncil();
    throws = true;
    store.dissolveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
  });
  test("daily updates remain saved when remote synchronization fails", async () => {
    await seedRemoteCouncil();
    throws = true;
    store.updateMyDaily({ tasksDone: 1, tasksTotal: 3 });
    await flush();
    expect(store.getCouncil()?.members[0].daily.tasksDone).toBe(1);
    expect(store.getCouncil()?.members[0].daily.tasksTotal).toBe(3);
  });
});