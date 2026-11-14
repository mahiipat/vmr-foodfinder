import assert from "node:assert/strict";
import test from "node:test";
import { backendFixture } from "./backend-fixture.ts";
const { createNomination, ALL_BUDGET_RANGES, eligibleRestaurants, joinMember, markReady, newGroup, updatePreferences } = backendFixture().backend;

test("name-only nominations need no external service and do not invent restaurant metadata", () => {
  const restaurant = createNomination(" Alpha ");
  assert.equal(restaurant.name, "Alpha");
  assert.equal(restaurant.id, createNomination("alpha").id);
  assert.notEqual(restaurant.id, createNomination("Beta").id);
  assert.equal(restaurant.budgetRange, null);
  assert.equal(restaurant.distanceMiles, null);
  assert.equal(restaurant.priceLabel, "Price unavailable");
  assert.equal(restaurant.lat, undefined);
  assert.equal(restaurant.reviewCount, 0);
  assert.throws(() => createNomination(" "));
});
test("unknown-price nominations can be voted on without budgets but never falsely satisfy a price restriction", () => {
  const room = newGroup("Dinner", "Atlanta", "random");
  joinMember(room, "one", "One");
  const restaurant = createNomination("Alpha");
  room.restaurants[restaurant.id] = restaurant;
  updatePreferences(room, "one", { favorites: [restaurant.name] });
  assert.equal(eligibleRestaurants(room).length, 1);
  updatePreferences(room, "one", { budgetRanges: ["UNDER_10"] });
  assert.equal(eligibleRestaurants(room).length, 0);
  markReady(room, "one", true);
  assert.equal(room.phase, "nominations");
  assert.ok(room.reaskReason);
  updatePreferences(room, "one", { budgetRanges: [...ALL_BUDGET_RANGES] });
  markReady(room, "one", true);
  assert.equal(room.phase, "voting");
});
