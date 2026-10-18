import { beforeEach, describe, expect, mock, test } from "bun:test";
const remoteError = Error("Table missing from schema cache");
let authFails = !1, results = [], throws = !1;
const query = () => {
  const builder = {};
  for (const method of ["insert", "select", "single", "maybeSingle", "eq", "ilike", "delete", "update"])
    builder[method] = () => builder;
  builder.then = (resolve, reject) => (throws ? Promise.reject(remoteError) : Promise.resolve(results.shift() ?? { data: null, error: remoteError })).then(resolve, reject);
  return builder;
};
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => {
      if (authFails)
        throw remoteError;
      return { data: { user: { id: "user-1" } }, error: null };
    } },
    from: query
  }
}));
const store = await import("./council-store"), memory = new Map;
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
  }
});
beforeEach(() => {
  memory.clear();
  authFails = !1;
  throws = !1;
  results = [];
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function seedRemoteCouncil() {
  const council = await store.forgeCouncil("Friends");
  council.id = "council-1";
  memory.set("ftlb.council.v1", JSON.stringify(council));
  return council;
}
describe("Council database failure recovery", () => {
  test("forge keeps local council when authentication throws", async () => {
    authFails = !0;
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
    throws = !0;
    expect(await store.joinCouncilByTag(council.councilTag)).toEqual({ ok: !0 });
    expect(store.getCouncil()?.members).toHaveLength(2);
  });
  test("remote match still joins locally when member query fails", async () => {
    results = [{ data: { id: "council-2", council_tag: "#CNL-ABCD", name: "Friends" }, error: null }];
    expect(await store.joinCouncilByTag("CNL-ABCD")).toEqual({ ok: !0 });
    expect(store.getCouncil()?.id).toBe("council-2");
  });
  test("unknown council returns a safe error without inventing membership", async () => {
    throws = !0;
    expect((await store.joinCouncilByTag("CNL-NONE")).ok).toBe(!1);
    expect(store.getCouncil()).toBeNull();
  });
  test("leave clears immediately even if authentication throws", async () => {
    await seedRemoteCouncil();
    authFails = !0;
    store.leaveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
    expect(store.getCouncil()).toBeNull();
  });
  test("leave awaits deletion and handles returned or thrown errors", async () => {
    for (const failure of [!1, !0]) {
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
    throws = !0;
    store.dissolveCouncil();
    expect(store.getCouncil()).toBeNull();
    await flush();
  });
  test("daily updates remain saved when remote synchronization fails", async () => {
    await seedRemoteCouncil();
    throws = !0;
    store.updateMyDaily({ tasksDone: 1, tasksTotal: 3 });
    await flush();
    expect(store.getCouncil()?.members[0].daily.tasksDone).toBe(1);
    expect(store.getCouncil()?.members[0].daily.tasksTotal).toBe(3);
  });
});
