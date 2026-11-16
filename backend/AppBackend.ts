import { createUserWithEmailAndPassword, EmailAuthProvider, linkWithCredential, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut, updateProfile, type User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { ANALYTICS_STUDY_STARTED_AT, auth, db, trackEvent } from "./firebase";
// type-only so the test fixture (which only allows Firebase imports at runtime) still loads this file
import type { DietaryTag } from "../lib/dietary";

export type BudgetRange = "UNDER_10" | "TEN_TO_THIRTY" | "THIRTY_TO_SIXTY" | "SIXTY_PLUS";
export const ALL_BUDGET_RANGES: BudgetRange[] = ["UNDER_10", "TEN_TO_THIRTY", "THIRTY_TO_SIXTY", "SIXTY_PLUS"];
export const budgetRangeLabels: Record<BudgetRange, string> = {
  UNDER_10: "Under $10", TEN_TO_THIRTY: "$10 to $30", THIRTY_TO_SIXTY: "$30 to $60", SIXTY_PLUS: "$60+",
};
export type HostLocation = { lat?: number; lng?: number; address?: string };
export type MemberDistance = { location: HostLocation | null; distanceCapMiles: number | null };
export type TieStrategy = "random" | "runoff";
export type Restaurant = {
  id: string; name: string; cuisine: string; budgetRange: BudgetRange | null;
  priceLevel?: string; priceLabel: string; distanceMiles: number | null;
  rating: number; reviewCount: number; lat?: number; lng?: number; address?: string;
  // Google Places details (only on restaurants picked from search)
  placeId?: string; photoName?: string; mapsUrl?: string; website?: string;
  // Yelp dietary info: dietaryChecked is false when the restaurant wasn't found on Yelp
  dietaryTags?: DietaryTag[]; dietaryChecked?: boolean; yelpUrl?: string;
};
export type PreferenceInput = {
  budgetRanges?: BudgetRange[]; favorites?: string[]; restaurants?: Restaurant[]; readyToVote?: boolean;
  distanceCapMiles?: number | null; hostLocation?: HostLocation | null; dietaryNeeds?: DietaryTag[];
};
export type Preference = {
  memberId: string; budgetRanges: BudgetRange[]; favorites: string[];
  readyToVote: boolean; distanceCapMiles: number | null; hostLocation: HostLocation | null;
  // optional so rooms created before dietary needs existed still load
  dietaryNeeds?: DietaryTag[];
};
export type GroupData = {
  version: 2; groupName: string; location: string; createdAt: number;
  tieStrategy: TieStrategy; phase: "nominations" | "voting" | "runoff" | "results";
  round: number; members: Record<string, { name: string }>;
  preferences: Record<string, Preference>; restaurants: Record<string, Restaurant>;
  candidateIds: string[]; votes: Record<string, string[]>; initialVotes: Record<string, string[]>;
  winnerId: string | null; reaskReason: string | null;
  feedback: Record<string, { happy: boolean; restaurantId: string; updatedAt: number }>;
};
export type RoomState = {
  room: Record<string, unknown>; members: Array<{ id: string; name: string }>;
  preferences: Preference[]; options: Array<Restaurant & { votes: number }>;
  memberDistances: Record<string, MemberDistance>;
  winner: (Restaurant & { votes: number }) | null; votesByMember: Record<string, string[]>;
  readyMemberIds: string[]; allMembersReadyToVote: boolean; allMembersVoted: boolean;
  hasTie: boolean; distanceCapMiles: number | null; hostLocation: HostLocation | null;
  distanceFilteringAvailable: boolean;
  // every dietary need anyone in the group selected (preferences above only include your own)
  groupDietaryNeeds: DietaryTag[];
  phase: GroupData["phase"]; round: number; tieStrategy: TieStrategy;
  reaskReason: string | null; feedback: GroupData["feedback"];
  satisfactionByMember: Record<string, boolean>;
};
type RoomEvent = { name: string; parameters?: Record<string, string | number | boolean> };

function reportRoomEvents(group: GroupData, roomId: string, events: RoomEvent[]) {
  const context = {
    group_id: roomId, experiment_id: "tie_strategy_v1", tie_strategy: group.tieStrategy,
    group_cohort: group.createdAt >= ANALYTICS_STUDY_STARTED_AT ? "study_20261116" : "legacy",
    phase: group.phase, round: group.round, member_count: Object.keys(group.members).length,
    nomination_count: Object.keys(group.restaurants).length, candidate_count: group.candidateIds.length,
    elapsed_seconds: Math.max(0, (Date.now() - group.createdAt) / 1000),
    dietary_policy: PRUNE_UNKNOWN_DIETARY ? "prune_unknown" : "keep_unknown",
  };
  for (const event of events) {
    void trackEvent(event.name, { ...context, ...event.parameters }).catch((error: unknown) => {
      console.warn("Unable to record room analytics.", error);
    });
  }
}
export class RoomError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new RoomError(`Invalid ${field}.`);
  }
  return value.trim();
}
export function restaurantNameKey(value: string): string {
  const key = value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  return key || value.trim().toLowerCase();
}
export function names(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 30) throw new RoomError("Provide at most 30 favorites.");
  const unique = new Map<string, string>();
  for (const item of value) {
    const name = text(item, "restaurant name");
    unique.set(restaurantNameKey(name), name);
  }
  return [...unique.values()];
}
export function budgets(value: unknown): BudgetRange[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4 ||
      value.some((item) => !ALL_BUDGET_RANGES.includes(item))) throw new RoomError("Select valid budget ranges.");
  return [...new Set(value)] as BudgetRange[];
}
const DIETARY_TAGS: DietaryTag[] = ["vegetarian", "vegan", "gluten_free", "halal", "kosher"];
export function dietaryNeeds(value: unknown): DietaryTag[] {
  if (!Array.isArray(value) || value.some((item) => !DIETARY_TAGS.includes(item))) throw new RoomError("Select valid dietary needs.");
  return [...new Set(value)] as DietaryTag[];
}
export function groupDietaryNeeds(group: GroupData): DietaryTag[] {
  const needs = new Set(Object.values(group.preferences).flatMap((p) => p.dietaryNeeds ?? []));
  return DIETARY_TAGS.filter((tag) => needs.has(tag));
}
// Item 10 A/B switch: false keeps restaurants whose dietary info is unknown (not on Yelp),
// true removes them. Restaurants Yelp found but without a needed tag are still kept either way,
// because Yelp categories are incomplete (a missing tag doesn't mean unsafe).
export const PRUNE_UNKNOWN_DIETARY = false;
export function passesDietaryNeeds(restaurant: Restaurant, needs: DietaryTag[], pruneUnknown = PRUNE_UNKNOWN_DIETARY): boolean {
  if (needs.length === 0 || !pruneUnknown) return true;
  return restaurant.dietaryChecked === true;
}
export function distanceCap(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 500) {
    throw new RoomError("Distance must be greater than zero and at most 500 miles.");
  }
  return value;
}
export function locationInput(value: unknown): HostLocation | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RoomError("Invalid starting location.");
  const location = value as Record<string, unknown>;
  if (Object.keys(location).some((key) => !["lat", "lng", "address"].includes(key))) throw new RoomError("Invalid location fields.");
  const result: HostLocation = {};
  for (const [field, limit] of [["lat", 90], ["lng", 180]] as const) {
    if (location[field] !== undefined) {
      if (typeof location[field] !== "number" || !Number.isFinite(location[field]) || Math.abs(location[field]) > limit) {
        throw new RoomError("Invalid location coordinates.");
      }
      result[field] = location[field];
    }
  }
  if (location.address !== undefined) {
    if (typeof location.address !== "string" || location.address.trim().length > 500) throw new RoomError("Invalid starting address.");
    result.address = location.address.trim();
  }
  return result;
}
export function coordinates(location: HostLocation | null): location is HostLocation & { lat: number; lng: number } {
  return location !== null && typeof location.lat === "number" && Number.isFinite(location.lat) && Math.abs(location.lat) <= 90 &&
    typeof location.lng === "number" && Number.isFinite(location.lng) && Math.abs(location.lng) <= 180;
}
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (n: number) => n * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function newGroup(groupName: string, location: string, tieStrategy: TieStrategy): GroupData {
  return { version: 2, groupName, location, createdAt: Date.now(), tieStrategy, phase: "nominations", round: 0,
    members: {}, preferences: {}, restaurants: {}, candidateIds: [], votes: {}, initialVotes: {},
    winnerId: null, reaskReason: null, feedback: {} };
}
export function requireMember(group: GroupData, uid: string): Preference {
  if (!Object.hasOwn(group.members, uid)) throw new RoomError("Join this group first.", 403);
  return group.preferences[uid];
}
export function requireNominations(group: GroupData) {
  if (group.phase !== "nominations") throw new RoomError("Nominations are closed for this vote.", 409);
}
export function joinMember(group: GroupData, uid: string, name: string, defaults: PreferenceInput = {}) {
  if (Object.hasOwn(group.members, uid)) return;
  requireNominations(group);
  if (Object.keys(group.members).length >= 30) throw new RoomError("This group is full.", 409);
  group.members[uid] = { name };
  group.preferences[uid] = { memberId: uid, budgetRanges: defaults.budgetRanges ?? [...ALL_BUDGET_RANGES],
    favorites: defaults.favorites ?? [], readyToVote: false,
    distanceCapMiles: defaults.distanceCapMiles ?? null, hostLocation: defaults.hostLocation ?? null,
    dietaryNeeds: [] };
  resetReady(group);
}
export function resetReady(group: GroupData) {
  for (const preference of Object.values(group.preferences)) preference.readyToVote = false;
}
export function updatePreferences(group: GroupData, uid: string, input: PreferenceInput) {
  const preference = requireMember(group, uid);
  requireNominations(group);
  if (input.budgetRanges !== undefined) preference.budgetRanges = budgets(input.budgetRanges);
  if (input.favorites !== undefined) preference.favorites = names(input.favorites);
  if (input.distanceCapMiles !== undefined) preference.distanceCapMiles = distanceCap(input.distanceCapMiles);
  if (input.hostLocation !== undefined) preference.hostLocation = input.hostLocation;
  if (input.dietaryNeeds !== undefined) preference.dietaryNeeds = dietaryNeeds(input.dietaryNeeds);
  if (input.budgetRanges !== undefined || input.favorites !== undefined || input.distanceCapMiles !== undefined || input.hostLocation !== undefined || input.dietaryNeeds !== undefined) {
    resetReady(group);
    group.reaskReason = null;
  }
  // Remove only records no member still nominates (shared nominations survive).
  const active = new Set(Object.values(group.preferences).flatMap((p) => p.favorites.map(restaurantNameKey)));
  for (const [key, restaurant] of Object.entries(group.restaurants)) {
    if (!active.has(restaurantNameKey(restaurant.name))) delete group.restaurants[key];
  }
}
export function eligibleRestaurants(group: GroupData): Restaurant[] {
  const preferences = Object.values(group.preferences);
  const active = new Set(preferences.flatMap((p) => p.favorites.map(restaurantNameKey)));
  const needs = groupDietaryNeeds(group);
  return Object.values(group.restaurants).filter((restaurant) => active.has(restaurantNameKey(restaurant.name)) &&
    passesDietaryNeeds(restaurant, needs) &&
    preferences.every((preference) => restaurant.budgetRange === null
      ? ALL_BUDGET_RANGES.every((range) => preference.budgetRanges.includes(range))
      : preference.budgetRanges.includes(restaurant.budgetRange)));
}
export function markReady(group: GroupData, uid: string, ready: boolean): RoomEvent[] {
  const preference = requireMember(group, uid);
  requireNominations(group);
  if (typeof ready !== "boolean") throw new RoomError("Invalid readiness value.");
  const changed = preference.readyToVote !== ready;
  preference.readyToVote = ready;
  const events: RoomEvent[] = changed ? [{ name: ready ? "ready_to_vote" : "readiness_withdrawn" }] : [];
  if (!Object.values(group.preferences).every((p) => p.readyToVote)) return events;
  const candidates = eligibleRestaurants(group);
  const nominationCount = Object.keys(group.restaurants).length;
  events.push({ name: "shortlist_evaluated", parameters: {
    eligible_count: candidates.length, pruned_count: nominationCount - candidates.length,
    all_pruned: nominationCount > 0 && candidates.length === 0,
  } });
  if (candidates.length === 0) {
    resetReady(group);
    group.reaskReason = "No restaurants survived the group's constraints. Please add more restaurants with known prices or widen your budget ranges.";
    events.push({ name: nominationCount > 0 ? "all_choices_pruned" : "shortlist_empty",
      parameters: { reset_member_count: Object.keys(group.members).length } });
    return events;
  }
  group.candidateIds = candidates.map((r) => r.id);
  group.phase = "voting";
  group.reaskReason = null;
  events.push({ name: "voting_started", parameters: { eligible_count: candidates.length } });
  return events;
}
export function castVote(group: GroupData, uid: string, ids: unknown, round: unknown, random: () => number = Math.random): RoomEvent[] {
  requireMember(group, uid);
  if ((group.phase !== "voting" && group.phase !== "runoff") || round !== group.round) {
    throw new RoomError("This voting round is closed. Refresh the ballot.", 409);
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > group.candidateIds.length ||
      ids.some((id) => typeof id !== "string" || !group.candidateIds.includes(id))) throw new RoomError("Select eligible restaurants.");
  const unique = [...new Set(ids)] as string[];
  if (group.phase === "runoff" && unique.length !== 1) throw new RoomError("Choose exactly one restaurant in the runoff.");
  const events: RoomEvent[] = [{ name: "votes_submitted", parameters: {
    selected_restaurant_count: unique.length, replaced_ballot: Boolean(group.votes[uid]?.length), round: group.round,
    candidate_count: group.candidateIds.length, phase: group.phase,
  } }];
  group.votes[uid] = unique;
  if (!Object.keys(group.members).every((id) => group.votes[id]?.length)) return events;
  const tally = tallyVotes(group);
  const max = Math.max(...Object.values(tally));
  const tied = group.candidateIds.filter((id) => tally[id] === max);
  const roundOutcome = { round: group.round, phase: group.phase, candidate_count: group.candidateIds.length,
    had_tie: tied.length > 1, tied_count: tied.length };
  events.push({ name: "voting_round_completed", parameters: roundOutcome });
  if (tied.length > 1) events.push({ name: "tie_detected", parameters: roundOutcome });
  if (tied.length > 1 && group.tieStrategy === "runoff" && group.round === 0) {
    group.initialVotes = group.votes;
    group.votes = {};
    group.candidateIds = tied;
    group.round = 1;
    group.phase = "runoff";
    events.push({ name: "runoff_started", parameters: { tied_count: tied.length } });
    return events;
  }
  group.winnerId = tied.length === 1 ? tied[0] : tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
  group.phase = "results";
  const resolution = tied.length > 1 ? "random" : group.round === 1 ? "runoff" : "none";
  const outcome = { resolution_method: resolution, had_tie: tied.length > 1 || group.round === 1,
    random_fallback: group.round === 1 && tied.length > 1 };
  if (outcome.had_tie) events.push({ name: "tie_resolved", parameters: outcome });
  events.push({ name: "decision_completed", parameters: {
    ...outcome, decision_seconds: Math.max(0, (Date.now() - group.createdAt) / 1000), winner_vote_count: max,
  } });
  return events;
}
export function tallyVotes(group: GroupData): Record<string, number> {
  const tally: Record<string, number> = Object.fromEntries(group.candidateIds.map((id) => [id, 0]));
  for (const uid of Object.keys(group.members)) {
    for (const id of new Set(group.votes[uid] ?? [])) if (Object.hasOwn(tally, id)) tally[id]++;
  }
  return tally;
}
export function recordFeedback(group: GroupData, uid: string, happy: unknown) {
  requireMember(group, uid);
  if (group.phase !== "results" || !group.winnerId) throw new RoomError("Feedback opens after the final result.", 409);
  if (typeof happy !== "boolean") throw new RoomError("Feedback must be yes or no.");
  group.feedback[uid] = { happy, restaurantId: group.winnerId, updatedAt: Date.now() };
}
export function roomView(group: GroupData, roomId: string, uid: string): RoomState {
  const member = Object.hasOwn(group.members, uid);
  const mine = member ? group.preferences[uid] : undefined;
  const revealed = member && group.phase !== "nominations";
  const source = revealed ? group.candidateIds.map((id) => group.restaurants[id]) :
    member ? Object.values(group.restaurants).filter((r) => mine?.favorites.some((name) => restaurantNameKey(name) === restaurantNameKey(r.name))) : [];
  const tally = tallyVotes(group);
  const options = source.map((r) => ({ ...r,
    distanceMiles: coordinates(mine?.hostLocation ?? null) && coordinates(r) ?
      milesBetween(mine!.hostLocation!.lat!, mine!.hostLocation!.lng!, r.lat, r.lng) : r.distanceMiles,
    votes: revealed ? tally[r.id] ?? 0 : 0 })).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const readyMemberIds = Object.values(group.preferences).filter((p) => p.readyToVote).map((p) => p.memberId);
  return {
    room: { id: roomId, groupName: group.groupName, location: group.location },
    members: Object.entries(group.members).map(([id, m]) => ({ id, name: m.name })),
    // Prototype UI projection; the underlying room document is readable by signed-in clients.
    preferences: mine ? [mine] : [],
    memberDistances: mine ? { [uid]: { location: mine.hostLocation, distanceCapMiles: mine.distanceCapMiles } } : {},
    options, winner: options.find((r) => r.id === group.winnerId) ?? null,
    votesByMember: revealed ? group.votes : {}, readyMemberIds,
    allMembersReadyToVote: group.phase !== "nominations", allMembersVoted: group.phase === "results",
    hasTie: group.phase === "runoff" || (options.length > 1 && options[0].votes > 0 && options[0].votes === options[1].votes && !group.winnerId),
    distanceCapMiles: mine?.distanceCapMiles ?? null, hostLocation: mine?.hostLocation ?? null,
    distanceFilteringAvailable: false,
    groupDietaryNeeds: member ? groupDietaryNeeds(group) : [],
    phase: group.phase, round: group.round, tieStrategy: group.tieStrategy,
    reaskReason: member ? group.reaskReason : null, feedback: mine && group.feedback[uid] ? { [uid]: group.feedback[uid] } : {},
    satisfactionByMember: member && group.phase === "results"
      ? Object.fromEntries(Object.entries(group.feedback)
        .filter(([id, response]) => Object.hasOwn(group.members, id) && response.restaurantId === group.winnerId)
        .map(([id, response]) => [id, response.happy])) : {},
  };
}

export type Profile = {
  displayName: string;
  favorites: string[];
  budgetRanges: BudgetRange[];
  distanceCapMiles: number | null;
  hostLocation: { lat?: number; lng?: number; address?: string } | null;
};

const budgetRanges: BudgetRange[] = [
  "UNDER_10", "TEN_TO_THIRTY", "THIRTY_TO_SIXTY", "SIXTY_PLUS",
];

export function defaultProfile(displayName = ""): Profile {
  return {
    displayName,
    favorites: [],
    budgetRanges: [...budgetRanges],
    distanceCapMiles: null,
    hostLocation: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProfile(input: unknown): Profile {
  if (!isRecord(input) || Object.keys(input).some((key) => ![
    "displayName", "favorites", "budgetRanges", "distanceCapMiles", "hostLocation",
  ].includes(key))) {
    throw new RoomError("Invalid profile fields.");
  }
  if (typeof input.displayName !== "string" || input.displayName.trim().length > 100) {
    throw new RoomError("Display name must be a string of at most 100 characters.");
  }
  if (!Array.isArray(input.favorites) || input.favorites.length > 30 ||
      input.favorites.some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 200)) {
    throw new RoomError("Favorites must contain at most 30 nonempty strings of at most 200 characters.");
  }
  if (!Array.isArray(input.budgetRanges) || input.budgetRanges.length === 0 ||
      input.budgetRanges.length > budgetRanges.length ||
      input.budgetRanges.some((value) => !budgetRanges.includes(value)) ||
      new Set(input.budgetRanges).size !== input.budgetRanges.length) {
    throw new RoomError("Budget ranges must contain distinct supported budgets.");
  }
  if (input.distanceCapMiles !== null && (typeof input.distanceCapMiles !== "number" ||
      !Number.isFinite(input.distanceCapMiles) || input.distanceCapMiles <= 0 || input.distanceCapMiles > 500)) {
    throw new RoomError("Distance cap must be a positive finite number of at most 500 miles or null.");
  }

  let hostLocation: Profile["hostLocation"] = null;
  if (input.hostLocation !== null) {
    const location = input.hostLocation;
    if (!isRecord(location) || Object.keys(location).some((key) => !["lat", "lng", "address"].includes(key))) {
      throw new RoomError("Invalid host location fields.");
    }
    for (const [field, limit] of [["lat", 90], ["lng", 180]] as const) {
      if (field in location && (typeof location[field] !== "number" ||
          !Number.isFinite(location[field]) || Math.abs(location[field]) > limit)) {
        throw new RoomError(`Invalid host location ${field}.`);
      }
    }
    if ("address" in location && (typeof location.address !== "string" || location.address.trim().length > 500)) {
      throw new RoomError("Host address must be a string of at most 500 characters.");
    }
    hostLocation = {
      ...("lat" in location ? { lat: location.lat as number } : {}),
      ...("lng" in location ? { lng: location.lng as number } : {}),
      ...("address" in location ? { address: (location.address as string).trim() } : {}),
    };
  }

  return {
    displayName: input.displayName.trim(),
    favorites: [...new Set(input.favorites.map((value: string) => value.trim()))],
    budgetRanges: [...input.budgetRanges],
    distanceCapMiles: input.distanceCapMiles,
    hostLocation,
  };
}

export function userErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/weak-password": "Please choose a password with at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists. Please log in instead.",
    "auth/user-disabled": "This account is unavailable. Please contact support.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Unable to connect. Check your internet connection and try again.",
    "auth/configuration-not-found": "Account access is temporarily unavailable. Please try again later.",
    "auth/operation-not-allowed": "This sign-in option is currently unavailable. Please try again later.",
    "auth/admin-restricted-operation": "Guest access is currently unavailable. Please try again later.",
    "auth/requires-recent-login": "Please log in again before making this change.",
    "permission-denied": "We couldn't access this information. Please try again or contact the group organizer.",
    "unavailable": "Unable to connect. Check your internet connection and try again.",
    "deadline-exceeded": "The request took too long. Please try again.",
  };
  if (typeof code === "string") return messages[code] ?? fallback;
  if (error instanceof Error && !/firebase|auth\/|firestore\//i.test(error.message)) return error.message;
  return fallback;
}

export function authErrorMessage(error: unknown, mode: "guest" | "account" = "account"): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (mode === "guest" && ["auth/configuration-not-found", "auth/operation-not-allowed", "auth/admin-restricted-operation"].includes(String(code))) {
    return "Guest access is temporarily unavailable. Please try again later. You do not need to create an account.";
  }
  return userErrorMessage(error, "Unable to sign in. Please try again.");
}

export type Account = { uid: string; name: string };
export function subscribeAccount(onChange: (account: Account | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    onChange(user && !user.isAnonymous ? {
      uid: user.uid,
      name: user.displayName?.trim() || user.email?.split("@")[0] || "Member",
    } : null);
  });
}

export async function signUp(email: string, password: string, name: string) {
  const displayName = name.trim();
  if (!displayName || displayName.length > 100) {
    throw new Error("Name must contain between 1 and 100 characters.");
  }
  await auth.authStateReady();
  const user = auth.currentUser;
  const credential = user?.isAnonymous
    ? await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password))
    : await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName });
  await credential.user.getIdToken(true);
  await saveProfile({
    displayName,
    favorites: [],
    budgetRanges: ["UNDER_10", "TEN_TO_THIRTY", "THIRTY_TO_SIXTY", "SIXTY_PLUS"],
    distanceCapMiles: null,
    hostLocation: null,
  });
  return credential;
}

export function logIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function logOut() {
  return signOut(auth);
}

let pendingGuest: Promise<User> | null = null;
async function currentUser(): Promise<User> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  pendingGuest ??= signInAnonymously(auth)
    .then((credential) => credential.user)
    .catch((error) => { throw new Error(authErrorMessage(error, "guest")); })
    .finally(() => { pendingGuest = null; });
  return pendingGuest;
}

function roomRef(roomId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(roomId)) throw new RoomError("Invalid room ID.");
  return doc(db, "rooms", roomId);
}
function groupData(data: unknown): GroupData {
  if (!data) throw new RoomError("Group not found.", 404);
  if ((data as GroupData).version !== 2) throw new RoomError("This group uses the old voting format. Please create a new group.", 409);
  return data as GroupData;
}

export function createNomination(name: string): Restaurant {
  const trimmed = text(name, "restaurant name");
  return { id: `nomination-${trimmed.toLowerCase()}`, name: trimmed, cuisine: "Restaurant",
    budgetRange: null, priceLabel: "Price unavailable", distanceMiles: null, rating: 0, reviewCount: 0 };
}
function prepareNominations(group: GroupData, favorites: string[], selectedRestaurants: Restaurant[] = []): string[] {
  const selectedByName = new Map(selectedRestaurants.map((restaurant) => [restaurantNameKey(restaurant.name), restaurant]));
  return names(favorites).map((name) => {
    const nameKey = restaurantNameKey(name);
    const restaurant = selectedByName.get(nameKey) ??
      Object.values(group.restaurants).find((item) => restaurantNameKey(item.name) === nameKey) ??
      createNomination(name);
    for (const [id, existing] of Object.entries(group.restaurants)) {
      if (restaurantNameKey(existing.name) === nameKey && id !== restaurant.id) {
        delete group.restaurants[id];
      }
    }
    group.restaurants[restaurant.id] = restaurant;
    return restaurant.name;
  });
}

function changePreferences(group: GroupData, uid: string, input: PreferenceInput): RoomEvent[] {
  const previous = { ...requireMember(group, uid) };
  const readyCount = Object.values(group.preferences).filter((preference) => preference.readyToVote).length;
  updatePreferences(group, uid, input);
  const next = group.preferences[uid];
  const events: RoomEvent[] = [];
  const sameSelection = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));
  if (!sameSelection(previous.budgetRanges, next.budgetRanges)) {
    events.push({ name: "budget_ranges_updated", parameters: { selected_range_count: next.budgetRanges.length } });
  }
  if (!sameSelection(previous.dietaryNeeds ?? [], next.dietaryNeeds ?? [])) {
    events.push({ name: "dietary_needs_updated", parameters: { need_count: next.dietaryNeeds?.length ?? 0 } });
  }
  const beforeNames = previous.favorites.map(restaurantNameKey);
  const afterNames = next.favorites.map(restaurantNameKey);
  const added = afterNames.filter((name) => !beforeNames.includes(name)).length;
  const removed = beforeNames.filter((name) => !afterNames.includes(name)).length;
  if (added) events.push({ name: "restaurant_nominated", parameters: {
    added_count: added, source: input.restaurants?.some((restaurant) => restaurant.placeId) ? "google_places" : input.restaurants?.length ? "provider" : "typed",
    dietary_info_found: input.restaurants?.some((restaurant) => restaurant.dietaryChecked === true) ?? false,
  } });
  if (removed) events.push({ name: "restaurant_nomination_removed", parameters: { removed_count: removed } });
  if (input.restaurants?.length) events.push({ name: "restaurant_details_updated",
    parameters: { updated_count: input.restaurants.length } });
  if (previous.distanceCapMiles !== next.distanceCapMiles || JSON.stringify(previous.hostLocation) !== JSON.stringify(next.hostLocation)) {
    events.push({ name: "distance_preferences_updated", parameters: {
      distance_cap_set: next.distanceCapMiles !== null, coordinates_available: coordinates(next.hostLocation),
    } });
  }
  if (readyCount && Object.values(group.preferences).every((preference) => !preference.readyToVote)) {
    events.push({ name: "readiness_reset", parameters: { reset_member_count: readyCount, reset_reason: "preferences_changed" } });
  }
  return events;
}

export async function createGroup(input: { groupName?: string; location?: string; tieStrategy?: TieStrategy } = {}) {
  await currentUser();
  const strategy = input.tieStrategy ?? (Math.random() < 0.5 ? "random" : "runoff");
  if (strategy !== "random" && strategy !== "runoff") throw new RoomError("Invalid tie strategy.");
  const group = newGroup(text(input.groupName ?? "Untitled Group", "group name", 100), text(input.location ?? "Unknown", "group location", 500), strategy);
  const ref = await addDoc(collection(db, "rooms"), group);
  reportRoomEvents(group, ref.id, [
    { name: "group_created" },
    { name: "experiment_assigned", parameters: { assignment_source: input.tieStrategy ? "explicit" : "randomized" } },
  ]);
  return { roomId: ref.id, joinPath: `/room/${ref.id}`, tieStrategy: strategy };
}

export async function joinGroup(roomId: string, name = "Anonymous", _memberId?: string) {
  void _memberId;
  const user = await currentUser();
  const ref = roomRef(roomId);
  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const group = groupData(snapshot.data());
    const returning = Object.hasOwn(group.members, user.uid);
    const readyCount = Object.values(group.preferences).filter((preference) => preference.readyToVote).length;
    let defaults: PreferenceInput = {};
    if (!Object.hasOwn(group.members, user.uid) && !user.isAnonymous) {
      const profile = await transaction.get(doc(db, "profiles", user.uid));
      if (profile.exists()) defaults = validateProfile(profile.data());
    }
    if (defaults.favorites) defaults.favorites = prepareNominations(group, defaults.favorites);
    joinMember(group, user.uid, text(name, "member name", 100), defaults);
    transaction.set(ref, group);
    return { memberId: user.uid, state: roomView(group, roomId, user.uid), group, returning, readyCount };
  });
  const events: RoomEvent[] = [{ name: "group_joined", parameters: {
    returning_member: result.returning, account_type: user.isAnonymous ? "guest" : "registered",
  } }];
  if (!result.returning && result.readyCount) events.push({ name: "readiness_reset",
    parameters: { reset_member_count: result.readyCount, reset_reason: "member_joined" } });
  reportRoomEvents(result.group, roomId, events);
  return { memberId: result.memberId, state: result.state };
}

async function changeRoom(roomId: string, memberId: string | undefined, change: (group: GroupData, uid: string) => RoomEvent[]) {
  const user = await currentUser();
  if (memberId !== undefined && user.uid !== memberId) throw new RoomError("Rejoin the group with your current account.");
  const ref = roomRef(roomId);
  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const group = groupData(snapshot.data());
    requireMember(group, user.uid);
    const events = change(group, user.uid);
    transaction.set(ref, group);
    return { memberId: user.uid, state: roomView(group, roomId, user.uid), group, events };
  });
  // Only the successful transaction attempt reports; retries and room listeners do not.
  reportRoomEvents(result.group, roomId, result.events);
  return { memberId: result.memberId, state: result.state };
}

export function submitPreferences(roomId: string, memberId: string, input: PreferenceInput) {
  return changeRoom(roomId, memberId, (group, uid) => {
    const next = { ...input };
    if (next.favorites !== undefined) next.favorites = prepareNominations(group, next.favorites, next.restaurants);
    if (next.hostLocation !== undefined) next.hostLocation = locationInput(next.hostLocation);
    const events = changePreferences(group, uid, next);
    if (next.readyToVote !== undefined) events.push(...markReady(group, uid, next.readyToVote));
    return events;
  });
}
export function updateRoomDistance(roomId: string, input: { distanceCapMiles: number | null; hostLocation: HostLocation | null }) {
  return changeRoom(roomId, undefined, (group, uid) => changePreferences(group, uid, {
    distanceCapMiles: distanceCap(input.distanceCapMiles), hostLocation: locationInput(input.hostLocation),
  }));
}
export function updateMemberDistance(roomId: string, memberId: string, input: MemberDistance) {
  return submitPreferences(roomId, memberId, { distanceCapMiles: input.distanceCapMiles, hostLocation: input.location });
}
export function markMemberReadyForVoting(roomId: string, memberId: string, readyToVote = true) {
  return changeRoom(roomId, memberId, (group, uid) => markReady(group, uid, readyToVote));
}
export function submitVotes(roomId: string, memberId: string, restaurantIds: string[], round = 0) {
  // Keep the draw stable if Firestore retries the transaction.
  const random = Math.random();
  return changeRoom(roomId, memberId, (group, uid) => castVote(group, uid, restaurantIds, round, () => random));
}
export function removeNomination(roomId: string, memberId: string, name: string) {
  return changeRoom(roomId, memberId, (group, uid) => changePreferences(group, uid, {
    favorites: group.preferences[uid].favorites.filter((favorite) => restaurantNameKey(favorite) !== restaurantNameKey(name)),
  }));
}
export function submitResultFeedback(roomId: string, memberId: string, happy: boolean) {
  return changeRoom(roomId, memberId, (group, uid) => {
    const previous = group.feedback[uid];
    recordFeedback(group, uid, happy);
    return previous?.happy === happy ? [] : [{ name: "winner_satisfaction_submitted", parameters: {
      happy, response_changed: Boolean(previous),
      response_count: Object.keys(group.feedback).length,
      happy_count: Object.values(group.feedback).filter((response) => response.happy).length,
    } }];
  });
}
export async function getRoomState(roomId: string): Promise<RoomState | null> {
  const user = await currentUser();
  const snapshot = await getDoc(roomRef(roomId));
  return snapshot.exists() ? roomView(groupData(snapshot.data()), roomId, user.uid) : null;
}
export function subscribeRoomState(roomId: string, onChange: (state: RoomState | null) => void, onError?: (error: Error) => void): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | undefined;
  function emitError(error: unknown) {
    if (!stopped) onError?.(new Error(userErrorMessage(error, "Unable to load room. Please try again.")));
  }
  void currentUser().then((user) => {
    if (stopped) return;
    unsubscribe = onSnapshot(roomRef(roomId), (snapshot) => {
      if (stopped) return;
      try { onChange(snapshot.exists() ? roomView(groupData(snapshot.data()), roomId, user.uid) : null); }
      catch (error) { emitError(error); }
    }, emitError);
  }).catch(emitError);
  return () => { stopped = true; unsubscribe?.(); };
}

async function accountUser() {
  await auth.authStateReady();
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new RoomError("Sign in to access your profile.");
  return auth.currentUser;
}
export async function getProfile(): Promise<Profile> {
  const user = await accountUser();
  const snapshot = await getDoc(doc(db, "profiles", user.uid));
  return snapshot.exists() ? validateProfile(snapshot.data()) : defaultProfile(user.displayName ?? "");
}
export async function saveProfile(input: Profile): Promise<Profile> {
  const user = await accountUser();
  const profile = validateProfile(input);
  await setDoc(doc(db, "profiles", user.uid), profile);
  return profile;
}
