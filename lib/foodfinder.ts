export type Restaurant = {
    id: string;
    name: string;
    price: number;
    location: string;
    website: string;
    nominatedBy: string;

    lat?: number;
    lng?: number;
    address?: string;
};

export type RoomData = {
    members: string[];
    budget: number;
    restaurants: Restaurant[];
    votes: Record<string, string[]>;

    hostLocation?: {
        lat?: number;
        lng?: number;
        address?: string;
    }

    distanceCapMiles?: number | null;
    tieMode?: "random" | "runoff";
    tieWinnerId?: string;
    needsMoreNominations?: boolean;
    readyMembers?: string[];
    satisfaction?: Record<string, boolean>;
};

export function getRoom(roomId: string): RoomData {
    const empty: RoomData = { members: [], budget: 30, restaurants: [], votes: {} };
    if (typeof window === "undefined") return empty;
    try {
        const saved = localStorage.getItem(`foodfinder-${roomId}`);
        return saved ? { ...empty, ...JSON.parse(saved) } : empty;
    } catch {
        return empty;
    }
}

export function saveRoom(roomId: string, room: RoomData) {
    localStorage.setItem(`foodfinder-${roomId}`, JSON.stringify(room));
}

export function getMember(roomId: string) {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(`foodfinder-member-${roomId}`) || "";
}

export function setMember(roomId: string, name: string) {
    sessionStorage.setItem(`foodfinder-member-${roomId}`, name);
}

export function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function eligibleRestaurants(room: RoomData) {
    return room.restaurants.filter((restaurant) => {
        if (restaurant.price > room.budget) return false;
        if (!room.distanceCapMiles) return true;
        const host = room.hostLocation;
        if (host?.lat == null || host.lng == null || restaurant.lat == null || restaurant.lng == null) {
      return true;
    }

    return (distanceMiles({ lat: host.lat, lng: host.lng }, { lat: restaurant.lat, lng: restaurant.lng }) <= room.distanceCapMiles);
    });
}