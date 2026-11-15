import assert from "node:assert/strict";
import test from "node:test";
import type { GroupData, Restaurant, TieStrategy } from "../backend/AppBackend";
import { backendFixture } from "./backend-fixture.ts";
const { ALL_BUDGET_RANGES, budgets, castVote, distanceCap, eligibleRestaurants, joinMember, markReady,
  locationInput, milesBetween, names, newGroup, recordFeedback, roomView, updatePreferences } = backendFixture().backend;

const a: Restaurant = { id: "a", name: "Alpha", cuisine: "Test", budgetRange: "UNDER_10", priceLabel: "Under $10", distanceMiles: 0,
  lat: 33.75, lng: -84.39, rating: 4, reviewCount: 20 };
const b: Restaurant = { ...a, id: "b", name: "Beta", budgetRange: "TEN_TO_THIRTY" };
function group(strategy: TieStrategy = "random"): GroupData {
  const room = newGroup("Dinner", "Atlanta", strategy);
  joinMember(room, "one", "One"); joinMember(room, "two", "Two");
  room.restaurants = { a: { ...a }, b: { ...b } };
  updatePreferences(room, "one", { favorites: ["Alpha"] });
  updatePreferences(room, "two", { favorites: ["Beta"] });
  // updatePreferences prunes unreferenced records; populate resolved nomination data after both are present.
  room.restaurants = { a: { ...a }, b: { ...b } };
  return room;
}
function open(room: GroupData) { markReady(room, "one", true); markReady(room, "two", true); }

test("normalizes nominations and validates budgets and distances", () => {
  assert.deepEqual(names([" Alpha ", "alpha", "Beta"]), ["alpha", "Beta"]);
  assert.deepEqual(budgets(["UNDER_10", "UNDER_10"]), ["UNDER_10"]);
  for (const value of [0, -1, NaN, Infinity, 501, "5", undefined]) assert.throws(() => distanceCap(value));
  assert.equal(distanceCap(null), null);
  assert.throws(() => budgets([])); assert.throws(() => budgets(["UNKNOWN"]));
});
test("readiness preserves nominations and only opens voting after everyone is ready", () => {
  const room = group(); markReady(room, "one", true);
  assert.equal(room.phase, "nominations"); assert.deepEqual(room.preferences.one.favorites, ["Alpha"]);
  markReady(room, "two", true); assert.equal(room.phase, "voting"); assert.equal(room.candidateIds.length, 2);
});
test("all filtered nominations reset every member and return a reask message", () => {
  const room = group(); updatePreferences(room, "one", { budgetRanges: ["SIXTY_PLUS"] }); open(room);
  assert.equal(room.phase, "nominations"); assert.ok(room.reaskReason?.includes("No restaurants survived"));
  assert.ok(Object.values(room.preferences).every((p) => !p.readyToVote));
  updatePreferences(room, "one", { budgetRanges: [...ALL_BUDGET_RANGES] }); open(room);
  assert.equal(room.phase, "voting"); assert.equal(room.reaskReason, null);
});
test("distance filtering is deferred without losing saved preferences or blocking voting", () => {
  const room = group(); assert.equal(milesBetween(33.75, -84.39, 33.75, -84.39), 0);
  assert.ok(Math.abs(milesBetween(0, 0, 0, 1) - 69.09) < 0.1);
  updatePreferences(room, "one", { distanceCapMiles: 1, hostLocation: { address: "Atlanta" } });
  room.restaurants.b.lat = 34;
  delete room.restaurants.a.lat;
  assert.equal(eligibleRestaurants(room).length, 2);
  const state = roomView(room, "id", "one");
  assert.equal(state.distanceFilteringAvailable, false);
  assert.equal(state.distanceCapMiles, 1);
  assert.deepEqual(state.hostLocation, { address: "Atlanta" });
  open(room); assert.equal(room.phase, "voting");
});
test("locations are validated and stored without address lookups", () => {
  assert.equal(locationInput(null), null);
  assert.deepEqual(locationInput({ address: " Atlanta " }), { address: "Atlanta" });
  assert.deepEqual(locationInput({ lat: 33.75, lng: -84.39 }), { lat: 33.75, lng: -84.39 });
  assert.deepEqual(locationInput({ address: "" }), { address: "" });
  for (const value of [[], "Atlanta", { lat: 91 }, { lng: -181 }, { lat: "33" }, { lat: NaN }, { address: 5 }, { extra: true }]) {
    assert.throws(() => locationInput(value));
  }
});
test("server view hides other nominations in every response field until voting", () => {
  const room = group(); room.preferences.two.hostLocation = { lat: 90, lng: 100 };
  const state = roomView(room, "id", "one");
  assert.deepEqual(state.options.map((r) => r.id), ["a"]);
  assert.equal(state.preferences.length, 1); assert.ok(!JSON.stringify(state).includes("Beta"));
  assert.deepEqual(roomView(room, "id", "outsider").options, []);
  open(room); assert.equal(roomView(room, "id", "one").options.length, 2);
  assert.equal(roomView(room, "id", "one").preferences.length, 1);
});
test("removal preserves shared nominations, deletes the last owner's restaurant and resets readiness", () => {
  const room = group(); updatePreferences(room, "two", { favorites: ["Alpha", "Beta"] }); markReady(room, "one", true);
  updatePreferences(room, "one", { favorites: [] });
  assert.ok(room.restaurants.a); assert.equal(room.preferences.one.readyToVote, false);
  updatePreferences(room, "two", { favorites: ["Beta"] }); assert.equal(room.restaurants.a, undefined);
});
test("profile defaults copy into a new group but never overwrite rejoining member choices", () => {
  const room = newGroup("Dinner", "Atlanta", "random");
  joinMember(room, "one", "One", { favorites: ["Alpha"], budgetRanges: ["UNDER_10"], distanceCapMiles: 3 });
  assert.equal(room.preferences.one.distanceCapMiles, 3);
  updatePreferences(room, "one", { favorites: [] });
  joinMember(room, "one", "Changed", { favorites: ["Alpha"] });
  assert.deepEqual(room.preferences.one.favorites, []);
});
test("nonmembers cannot mutate and nominations cannot change after the ballot opens", () => {
  const room = group(); assert.throws(() => markReady(room, "other", true));
  assert.throws(() => updatePreferences(room, "other", { favorites: [] }));
  open(room); assert.throws(() => updatePreferences(room, "one", { budgetRanges: ["SIXTY_PLUS"] }));
  assert.throws(() => joinMember(room, "other", "Other"));
});
test("votes validate eligibility, deduplicate approval votes and do not finish early", () => {
  const room = group(); assert.throws(() => castVote(room, "one", ["a"], 0)); open(room);
  assert.throws(() => castVote(room, "other", ["a"], 0)); assert.throws(() => castVote(room, "one", [], 0));
  assert.throws(() => castVote(room, "one", ["x"], 0)); assert.throws(() => castVote(room, "one", ["a"], 2));
  castVote(room, "one", ["a", "a"], 0); assert.deepEqual(room.votes.one, ["a"]); assert.equal(room.winnerId, null);
  castVote(room, "two", ["a"], 0); assert.equal(room.winnerId, "a"); assert.equal(room.phase, "results");
  assert.throws(() => castVote(room, "one", ["b"], 0));
});
test("random strategy chooses only tied leaders and persists one winner in repeated views", () => {
  const room = group(); open(room); castVote(room, "one", ["a"], 0); castVote(room, "two", ["b"], 0, () => 0.99);
  assert.equal(room.winnerId, "b");
  assert.equal(roomView(room, "id", "one").winner?.id, "b"); assert.equal(roomView(room, "id", "two").winner?.id, "b");
  assert.equal(roomView(room, "id", "one").hasTie, false);
});
test("runoff creates a fresh single-choice tied-only round, rejects stale ballots and randomly resolves a second tie", () => {
  const room = group("runoff"); open(room); castVote(room, "one", ["a"], 0); castVote(room, "two", ["b"], 0);
  assert.equal(room.phase, "runoff"); assert.equal(room.round, 1); assert.deepEqual(room.votes, {});
  assert.deepEqual(room.initialVotes, { one: ["a"], two: ["b"] });
  assert.throws(() => castVote(room, "one", ["a"], 0)); assert.throws(() => castVote(room, "one", ["a", "b"], 1));
  castVote(room, "one", ["b"], 1); castVote(room, "two", ["a"], 1, () => 0);
  assert.equal(room.phase, "results"); assert.equal(room.winnerId, "a");
});
test("a non-tied runoff winner does not require a random draw", () => {
  const room = group("runoff"); open(room); castVote(room, "one", ["a"], 0); castVote(room, "two", ["b"], 0);
  castVote(room, "one", ["b"], 1); castVote(room, "two", ["b"], 1, () => { throw new Error("Unexpected random draw"); });
  assert.equal(room.winnerId, "b");
});
test("results feedback is member-only, final-only and idempotent per member", () => {
  const room = group(); assert.throws(() => recordFeedback(room, "one", true)); open(room);
  castVote(room, "one", ["a"], 0); castVote(room, "two", ["a"], 0);
  assert.throws(() => recordFeedback(room, "other", true)); assert.throws(() => recordFeedback(room, "one", "yes"));
  recordFeedback(room, "one", true); recordFeedback(room, "one", false);
  assert.equal(Object.keys(room.feedback).length, 1); assert.equal(room.feedback.one.happy, false);
  assert.equal(room.feedback.one.restaurantId, "a"); assert.deepEqual(roomView(room, "id", "two").feedback, {});
});
