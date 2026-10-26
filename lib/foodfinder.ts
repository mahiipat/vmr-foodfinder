export type MemberSession = {
    memberId: string;
    name: string;
};

export function getMemberSession(roomId: string): MemberSession | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = sessionStorage.getItem(`foodfinder-member-${roomId}`);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<MemberSession>;
        if (!parsed.memberId || !parsed.name) {
            return null;
        }

        return {
            memberId: parsed.memberId,
            name: parsed.name,
        };
    } catch {
        return null;
    }
}

export function setMemberSession(roomId: string, session: MemberSession) {
    sessionStorage.setItem(`foodfinder-member-${roomId}`, JSON.stringify(session));
}
