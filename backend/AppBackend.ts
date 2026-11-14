import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  arrayUnion,
  writeBatch,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";

type PriceLevel =
  | "PRICE_LEVEL_FREE"
  | "PRICE_LEVEL_INEXPENSIVE"
  | "PRICE_LEVEL_MODERATE"
  | "PRICE_LEVEL_EXPENSIVE"
  | "PRICE_LEVEL_VERY_EXPENSIVE";

export type BudgetRange =
  | "UNDER_10"
  | "TEN_TO_THIRTY"
  | "THIRTY_TO_SIXTY"
  | "SIXTY_PLUS";

export type PreferenceInput = {
  budgetRanges?: BudgetRange[];
  favorites?: string[];
  readyToVote?: boolean;
};

export type MemberDistance = {
  location: HostLocation | null;
  distanceCapMiles: number | null;
};

type Preference = {
  memberId: string;
  budgetRanges: BudgetRange[];
  favorites: string[];
  readyToVote?: boolean;
  memberDistance?: MemberDistance;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  priceLevel?: PriceLevel;
  budgetRange: BudgetRange;
  priceLabel: string;
  distanceMiles: number;
  rating: number;
  reviewCount: number;
  lat?: number;
  lng?: number;
};

type PlacesApiRestaurant = {
  id: string;
  name: string;
  cuisine: string;
  priceLevel?: PriceLevel;
  distanceMiles: number;
  rating: number;
  userRatingCount: number;
};

export type RoomState = {
  room: Record<string, unknown>;
  members: Array<{ id: string; name: string }>;
  preferences: Preference[];
  memberDistances: Record<string, MemberDistance>;
  options: Array<Restaurant & { votes: number }>;
  winner: (Restaurant & { votes: number }) | null;
  votesByMember: Record<string, string[]>;
  readyMemberIds: string[];
  allMembersReadyToVote: boolean;
  allMembersVoted: boolean;
  hasTie: boolean;
  distanceCapMiles: number | null;
  hostLocation: { lat?: number; lng?: number; address?: string } | null;
  tieMode: "random" | "runoff" | null;
  tieWinnerId: string | null;
  runoffRoundId: string | null;
  runoffOptionIds: string[];
  runoffVotesByMember: Record<string, string>;
  runoffRankings: Array<Restaurant & { votes: number }>;
  runoffAllMembersVoted: boolean;
  runoffHasTie: boolean;
  runoffWinner: (Restaurant & { votes: number }) | null;
  satisfactionByMember: Record<string, boolean>;
};

export const ALL_BUDGET_RANGES: BudgetRange[] = [
  "UNDER_10",
  "TEN_TO_THIRTY",
  "THIRTY_TO_SIXTY",
  "SIXTY_PLUS",
];

export const budgetRangeLabels: Record<BudgetRange, string> = {
  UNDER_10: "Under $10",
  TEN_TO_THIRTY: "$10 to $30",
  THIRTY_TO_SIXTY: "$30 to $60",
  SIXTY_PLUS: "$60+",
};

const priceLevelToBudgetRange: Record<PriceLevel, BudgetRange> = {
  PRICE_LEVEL_FREE: "UNDER_10",
  PRICE_LEVEL_INEXPENSIVE: "UNDER_10",
  PRICE_LEVEL_MODERATE: "TEN_TO_THIRTY",
  PRICE_LEVEL_EXPENSIVE: "THIRTY_TO_SIXTY",
  PRICE_LEVEL_VERY_EXPENSIVE: "SIXTY_PLUS",
};

const MOCK_PLACES_API_RESULTS: PlacesApiRestaurant[] = [
  {
    id: "rumis-kitchen",
    name: "Rumi's Kitchen",
    cuisine: "Mediterranean",
    priceLevel: "PRICE_LEVEL_MODERATE",
    distanceMiles: 0.8,
    rating: 4.7,
    userRatingCount: 1800,
  },
  {
    id: "kimball-house",
    name: "Kimball House",
    cuisine: "American",
    priceLevel: "PRICE_LEVEL_EXPENSIVE",
    distanceMiles: 1.1,
    rating: 4.5,
    userRatingCount: 1200,
  },
  {
    id: "no-mas-cantina",
    name: "No Mas! Cantina",
    cuisine: "Mexican",
    priceLevel: "PRICE_LEVEL_INEXPENSIVE",
    distanceMiles: 1.3,
    rating: 4.3,
    userRatingCount: 900,
  },
  {
    id: "le-colonial",
    name: "Le Colonial",
    cuisine: "Vietnamese",
    priceLevel: "PRICE_LEVEL_EXPENSIVE",
    distanceMiles: 1.5,
    rating: 4.6,
    userRatingCount: 1100,
  },
  {
    id: "ecco",
    name: "Ecco",
    cuisine: "Italian",
    distanceMiles: 1.6,
    rating: 4.4,
    userRatingCount: 1000,
  },
];

const MOCK_RESTAURANTS: Restaurant[] = MOCK_PLACES_API_RESULTS.map((place) => {
  const priceLevel = place.priceLevel;
  const budgetRange = priceLevel
    ? priceLevelToBudgetRange[priceLevel]
    : "TEN_TO_THIRTY";

  return {
    id: place.id,
    name: place.name,
    cuisine: place.cuisine,
    priceLevel,
    budgetRange,
    priceLabel: budgetRangeLabels[budgetRange],
    distanceMiles: place.distanceMiles,
    rating: place.rating,
    reviewCount: place.userRatingCount,
  };
});

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function slug(input: string): string {
  return normalize(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function restaurantDocId(nameOrId: string): string {
  return slug(nameOrId) || `custom-${uuid()}`;
}

function resolveRestaurant(nameOrId: string): Restaurant {
  const key = normalize(nameOrId);
  const exact = MOCK_RESTAURANTS.find(
    (r) => r.id === key || normalize(r.name) === key,
  );
  if (exact) {
    return exact;
  }

  return {
    id: restaurantDocId(nameOrId),
    name: nameOrId,
    cuisine: "Custom",
    priceLevel: "PRICE_LEVEL_MODERATE",
    budgetRange: "TEN_TO_THIRTY",
    priceLabel: budgetRangeLabels.TEN_TO_THIRTY,
    distanceMiles: 1,
    rating: 4,
    reviewCount: 0,
  };
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }

    const key = normalize(trimmed);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function isBudgetRange(value: unknown): value is BudgetRange {
  return (
    value === "UNDER_10" ||
    value === "TEN_TO_THIRTY" ||
    value === "THIRTY_TO_SIXTY" ||
    value === "SIXTY_PLUS"
  );
}

function toBudgetRanges(value: unknown): BudgetRange[] | undefined {
  if (Array.isArray(value)) {
    const ranges = value.filter(isBudgetRange);
    return ranges.length ? Array.from(new Set(ranges)) : undefined;
  }

  if (typeof value === "number") {
    if (value <= 1) return ["UNDER_10"];
    if (value === 2) return ["UNDER_10", "TEN_TO_THIRTY"];
    if (value === 3) return ["UNDER_10", "TEN_TO_THIRTY", "THIRTY_TO_SIXTY"];
    return [...ALL_BUDGET_RANGES];
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const maybeRanges = (value as { budgetRanges?: unknown }).budgetRanges;
  if (Array.isArray(maybeRanges)) {
    const ranges = maybeRanges.filter(isBudgetRange);
    if (ranges.length) {
      return Array.from(new Set(ranges));
    }
  }

  const candidate = value as { min?: unknown; max?: unknown };
  const min = typeof candidate.min === "number" ? candidate.min : 1;
  const max = typeof candidate.max === "number" ? candidate.max : 4;

  return ALL_BUDGET_RANGES.filter((_, index) => {
    const tier = index + 1;
    return tier >= Math.min(min, max) && tier <= Math.max(min, max);
  });
}

function passesBudgetRanges(
  restaurant: Restaurant,
  preferences: Preference[],
): boolean {
  return preferences.every((pref) =>
    pref.budgetRanges.length === 0 ||
    pref.budgetRanges.includes(restaurant.budgetRange),
  );
}

export async function createGroup(
  input: {
    groupName?: string;
    location?: string;
  } = {},
) {
  const roomRef = await addDoc(collection(db, "rooms"), {
    groupName: input.groupName || "Untitled Group",
    location: input.location || "Unknown",
    createdAt: serverTimestamp(),
  });

  return { roomId: roomRef.id, joinPath: `/join/${roomRef.id}` };
}

export async function joinGroup(
  roomId: string,
  name = "Anonymous",
  memberId = uuid(),
) {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error("Room not found. Check the room code.");

  await setDoc(doc(db, "rooms", roomId, "members", memberId), {
    name,
    joinedAt: serverTimestamp(),
  }, { merge: true });

  return { memberId };
}

export async function submitPreferences(
  roomId: string,
  memberId: string,
  input: PreferenceInput,
) {
  const prefRef = doc(db, "rooms", roomId, "preferences", memberId);
  const existingSnap = await getDoc(prefRef);

  const existingFavorites = existingSnap.exists()
    ? ((existingSnap.get("favorites") as string[] | undefined) ?? [])
    : [];
  
  const nextFavorites = input.favorites === undefined
    ? dedupeNames(existingFavorites)
    : dedupeNames(input.favorites);

  const existingBudgetRanges = existingSnap.exists()
    ? toBudgetRanges(existingSnap.get("budgetRanges") ?? existingSnap.get("budgetCap"))
    : undefined;
  const nextBudgetRanges =
    toBudgetRanges(input.budgetRanges) ??
    existingBudgetRanges ??
    [...ALL_BUDGET_RANGES];

  const existingReadyToVote = existingSnap.exists()
    ? Boolean(existingSnap.get("readyToVote"))
    : false;

  await setDoc(
    prefRef,
    {
      budgetRanges: nextBudgetRanges,
      favorites: nextFavorites,
      readyToVote:
        typeof input.readyToVote === "boolean"
          ? input.readyToVote
          : existingReadyToVote,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const nominatedRestaurants = dedupeNames(input.favorites ?? []).map((name) =>
    resolveRestaurant(name),
  );

  await Promise.all(
    nominatedRestaurants.map((restaurant) =>
      setDoc(
        doc(db, "rooms", roomId, "restaurants", restaurant.id),
        {
          ...restaurant,
          nominatedByMemberIds: arrayUnion(memberId),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
}

export type HostLocation = { lat?: number; lng?: number; address?: string };

export async function updateMemberDistance(
  roomId: string,
  memberId: string,
  input: MemberDistance,
): Promise<void> {
  if (!memberId) throw new Error("Join the group before saving a location.");
  const cap = input.distanceCapMiles;
  if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) {
    throw new Error("Enter a valid distance greater than zero.");
  }
  await setDoc(doc(db, "rooms", roomId, "preferences", memberId), {
    memberDistance: {
      location: input.location,
      distanceCapMiles: cap,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function updateRoomDistance(
  roomId: string,
  input: { distanceCapMiles: number | null; hostLocation: HostLocation | null },
) {
  await setDoc(doc(db, "rooms", roomId), {
    distanceCapMiles: input.distanceCapMiles,
    hostLocation: input.hostLocation,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function markMemberReadyForVoting(
  roomId: string,
  memberId: string,
  readyToVote = true,
) {
  await submitPreferences(roomId, memberId, { readyToVote });
}

export async function submitVotes(
  roomId: string,
  memberId: string,
  restaurantIds: string[],
) {
  await setDoc(
    doc(db, "rooms", roomId, "votes", memberId),
    {
      restaurantIds,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const [votesSnap, restaurantsSnap] = await Promise.all([
    getDocs(collection(db, "rooms", roomId, "votes")),
    getDocs(collection(db, "rooms", roomId, "restaurants")),
  ]);

  const voteCount = new Map<string, number>();
  for (const vote of votesSnap.docs) {
    const ids = (vote.get("restaurantIds") as string[] | undefined) || [];
    for (const restaurantId of ids) {
      voteCount.set(restaurantId, (voteCount.get(restaurantId) || 0) + 1);
    }
  }

  const batch = writeBatch(db);
  for (const restaurant of restaurantsSnap.docs) {
    batch.set(
      restaurant.ref,
      {
        votes: voteCount.get(restaurant.id) || 0,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

export async function chooseTieBreaker(
  roomId: string,
  mode: "random" | "runoff",
  candidateIds: string[],
  expectedRoundId: string | null = null,
): Promise<void> {
  const uniqueIds = [...new Set(candidateIds)];
  if (uniqueIds.length < 2) throw new Error("At least two tied restaurants are required.");

  const roomRef = doc(db, "rooms", roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found.");
    const currentMode = snap.get("tieMode") as string | undefined;
    const currentRound = (snap.get("runoffRoundId") as string | undefined) || null;
    if (currentMode && currentRound !== expectedRoundId) {
      throw new Error("A tie-break decision has already been made. Refresh the page.");
    }
    if (currentMode === "random") {
      throw new Error("A winner has already been selected.");
    }
    if (currentMode === "runoff" && expectedRoundId === null) {
      throw new Error("A runoff has already started.");
    }

    if (mode === "random") {
      const winnerId = uniqueIds[Math.floor(Math.random() * uniqueIds.length)];
      transaction.update(roomRef, {
        tieMode: "random", tieWinnerId: winnerId,
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.update(roomRef, {
        tieMode: "runoff", tieWinnerId: null,
        runoffRoundId: uuid(), runoffOptionIds: uniqueIds,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export async function resetTieBreaker(
  roomId: string,
  expectedMode: "random" | "runoff",
  expectedRoundId: string | null,
): Promise<void> {
  const roomRef = doc(db, "rooms", roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error("Room not found.");
    const mode = snap.get("tieMode") ?? null;
    const roundId = snap.get("runoffRoundId") ?? null;
    if (mode !== expectedMode || roundId !== expectedRoundId) {
      throw new Error("The tie-breaker changed. Please refresh and try again.");
    }
    transaction.update(roomRef, {
      tieMode: null,
      tieWinnerId: null,
      runoffRoundId: null,
      runoffOptionIds: [],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function submitRunoffVote(
  roomId: string,
  roundId: string,
  memberId: string,
  restaurantId: string,
): Promise<void> {
  const roomRef = doc(db, "rooms", roomId);
  const voteRef = doc(db, "rooms", roomId, "runoffRounds", roundId, "votes", memberId);
  await runTransaction(db, async (transaction) => {
    const room = await transaction.get(roomRef);
    if (!room.exists() || room.get("tieMode") !== "runoff" || room.get("runoffRoundId") !== roundId) {
      throw new Error("This runoff is no longer active.");
    }
    const ids = room.get("runoffOptionIds") as string[] | undefined;
    if (!ids?.includes(restaurantId)) throw new Error("Invalid runoff restaurant.");
    transaction.set(voteRef, { restaurantId, updatedAt: serverTimestamp() });
  });
}

export async function submitSatisfaction(
  roomId: string,
  memberId: string,
  winnerId: string,
  decisionKey: string,
  happy: boolean,
): Promise<void> {
  if (!memberId || !winnerId || !decisionKey) throw new Error("Missing feedback details.");
  const roomRef = doc(db, "rooms", roomId);
  const feedbackRef = doc(db, "rooms", roomId, "satisfaction", memberId);
  await runTransaction(db, async (transaction) => {
    const room = await transaction.get(roomRef);
    if (!room.exists()) throw new Error("Room not found.");
    const mode = room.get("tieMode") as string | undefined;
    const roundId = (room.get("runoffRoundId") as string | undefined) ?? null;
    const currentKey = mode === "random"
      ? `random:${room.get("tieWinnerId")}`
      : mode === "runoff" ? `runoff:${roundId}` : `original:${winnerId}`;
    if (currentKey !== decisionKey || (mode === "random" && room.get("tieWinnerId") !== winnerId)) {
      throw new Error("The final result changed. Refresh and try again.");
    }
    transaction.set(feedbackRef, {
      winnerId, decisionKey, happy, updatedAt: serverTimestamp(),
    });
  });
}

export async function getRoomState(roomId: string): Promise<RoomState | null> {
  const roomRef = doc(db, "rooms", roomId);
  const [roomSnap, memberSnap, prefSnap, voteSnap, restaurantSnap, satisfactionSnap] = await Promise.all([
    getDoc(roomRef),
    getDocs(collection(db, "rooms", roomId, "members")),
    getDocs(collection(db, "rooms", roomId, "preferences")),
    getDocs(collection(db, "rooms", roomId, "votes")),
    getDocs(collection(db, "rooms", roomId, "restaurants")),
    getDocs(collection(db, "rooms", roomId, "satisfaction")),
  ]);

  if (!roomSnap.exists()) {
    return null;
  }

  const preferences: Preference[] = prefSnap.docs.map((item) => ({
    memberId: item.id,
    budgetRanges:
      toBudgetRanges(item.get("budgetRanges") ?? item.get("budgetCap")) ??
      [...ALL_BUDGET_RANGES],
    favorites: dedupeNames((item.get("favorites") as string[] | undefined) || []),
    readyToVote: Boolean(item.get("readyToVote")),
    memberDistance: (() => {
      const raw = item.get("memberDistance") as MemberDistance | undefined;
      return {
        location: raw?.location ?? null,
        distanceCapMiles: typeof raw?.distanceCapMiles === "number" && raw.distanceCapMiles > 0
          ? raw.distanceCapMiles : null,
      };
    })(),
  }));

  const members = memberSnap.docs.map((item) => ({
    id: item.id,
    name: item.get("name") || "Anonymous",
  }));
  const votes = voteSnap.docs.map((item) => ({
    memberId: item.id,
    restaurantIds: (item.get("restaurantIds") as string[] | undefined) || [],
  }));

  const allRestaurants: Restaurant[] = restaurantSnap.docs.map((item) => {
    const priceLevel = item.get("priceLevel") as PriceLevel | undefined;
    const budgetRange =
      (item.get("budgetRange") as BudgetRange | undefined) ||
      (priceLevel ? priceLevelToBudgetRange[priceLevel] : "TEN_TO_THIRTY");

    return {
      id: item.id,
      name: (item.get("name") as string | undefined) || item.id,
      cuisine: (item.get("cuisine") as string | undefined) || "Custom",
      priceLevel,
      budgetRange,
      priceLabel:
        (item.get("priceLabel") as string | undefined) ||
        budgetRangeLabels[budgetRange],
      distanceMiles: (item.get("distanceMiles") as number | undefined) ?? 1,
      rating: (item.get("rating") as number | undefined) ?? 4,
      reviewCount: (item.get("reviewCount") as number | undefined) ?? 0,
      lat: item.get("lat") as number | undefined,
      lng: item.get("lng") as number | undefined,
    };
  });

  const fallbackRestaurants = Array.from(
    new Set(
      preferences
        .flatMap((pref) => pref.favorites)
        .filter(Boolean),
    ),
  ).map((name) => resolveRestaurant(name));

  const activeNames = new Set(preferences.flatMap((pref) => pref.favorites).map(normalize));
  const sourceRestaurants = [
    ...allRestaurants.filter((restaurant) => activeNames.has(normalize(restaurant.name))),
    ...fallbackRestaurants.filter((restaurant) =>
      !allRestaurants.some((saved) => normalize(saved.name) === normalize(restaurant.name))
    ),
  ];

  const rawCap = roomSnap.get("distanceCapMiles");
  const distanceCapMiles = typeof rawCap === "number" && rawCap > 0 ? rawCap : null;
  const rawLocation = roomSnap.get("hostLocation") as HostLocation | null | undefined;
  const hostLocation = rawLocation ?? null;

  const memberDistances: Record<string, MemberDistance> = {};
  for (const pref of preferences) {
    memberDistances[pref.memberId] = pref.memberDistance ?? {
      location: null,
      distanceCapMiles: null,
    };
  }

  const options = sourceRestaurants.filter((restaurant) => {
    if (!passesBudgetRanges(restaurant, preferences)) return false;
 
    return preferences.every((pref) => {
      const limit = pref.memberDistance?.distanceCapMiles;
      if (limit == null) return true;
      const start = pref.memberDistance?.location;
      if (typeof start?.lat !== "number" || typeof start.lng !== "number" ||
          typeof restaurant.lat !== "number" || typeof restaurant.lng !== "number") {
        return true;
      }
      return milesBetween(start.lat, start.lng, restaurant.lat, restaurant.lng) <= limit;
    });
  });

  const voteCount = new Map<string, number>();
  const votesByMember: Record<string, string[]> = {};
  for (const vote of votes) {
    votesByMember[vote.memberId] = vote.restaurantIds;
    for (const restaurantId of vote.restaurantIds) {
      voteCount.set(restaurantId, (voteCount.get(restaurantId) || 0) + 1);
    }
  }

  const ranked = options
    .map((restaurant) => ({
      ...restaurant,
      votes: voteCount.get(restaurant.id) || 0,
    }))
    .sort((a, b) => b.votes - a.votes || b.rating - a.rating);

  const readyMemberIds = preferences
    .filter((pref) => pref.readyToVote)
    .map((pref) => pref.memberId);

  const allMembersReadyToVote =
    members.length > 0 && members.every((member) => readyMemberIds.includes(member.id));

  const allMembersVoted =
    members.length > 0 &&
    members.every((member) => (votesByMember[member.id] || []).length > 0);

  const hasTie =
    ranked.length > 1 && ranked[0].votes > 0 && ranked[0].votes === ranked[1].votes;

  const tieMode = (roomSnap.get("tieMode") as "random" | "runoff" | undefined) ?? null;
  const tieWinnerId = (roomSnap.get("tieWinnerId") as string | undefined) ?? null;
  const runoffRoundId = (roomSnap.get("runoffRoundId") as string | undefined) ?? null;
  const runoffOptionIds = (roomSnap.get("runoffOptionIds") as string[] | undefined) ?? [];
  const runoffVotesByMember: Record<string, string> = {};
  if (tieMode === "runoff" && runoffRoundId) {
    const runoffSnap = await getDocs(collection(db, "rooms", roomId, "runoffRounds", runoffRoundId, "votes"));
    for (const vote of runoffSnap.docs) {
      const id = vote.get("restaurantId") as string | undefined;
      if (id && runoffOptionIds.includes(id)) runoffVotesByMember[vote.id] = id;
    }
  }
  const runoffRankings = ranked.filter((r) => runoffOptionIds.includes(r.id)).map((r) => ({
    ...r, votes: Object.values(runoffVotesByMember).filter((id) => id === r.id).length,
  })).sort((a, b) => b.votes - a.votes || b.rating - a.rating);
  const runoffAllMembersVoted = members.length > 0 &&
    members.every((member) => Boolean(runoffVotesByMember[member.id]));
  const runoffHasTie = runoffAllMembersVoted && runoffRankings.length > 1 &&
    runoffRankings[0].votes === runoffRankings[1].votes;
  const runoffWinner = runoffAllMembersVoted && !runoffHasTie ? runoffRankings[0] ?? null : null;

  const resolvedWinner = tieMode === "random"
    ? ranked.find((r) => r.id === tieWinnerId) ?? null
    : tieMode === "runoff" ? runoffWinner
    : allMembersVoted && !hasTie ? ranked[0] ?? null : null;
  const decisionKey = resolvedWinner
    ? tieMode === "random" ? `random:${tieWinnerId}`
      : tieMode === "runoff" ? `runoff:${runoffRoundId}`
      : `original:${resolvedWinner.id}`
    : null;
  const satisfactionByMember: Record<string, boolean> = {};
  if (resolvedWinner && decisionKey) {
    for (const feedback of satisfactionSnap.docs) {
      if (feedback.get("winnerId") === resolvedWinner.id &&
          feedback.get("decisionKey") === decisionKey &&
          members.some((member) => member.id === feedback.id) &&
          typeof feedback.get("happy") === "boolean") {
        satisfactionByMember[feedback.id] = feedback.get("happy") as boolean;
      }
    }
  }

  return {
    room: { id: roomSnap.id, ...roomSnap.data() },
    members,
    preferences,
    memberDistances,
    options: ranked,
    winner: ranked[0] || null,
    votesByMember,
    readyMemberIds,
    allMembersReadyToVote,
    allMembersVoted,
    hasTie,
    distanceCapMiles,
    hostLocation,
    tieMode, tieWinnerId, runoffRoundId, runoffOptionIds,
    runoffVotesByMember, runoffRankings, runoffAllMembersVoted,
    runoffHasTie, runoffWinner, satisfactionByMember,
  };
}

export function subscribeRoomState(
  roomId: string,
  onChange: (state: RoomState | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const watchers = [
    onSnapshot(doc(db, "rooms", roomId), emit, emitError),
    onSnapshot(collection(db, "rooms", roomId, "members"), emit, emitError),
    onSnapshot(collection(db, "rooms", roomId, "preferences"), emit, emitError),
    onSnapshot(collection(db, "rooms", roomId, "restaurants"), emit, emitError),
    onSnapshot(collection(db, "rooms", roomId, "votes"), emit, emitError),
    onSnapshot(collection(db, "rooms", roomId, "satisfaction"), emit, emitError),
  ];

  async function emit() {
    try {
      onChange(await getRoomState(roomId));
    } catch (error) {
      emitError(error);
    }
  }

  function emitError(error: unknown) {
    if (onError) {
      onError(error as Error);
    }
  }

  let watchedRound: string | null = null;
  let stopRunoff: Unsubscribe | null = null;
  const originalEmit = emit;
  const stopRoomRound = onSnapshot(doc(db, "rooms", roomId), (snap) => {
    const nextRound = (snap.get("runoffRoundId") as string | undefined) ?? null;
    if (nextRound === watchedRound) return;
    stopRunoff?.();
    watchedRound = nextRound;
    stopRunoff = nextRound
      ? onSnapshot(collection(db, "rooms", roomId, "runoffRounds", nextRound, "votes"), originalEmit, emitError)
      : null;
    void originalEmit();
  }, emitError);

  emit();
  return () => {
    watchers.forEach((stop) => stop());
    stopRoomRound();
    stopRunoff?.();
  };
}