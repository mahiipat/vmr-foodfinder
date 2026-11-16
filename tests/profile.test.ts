import assert from "node:assert/strict";
import { test } from "node:test";
import { backendFixture } from "./backend-fixture.ts";
const { RoomError, defaultProfile, validateProfile } = backendFixture().backend;

function isBadRequest(error: unknown): boolean {
  return error instanceof RoomError && error.status === 400;
}

test("default profile includes every budget and independent empty collections", () => {
  assert.deepEqual(defaultProfile(), {
    displayName: "",
    favorites: [],
    budgetRanges: ["UNDER_10", "TEN_TO_THIRTY", "THIRTY_TO_SIXTY", "SIXTY_PLUS"],
    distanceCapMiles: null,
    hostLocation: null,
    dietaryNeeds: [],
  });
  const profile = defaultProfile("Sam");
  assert.equal(profile.displayName, "Sam");
  profile.budgetRanges.pop();
  profile.favorites.push("Thai");
  assert.equal(defaultProfile().budgetRanges.length, 4);
  assert.deepEqual(defaultProfile().favorites, []);
  assert.deepEqual(validateProfile(defaultProfile()), defaultProfile());
});

test("profile validation trims text, deduplicates favorites, and accepts boundary values", () => {
  const profile = validateProfile({
    ...defaultProfile(),
    displayName: " Sam ",
    favorites: [" Thai ", "Thai", "Italian"],
    distanceCapMiles: 500,
    hostLocation: { lat: -90, lng: 180, address: " Main Street " },
  });
  assert.deepEqual(profile, {
    ...defaultProfile("Sam"),
    favorites: ["Thai", "Italian"],
    distanceCapMiles: 500,
    hostLocation: { lat: -90, lng: 180, address: "Main Street" },
  });
  assert.equal(validateProfile({ ...defaultProfile(), favorites: Array.from({ length: 30 }, (_, i) => `Food ${i}`) }).favorites.length, 30);
  assert.equal(validateProfile({ ...defaultProfile(), distanceCapMiles: 0.1 }).distanceCapMiles, 0.1);
});

test("profile validation rejects missing required, malformed, and unknown fields including uid", () => {
  for (const input of [null, [], {}, "profile", { ...defaultProfile(), uid: "another-user" },
    { ...defaultProfile(), extra: true }, { ...defaultProfile(), displayName: 7 },
    { ...defaultProfile(), favorites: "Thai" }, { ...defaultProfile(), budgetRanges: null },
    { ...defaultProfile(), distanceCapMiles: undefined }, { ...defaultProfile(), hostLocation: undefined }]) {
    assert.throws(() => validateProfile(input), isBadRequest);
  }
  for (const field of Object.keys(defaultProfile()).filter((field) => field !== "dietaryNeeds")) {
    const profile: Record<string, unknown> = { ...defaultProfile() };
    delete profile[field];
    assert.throws(() => validateProfile(profile), isBadRequest, field);
  }
});

test("profile dietary needs support legacy profiles and validate saved selections", () => {
  const legacy: Record<string, unknown> = { ...defaultProfile() };
  delete legacy.dietaryNeeds;
  assert.deepEqual(validateProfile(legacy).dietaryNeeds, []);
  assert.deepEqual(validateProfile({ ...defaultProfile(), dietaryNeeds: ["vegan", "halal", "vegan"] }).dietaryNeeds, ["vegan", "halal"]);
  for (const dietaryNeeds of ["vegan", ["unsupported"], [1]]) {
    assert.throws(() => validateProfile({ ...defaultProfile(), dietaryNeeds }), isBadRequest);
  }
});

test("profile validation rejects oversized or invalid favorites and names", () => {
  for (const input of [
    { displayName: "x".repeat(101) },
    { favorites: Array.from({ length: 31 }, (_, i) => `Food ${i}`) },
    { favorites: ["x".repeat(201)] },
    { favorites: [""] },
    { favorites: [" "] },
    { favorites: [1] },
  ]) {
    assert.throws(() => validateProfile({ ...defaultProfile(), ...input }), isBadRequest);
  }
});

test("profile validation rejects empty, duplicate, or unsupported budgets", () => {
  for (const budgetRanges of [[], ["UNKNOWN"], ["UNDER_10", "UNDER_10"], [1],
    ["UNDER_10", "TEN_TO_THIRTY", "THIRTY_TO_SIXTY", "SIXTY_PLUS", "UNDER_10"]]) {
    assert.throws(() => validateProfile({ ...defaultProfile(), budgetRanges }), isBadRequest);
  }
});

test("profile distance is null or a finite number greater than zero and at most 500", () => {
  for (const distanceCapMiles of [0, -1, 500.01, Infinity, -Infinity, NaN, "50"]) {
    assert.throws(() => validateProfile({ ...defaultProfile(), distanceCapMiles }), isBadRequest);
  }
});

test("profile validation rejects invalid coordinates, address, and location fields", () => {
  for (const hostLocation of [[], "Main Street", { uid: "other" }, { lat: 90.01 }, { lat: -90.01 },
    { lng: 180.01 }, { lng: -180.01 }, { lat: Infinity }, { lng: NaN }, { lat: "1" },
    { address: 5 }, { address: "x".repeat(501) }]) {
    assert.throws(() => validateProfile({ ...defaultProfile(), hostLocation }), isBadRequest);
  }
  for (const hostLocation of [{}, { lat: 90 }, { lng: -180 }, { address: "Main Street" }]) {
    assert.deepEqual(validateProfile({ ...defaultProfile(), hostLocation }).hostLocation, hostLocation);
  }
});

test("profiles require a registered account and save directly to the owner's document", async () => {
  const f = backendFixture();
  await assert.rejects(f.backend.getProfile(), /Sign in/);
  f.user.isAnonymous = false;
  const profile = { ...f.backend.defaultProfile("One"), favorites: ["Alpha"] };
  await f.backend.saveProfile(profile);
  assert.deepEqual(f.store.get("profiles/one"), profile);
  assert.deepEqual(await f.backend.getProfile(), profile);
});
