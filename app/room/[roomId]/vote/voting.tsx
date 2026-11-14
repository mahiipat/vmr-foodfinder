"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitVotes, submitRunoffVote, subscribeRoomState, type RoomState } from "../../../../backend/AppBackend";
import { getMemberSession } from "../../../../lib/foodfinder";
import { trackEvent, trackScreen } from "../../../../lib/analytics";

export default function Voting({ roomId }: { roomId: string }) {
    const router = useRouter();
    const [session, setSession] = useState<ReturnType<typeof getMemberSession>>(null);
    const [state, setState] = useState<RoomState | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const hasHydratedVote = useRef(false);
    const memberId = session?.memberId || "";
    const memberName = session?.name || "";

    useEffect(() => { setSession(getMemberSession(roomId)); }, [roomId]);
    useEffect(() => { void trackScreen("voting"); }, []);
    useEffect(() => {
        hasHydratedVote.current = false;
        const stop = subscribeRoomState(roomId, (next) => {
            setState(next);
            setLoaded(true);
            if (!next || !memberId || hasHydratedVote.current) return;
            setSelected(next.votesByMember[memberId] || []);
            hasHydratedVote.current = true;
        }, (err) => setError(err.message));
        return () => stop();
    }, [roomId, memberId]);

    const isRunoff = state?.tieMode === "runoff" && Boolean(state.runoffRoundId) && !state.runoffAllMembersVoted && !state.tieWinnerId;
    const eligible = isRunoff
        ? (state?.options || []).filter((r) => state?.runoffOptionIds.includes(r.id))
        : state?.options || [];
    const previousRunoffVote = memberId ? state?.runoffVotesByMember[memberId] || "" : "";
    const [runoffSelection, setRunoffSelection] = useState("");
    const currentRunoffSelection = runoffSelection || previousRunoffVote;
    useEffect(() => { setRunoffSelection(""); }, [state?.runoffRoundId]);

    function toggleRestaurant(id: string) {
        if (isRunoff) { setRunoffSelection(id); return; }
        setSelected((previous) => previous.includes(id) ? previous.filter((r) => r !== id) : [...previous, id]);
        void trackEvent("vote_selection_changed", { selected_restaurant_id: id });
    }

    async function submitVote() {
        if (!memberId || saving) return;
        setSaving(true);
        setError("");
        try {
            if (isRunoff) {
                if (!state?.runoffRoundId || !currentRunoffSelection) return;
                await submitRunoffVote(roomId, state.runoffRoundId, memberId, currentRunoffSelection);
                void trackEvent("runoff_vote_submitted");
            } else {
                if (selected.length === 0) return;
                await submitVotes(roomId, memberId, selected);
                void trackEvent("votes_submitted", { selected_restaurant_count: selected.length });
            }
            router.push(`/room/${roomId}/results`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to submit vote.");
        } finally { setSaving(false); }
    }

    if (!loaded) return <main className="min-h-screen bg-[#F0EADF] p-10">Loading...</main>;
    return (
        <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
            <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden bg-[#F0EADF] shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.35),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.35),transparent_45%)]" />
                <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/15 px-6 py-6 sm:px-12">
                    <button onClick={() => router.push(`/room/${roomId}/nominations`)} className="text-[10px] uppercase tracking-[0.2em]">← Nominations</button>
                    <span className="font-serif text-3xl">foodfinder.</span>
                    <span className="text-[10px] uppercase tracking-[0.2em]">{isRunoff ? "Runoff" : "Voting"}</span>
                </nav>
                <section className="relative z-10 px-6 pt-20 text-center">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#777466]">{isRunoff ? "The tie-breaker" : "The final say"}</p>
                    <h1 className="mt-5 font-serif text-[clamp(4rem,9vw,8rem)] uppercase leading-[0.85] tracking-[-0.05em]">{isRunoff ? "Runoff vote." : "Cast your vote."}</h1>
                    <p className="mx-auto mt-8 max-w-md text-sm leading-7 text-[#68665A]">{isRunoff ? "It's a tie! Choose one of the tied restaurants." : "Every opinion matters. Choose all restaurants you would be happy to visit."}</p>
                    <p className="mt-4 text-xs uppercase tracking-[0.2em] text-[#777466]">Voting as {memberName || "Guest"}</p>
                </section>
                <section className="relative z-10 mx-auto mt-16 max-w-3xl px-8 pb-24">
                    <div className="border-t border-[#343329]/30">
                        {eligible.length === 0 && <p className="py-10 text-center text-sm text-[#68665A]">No eligible restaurants. Return to nominations.</p>}
                        {eligible.map((restaurant, index) => {
                            const checked = isRunoff ? currentRunoffSelection === restaurant.id : selected.includes(restaurant.id);
                            return <button type="button" key={restaurant.id} onClick={() => toggleRestaurant(restaurant.id)} className={`flex w-full items-center justify-between gap-5 border-b border-[#343329]/25 px-4 py-7 text-left transition ${checked ? "bg-[#D9D9C5]/60" : "hover:bg-white/30"}`}>
                                <div className="flex items-center gap-6"><span className="text-[10px] text-[#777466]">{String(index + 1).padStart(2, "0")}</span><div><h2 className="font-serif text-3xl sm:text-4xl">{restaurant.name}</h2><p className="mt-2 text-xs text-[#68665A]">{restaurant.cuisine} · {restaurant.priceLabel}</p><p className="mt-2 text-xs text-[#777466]">⭐ {restaurant.rating.toFixed(1)} ({restaurant.reviewCount} ratings)</p></div></div>
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#343329] ${checked ? "bg-[#343329] text-white" : ""}`}>{checked && "✓"}</span>
                            </button>;
                        })}
                    </div>
                    <div className="mt-14 text-center">
                        <p className="text-sm text-[#68665A]">{isRunoff ? "Choose one restaurant for the runoff." : "Select as many restaurants as you like."}</p>
                        <button onClick={() => void submitVote()} disabled={saving || !memberId || eligible.length === 0 || (isRunoff ? !currentRunoffSelection : selected.length === 0)} className="mt-8 rounded-full bg-[#343329] px-12 py-4 text-[11px] uppercase tracking-[0.2em] text-white hover:bg-[#565344] disabled:opacity-40">{saving ? "Submitting..." : isRunoff ? "Submit Runoff Vote →" : "Submit My Vote →"}</button>
                        {!memberId && <p className="mt-4 text-xs text-[#9C5A49]">Join the group room before voting.</p>}
                        {error && <p role="alert" className="mt-4 text-xs text-[#9C5A49]">{error}</p>}
                    </div>
                </section>
                <footer className="relative z-10 flex justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12"><span>Made for good company</span><span>FoodFinder © 2026</span></footer>
            </div>
        </main>
    );
}