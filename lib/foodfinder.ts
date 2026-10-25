export type Restaurant = {
    id: string;
    name: string;
    price: number;
    location: string;
    website: string;
    nominatedBy: string;
};

export type RoomData = {
    members: string[];
    budget: number;
    restaurants: Restaurant[];
    votes: Record<string, string>;
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