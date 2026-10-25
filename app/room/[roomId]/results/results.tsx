"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoom, RoomData } from "../../../../lib/foodfinder";

export default function Results({ roomId }: { roomId: string }) {
    const router = useRouter();
    const [room, setRoom] = useState<RoomData>({ members: [], budget: 30, restaurants: [], votes: {} });
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setRoom(getRoom(roomId));
        setLoaded(true);
    }, [roomId]);

    const eligible = room.restaurants.filter((r) => r.price <= room.budget);
    const rankings = eligible.map((restaurant) => ({
        ...restaurant,
        count: Object.values(room.votes).filter((ids) => ids.includes(restaurant.id)).length,
    })).sort((a, b) => b.count - a.count);

    const totalVotes = Object.keys(room.votes).length;
    const maxVotes = rankings.length ? rankings[0].count : 0;
    const winners = maxVotes > 0 ? rankings.filter((r) => r.count === maxVotes) : [];
    const winner = winners.length === 1 ? winners[0] : null;

    if (!loaded) return <main className="min-h-screen bg-[#F0EADF] p-10">Loading...</main>;

    return (
        <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
            <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden bg-[#F0EADF] shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.45),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.40),transparent_45%)]"></div>

                <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/15 px-6 py-6 sm:px-12">
                    <button onClick={() => router.push(`/room/${roomId}/vote`)} className="text-[10px] uppercase tracking-[0.2em]"> ← Voting </button>
                    <span className="font-serif text-3xl">foodfinder.</span>
                    <span className="text-[10px] uppercase tracking-[0.2em]"> Results </span>
                </nav>

                <section className="relative z-10 px-6 pt-20 text-center">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#777466]"> The moment of truth </p>
                    <h1 className="mt-5 font-serif text-[clamp(4rem,9vw,8rem)] uppercase leading-[0.85] tracking-[-0.05em]"> The verdict. </h1>
                    <p className="mx-auto mt-8 max-w-md text-sm leading-7 text-[#68665A]"> Your group's preferences, all in one place. Here's how the votes stack up. </p>
                </section>

                <section className="relative z-10 mx-auto mt-16 max-w-3xl px-8 pb-16 text-center">
                    <div className="border-y border-[#343329]/30 py-14">
                        {totalVotes === 0 ? (
                            <>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]"> Awaiting votes </p>
                                <h2 className="mt-5 font-serif text-5xl"> No votes yet. </h2>
                            </>
                        ) : winner ? (
                            <>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]"> Currently in the lead </p>
                                <h2 className="mt-6 font-serif text-5xl sm:text-7xl">{winner.name}</h2>
                                <p className="mt-5 text-sm text-[#68665A]">{winner.location || "Location not provided"} · Approx. ${winner.price}/person</p>
                                <p className="mt-3 text-xs text-[#777466]">{winner.count} {winner.count === 1 ? "vote" : "votes"}</p>
                                {/****/}
                                {/^https?:\/\//i.test(winner.website) && <a href={winner.website} target="_blank" rel="noopener noreferrer" className="mt-7 inline-block rounded-full border border-[#343329] px-8 py-3 text-[10px] uppercase tracking-[0.2em]"> Restaurant Website </a>}
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]"> It's a tie </p>
                                <h2 className="mt-5 font-serif text-5xl"> More than one favorite. </h2>
                                <p className="mt-5 text-sm text-[#68665A]">{winners.map((r) => r.name).join(" · ")}</p>
                                <p className="mt-3 text-xs text-[#777466]">Each has {maxVotes} votes. Your group will need to break the tie.</p>
                            </>
                        )}
                    </div>
                </section>

                <section className="relative z-10 mx-auto max-w-3xl px-8 pb-24">
                    <div className="flex items-center justify-between">
                        <h3 className="font-serif text-4xl"> The full results. </h3>
                        <span className="text-xs text-[#777466]">{totalVotes} votes cast</span>
                    </div>

                    {rankings.length === 0 && <p className="mt-8 text-sm text-[#777466]">No eligible restaurants yet.</p>}

                    <div className="mt-8 space-y-8">
                        {rankings.map((restaurant, index) => (
                            <div key={restaurant.id}>
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-serif text-2xl">{String(index + 1).padStart(2, "0")} / {restaurant.name}</p>
                                        <p className="mt-2 text-xs text-[#777466]">Approx. ${restaurant.price}/person · {restaurant.location || "Location not provided"}</p>
                                    </div>
                                    <span className="text-sm">{restaurant.count} {restaurant.count === 1 ? "vote" : "votes"}</span>
                                </div>
                                <div className="mt-3 h-2 w-full bg-[#343329]/10">
                                    <div className="h-full bg-[#747A60] transition-all" style={{ width: `${totalVotes ? (restaurant.count / totalVotes) * 100 : 0}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-16 flex flex-wrap justify-center gap-4">
                        <button onClick={() => router.push(`/room/${roomId}/vote`)} className="rounded-full border border-[#343329] px-8 py-4 text-[10px] uppercase tracking-[0.2em]"> Back to Voting </button>
                        <button onClick={() => router.push("/")} className="rounded-full bg-[#343329] px-8 py-4 text-[10px] uppercase tracking-[0.2em] text-white"> Start Another Group → </button>
                    </div>
                </section>

                <footer className="relative z-10 flex justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
                    <span> Made for good company </span>
                    <span> FoodFinder © 2026 </span>
                </footer>
            </div>
        </main>
    );
}