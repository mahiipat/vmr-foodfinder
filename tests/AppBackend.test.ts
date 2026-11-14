import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import type { GroupData, RoomState } from "../backend/AppBackend";
import { backendFixture } from "./backend-fixture.ts";

async function setup(strategy: "random" | "runoff" = "random") {
  const f = backendFixture();
  const { roomId } = await f.backend.createGroup({ groupName: "Dinner", location: "Atlanta", tieStrategy: strategy });
  await f.backend.joinGroup(roomId, "One");
  const asMember = (uid: string) => { f.auth.currentUser = { ...f.user, uid }; };
  return { ...f, roomId, asMember };
}

test("subscribeRoomState listens directly to the room with onSnapshot, without timers or HTTP requests", async () => {
  const f = await setup();
  assert.ok(!f.source.includes("setTimeout")); assert.ok(!f.source.includes("fetch("));
  const changes: Array<RoomState | null> = [];
  const stop = f.backend.subscribeRoomState(f.roomId, (state) => changes.push(state));
  await setImmediate();
  assert.equal(f.counts().listenerCount, 1);
  assert.equal(changes.length, 1);
  await f.backend.submitPreferences(f.roomId, "one", { favorites: ["Alpha"] });
  await setImmediate();
  assert.equal(changes.at(-1)?.options[0].name, "Alpha");
  stop(); assert.equal(f.counts().stopCount, 1);
  const count = changes.length;
  await f.backend.removeNomination(f.roomId, "one", "Alpha"); await setImmediate();
  assert.equal(changes.length, count);
});

test("unsubscribe during auth initialization prevents attaching the snapshot listener", async () => {
  const f = backendFixture();
  f.backend.subscribeRoomState("missing", () => assert.fail("Unexpected update"))();
  await setImmediate(); assert.equal(f.counts().listenerCount, 0);
});

test("missing rooms emit null and invalid room data reports an error", async () => {
  const f = backendFixture(); const changes: Array<RoomState | null> = []; const errors: Error[] = [];
  const stop = f.backend.subscribeRoomState("missing", (state) => changes.push(state), (error) => errors.push(error));
  await setImmediate(); assert.deepEqual(changes, [null]);
  f.set("rooms/missing", { version: 1 }); await setImmediate();
  assert.match(errors[0].message, /old voting format/); stop();
});

test("direct writes preserve shared nominations and reset readiness when preferences change", async () => {
  const f = await setup();
  await f.backend.submitPreferences(f.roomId, "one", { favorites: ["Alpha"] });
  f.asMember("two"); await f.backend.joinGroup(f.roomId, "Two");
  await f.backend.submitPreferences(f.roomId, "two", { favorites: ["Alpha", "Beta"] });
  f.asMember("one"); await f.backend.markMemberReadyForVoting(f.roomId, "one");
  await f.backend.removeNomination(f.roomId, "one", "Alpha");
  const group = f.store.get(`rooms/${f.roomId}`) as GroupData;
  assert.equal(group.preferences.one.readyToVote, false);
  assert.ok(Object.values(group.restaurants).some((r) => r.name === "Alpha"));
  assert.deepEqual((await f.backend.getRoomState(f.roomId))?.options, []);
  f.asMember("two"); await f.backend.removeNomination(f.roomId, "two", "Alpha");
  assert.ok(!Object.values((f.store.get(`rooms/${f.roomId}`) as GroupData).restaurants).some((r) => r.name === "Alpha"));
});

test("selected restaurant details replace a previous name-only nomination", async () => {
  const f = await setup();
  await f.backend.submitPreferences(f.roomId, "one", { favorites: ["jimmy johns"] });
  const selected = {
    id: "google-place-123",
    name: "Jimmy John's",
    cuisine: "Sandwich shop",
    budgetRange: null,
    priceLevel: "PRICE_LEVEL_INEXPENSIVE",
    priceLabel: "$",
    distanceMiles: null,
    rating: 4.2,
    reviewCount: 1200,
    lat: 33.75,
    lng: -84.39,
    address: "1 Main Street, Atlanta, GA",
  };
  await f.backend.submitPreferences(f.roomId, "one", {
    favorites: ["Jimmy John's"],
    restaurants: [selected],
  });

  const state = await f.backend.getRoomState(f.roomId);
  assert.equal(state?.options.length, 1);
  assert.deepEqual(state?.options[0], { ...selected, votes: 0 });
  assert.equal(Object.keys((f.store.get(`rooms/${f.roomId}`) as GroupData).restaurants).length, 1);
});

test("registered profiles prefill new membership without overwriting later group edits", async () => {
  const f = await setup(); f.asMember("account"); f.auth.currentUser!.isAnonymous = false;
  await f.backend.saveProfile({ ...f.backend.defaultProfile("Account"), favorites: ["Saved favorite"] });
  const joined = await f.backend.joinGroup(f.roomId, "Account");
  assert.deepEqual(joined.state.preferences[0].favorites, ["Saved favorite"]);
  await f.backend.submitPreferences(f.roomId, "account", { favorites: ["Room favorite"] });
  await f.backend.joinGroup(f.roomId, "Account");
  assert.deepEqual((await f.backend.getRoomState(f.roomId))?.preferences[0].favorites, ["Room favorite"]);
  assert.deepEqual((await f.backend.getProfile()).favorites, ["Saved favorite"]);
});

test("merged per-member distance controls save through the existing room preferences", async () => {
  const f = await setup();
  await f.backend.updateMemberDistance(f.roomId, "one", { location: { address: "Atlanta" }, distanceCapMiles: 5 });
  const state = await f.backend.getRoomState(f.roomId);
  assert.deepEqual(state?.memberDistances.one, { location: { address: "Atlanta" }, distanceCapMiles: 5 });
  assert.equal(state?.preferences[0].distanceCapMiles, 5);
  f.asMember("two"); await f.backend.joinGroup(f.roomId, "Two");
  assert.equal((await f.backend.getRoomState(f.roomId))?.memberDistances.one, undefined);
});

for (const strategy of ["random", "runoff"] as const) {
  test(`${strategy} tie strategy persists results through direct Firestore transactions`, async () => {
    const f = await setup(strategy);
    await f.backend.submitPreferences(f.roomId, "one", { favorites: ["Alpha"] });
    f.asMember("two"); await f.backend.joinGroup(f.roomId, "Two");
    await f.backend.submitPreferences(f.roomId, "two", { favorites: ["Beta"] });
    assert.deepEqual((await f.backend.getRoomState(f.roomId))?.options.map((r) => r.name), ["Beta"]);
    await f.backend.markMemberReadyForVoting(f.roomId, "two");
    f.asMember("one"); await f.backend.markMemberReadyForVoting(f.roomId, "one");
    const state = await f.backend.getRoomState(f.roomId);
    assert.equal(state?.phase, "voting");
    const alpha = state!.options.find((r) => r.name === "Alpha")!.id;
    const beta = state!.options.find((r) => r.name === "Beta")!.id;
    await f.backend.submitVotes(f.roomId, "one", [alpha]);
    f.asMember("two"); await f.backend.submitVotes(f.roomId, "two", [beta]);
    if (strategy === "runoff") {
      assert.equal((await f.backend.getRoomState(f.roomId))?.phase, "runoff");
      await assert.rejects(f.backend.submitVotes(f.roomId, "two", [beta], 0), /closed/);
      await f.backend.submitVotes(f.roomId, "two", [beta], 1);
      f.asMember("one"); await f.backend.submitVotes(f.roomId, "one", [beta], 1);
    }
    const result = await f.backend.getRoomState(f.roomId);
    assert.equal(result?.phase, "results"); assert.ok(result?.winner);
    if (strategy === "runoff") assert.equal(result.winner.id, beta);
    const uid = f.auth.currentUser!.uid;
    await f.backend.submitResultFeedback(f.roomId, uid, true);
    await f.backend.submitResultFeedback(f.roomId, uid, false);
    assert.equal((await f.backend.getRoomState(f.roomId))?.feedback[uid].happy, false);
    f.asMember(uid === "one" ? "two" : "one");
    const otherView = await f.backend.getRoomState(f.roomId);
    assert.deepEqual(otherView?.feedback, {});
    assert.equal(otherView?.satisfactionByMember[uid], false);
  });
}

test("SDK errors use helpful messages without provider names or raw codes", () => {
  const { authErrorMessage, userErrorMessage } = backendFixture().backend;
  assert.equal(authErrorMessage({ code: "auth/invalid-credential" }), "The email or password is incorrect.");
  assert.match(authErrorMessage({ code: "auth/email-already-in-use" }), /already exists/);
  for (const code of ["auth/configuration-not-found", "auth/operation-not-allowed", "auth/admin-restricted-operation"]) {
    const message = authErrorMessage({ code }, "guest");
    assert.match(message, /do not need to create an account/);
    assert.doesNotMatch(message, /firebase|auth\//i);
  }
  for (const code of ["auth/invalid-credential", "auth/unknown-error", "permission-denied", "unavailable"]) {
    assert.doesNotMatch(userErrorMessage({ code, message: `Firebase: Error (${code}).` }), /firebase|auth\/|permission-denied/i);
  }
  assert.equal(userErrorMessage(new Error("Firebase: Error (unknown)."), "Please try again."), "Please try again.");
  assert.equal(userErrorMessage(new Error("Please enter a restaurant name.")), "Please enter a restaurant name.");
});

test("account subscriptions distinguish registered users from guests and update on logout", async () => {
  const f = backendFixture();
  const accounts: Array<{ uid: string; name: string } | null> = [];
  const stop = f.backend.subscribeAccount((account) => accounts.push(account));
  await setImmediate(); assert.deepEqual(accounts, [null]);
  f.user.isAnonymous = false; f.user.displayName = "Sam"; f.emitAuth();
  assert.deepEqual(accounts.at(-1), { uid: "one", name: "Sam" });
  await f.backend.logOut(); assert.equal(accounts.at(-1), null);
  stop(); const count = accounts.length; f.emitAuth(); assert.equal(accounts.length, count);
});

test("a missing live Auth configuration prevents writes and allows retry after setup", async () => {
  const f = backendFixture(); f.auth.currentUser = null;
  const signIn = f.firebaseAuth.signInAnonymously;
  f.firebaseAuth.signInAnonymously = async () => { throw Object.assign(new Error("Missing configuration"), { code: "auth/configuration-not-found" }); };
  await assert.rejects(f.backend.createGroup({ groupName: "Dinner", location: "Atlanta" }), /Guest access is temporarily unavailable/);
  assert.equal(f.store.size, 0);
  f.firebaseAuth.signInAnonymously = signIn;
  const group = await f.backend.createGroup({ groupName: "Dinner", location: "Atlanta" });
  assert.ok(group.roomId);
});

test("signup upgrades a guest without changing identity and login/signup remain optional", async () => {
  const f = await setup();
  const credential = await f.backend.signUp("one@example.test", "password123", "One");
  assert.equal(credential.user.uid, "one");
  assert.equal(f.auth.currentUser!.isAnonymous, false);
  assert.equal((await f.backend.getProfile()).displayName, "One");
  assert.ok((await f.backend.getRoomState(f.roomId))?.members.some((member) => member.id === "one"));
});
