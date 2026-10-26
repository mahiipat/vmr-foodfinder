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

type Preference = {
  memberId: string;
  budgetRanges: BudgetRange[];
  favorites: string[];
  readyToVote?: boolean;
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
  options: Array<Restaurant & { votes: number }>;
  winner: (Restaurant & { votes: number }) | null;
  votesByMember: Record<string, string[]>;
  readyMemberIds: string[];
  allMembersReadyToVote: boolean;
  allMembersVoted: boolean;
  hasTie: boolean;
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

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function resolveRestaurant(nameOrId: string): Restaurant {
  const key = normalize(nameOrId);
  const exact = MOCK_RESTAURANTS.find(
    (r) => r.id === key || normalize(r.name) === key,
  );
  if (exact) {
    return exact;
  }
  // this needs to be done so that type script can be happy

  return {
    id: `custom-${uuid()}`,
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
  await setDoc(
    doc(db, "rooms", roomId),
    {
      groupName: "Untitled Group",
      location: "Unknown",
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(doc(db, "rooms", roomId, "members", memberId), {
    name,
    joinedAt: serverTimestamp(),
  });

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
  const nextFavorites = dedupeNames([
    ...existingFavorites,
    ...(input.favorites ?? []),
  ]);

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
}

export async function markMemberReadyForVoting(
  roomId: string,
  memberId: string,
  readyToVote = true,
) {
  await submitPreferences(roomId, memberId, { readyToVote, favorites: [] });
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
}

export async function getRoomState(roomId: string): Promise<RoomState | null> {
  const roomRef = doc(db, "rooms", roomId);
  const [roomSnap, memberSnap, prefSnap, voteSnap] = await Promise.all([
    getDoc(roomRef),
    getDocs(collection(db, "rooms", roomId, "members")),
    getDocs(collection(db, "rooms", roomId, "preferences")),
    getDocs(collection(db, "rooms", roomId, "votes")),
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
  }));

  const members = memberSnap.docs.map((item) => ({
    id: item.id,
    name: item.get("name") || "Anonymous",
  }));
  const votes = voteSnap.docs.map((item) => ({
    memberId: item.id,
    restaurantIds: (item.get("restaurantIds") as string[] | undefined) || [],
  }));

  const dedupedFavorites = Array.from(
    new Set(
      preferences
        .flatMap((pref) => pref.favorites)
        .filter(Boolean)
        .map((name) => normalize(name)),
    ),
  );

  const options = dedupedFavorites
    .map(resolveRestaurant)
    .filter((restaurant) => passesBudgetRanges(restaurant, preferences));

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

  return {
    room: { id: roomSnap.id, ...roomSnap.data() },
    members,
    preferences,
    options: ranked,
    winner: ranked[0] || null,
    votesByMember,
    readyMemberIds,
    allMembersReadyToVote,
    allMembersVoted,
    hasTie,
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
    onSnapshot(collection(db, "rooms", roomId, "votes"), emit, emitError),
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

  emit();
  return () => watchers.forEach((stop) => stop());
}
