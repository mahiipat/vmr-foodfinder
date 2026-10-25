"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoom, saveRoom, getMember, RoomData } from "../../../../lib/foodfinder";

export default function Nominations({ roomId }: { roomId: string }) {
    const router = useRouter();
    const [room, setRoom] = useState<RoomData>({ members: [], budget: 30, restaurants: [], votes: {} });
    const [member, setCurrentMember] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [location, setLocation] = useState("");
    const [website, setWebsite] = useState("");

    useEffect(() => {
        setRoom(getRoom(roomId));
        setCurrentMember(getMember(roomId));
        setLoaded(true);
    }, [roomId]);

    function updateRoom(next: RoomData) {
        setRoom(next);
        saveRoom(roomId, next);
    }

    function addRestaurant() {
        if (!member || !name.trim() || !price || Number(price) <= 0) return;
        const restaurant = {
            id: crypto.randomUUID(),
            name: name.trim(),
            price: Number(price),
            location: location.trim(),
            website: website.trim(),
            nominatedBy: member,
        };

        updateRoom({ ...room, restaurants: [...room.restaurants, restaurant], votes: {} });
        setName("");
        setPrice("");
        setLocation("");
        setWebsite("");
    }

    function removeRestaurant(id: string) {
        updateRoom({ ...room, restaurants: room.restaurants.filter((r) => r.id !== id), votes: {} });
    }

    const eligible = room.restaurants.filter((r) => r.price <= room.budget);
    const excluded = room.restaurants.filter((r) => r.price > room.budget);

    if (!loaded) return <main className="min-h-screen bg-[#F0EADF] p-10">Loading...</main>;

    return (
        <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
            <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden bg-[#F0EADF] shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.35),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.35),transparent_45%)]"></div>

                <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/15 px-6 py-6 sm:px-12">
                    <button onClick={() => router.push(`/room/${roomId}`)} className="text-[10px] uppercase tracking-[0.2em]"> ← Your Room </button>
                    <span className="font-serif text-3xl">foodfinder.</span>
                    <span className="text-[10px] uppercase tracking-[0.2em]"> Nominations </span>
                </nav>

                <section className="relative z-10 px-6 pt-20 text-center">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#777466]"> The possibilities </p>
                    <h1 className="mt-5 font-serif text-[clamp(4rem,9vw,8rem)] uppercase leading-[0.85] tracking-[-0.05em]"> On the menu. </h1>
                    <p className="mx-auto mt-8 max-w-md text-sm leading-7 text-[#68665A]"> Suggest your favorite places. We'll narrow down the options to fit the group's budget. </p>
                </section>

                <section className="relative z-10 mx-auto mt-20 grid max-w-5xl gap-14 px-8 pb-20 md:grid-cols-2">
                    <div className="border-t border-[#343329]/30 pt-8">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]"> 01 / Set your limits </p>
                        <h2 className="mt-4 font-serif text-4xl"> The budget. </h2>
                        <p className="mt-3 text-sm text-[#68665A]"> Maximum estimated price per person. </p>
                        <div className="mt-8 flex items-center gap-4">
                            <span className="font-serif text-4xl">$</span>
                            <input type="number" min="1" value={room.budget} onChange={(e) => updateRoom({ ...room, budget: Math.max(1, Number(e.target.value) || 1), votes: {} })} className="w-full border-b border-[#343329]/40 bg-transparent px-2 py-3 font-serif text-3xl outline-none"/>
                        </div>
                        <p className="mt-4 text-xs text-[#777466]"> Restaurants above this amount will be excluded from voting. </p>
                    </div>

                    <div className="border-t border-[#343329]/30 pt-8">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]"> 02 / Your suggestions </p>
                        <h2 className="mt-4 font-serif text-4xl"> Add a restaurant. </h2>
                        <p className="mt-3 text-sm text-[#68665A]"> Nominating as {member || "Guest"}. </p>

                        <div className="mt-6 space-y-3">
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant name" className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"/>
                            <input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Estimated price per person ($)" className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"/>
                            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Neighborhood or address" className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"/>
                            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website URL (optional)" className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"/>
                        </div>

                        <button onClick={addRestaurant} disabled={!member || !name.trim() || Number(price) <= 0} className="mt-7 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] uppercase tracking-[0.2em] text-white hover:bg-[#565344] disabled:opacity-40">
                            Add Nomination +
                        </button>
                        {!member && <p className="mt-3 text-xs text-[#9C5A49]">Join the group room before nominating.</p>}
                    </div>
                </section>

                <section className="relative z-10 mx-auto max-w-5xl px-8 pb-20">
                    <div className="border-t border-[#343329]/30 pt-8">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]"> 03 / The shortlist </p>
                        <h2 className="mt-4 font-serif text-4xl"> The contenders. </h2>
                        <p className="mt-3 text-sm text-[#68665A]">{eligible.length} within budget · {excluded.length} excluded</p>

                        {room.restaurants.length === 0 && <p className="mt-8 text-sm italic text-[#777466]"> No restaurants nominated yet. </p>}

                        <div className="mt-8 grid gap-5 md:grid-cols-2">
                            {room.restaurants.map((restaurant) => (
                                <div key={restaurant.id} className="border border-[#343329]/20 bg-white/20 p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <h3 className="font-serif text-3xl">{restaurant.name}</h3>
                                        <span className="font-serif text-2xl">${restaurant.price}</span>
                                    </div>
                                    <p className="mt-3 text-sm text-[#68665A]">{restaurant.location || "Location not provided"}</p>
                                    <p className="mt-2 text-xs text-[#777466]">Nominated by {restaurant.nominatedBy}</p>
                                    <p className={`mt-5 text-[10px] uppercase tracking-[0.2em] ${restaurant.price <= room.budget ? "text-[#566B48]" : "text-[#9C5A49]"}`}>
                                        {restaurant.price <= room.budget ? "✓ Within budget" : "Over budget · Excluded"}
                                    </p>
                                    <div className="mt-5 flex gap-5">
                                        {/^https?:\/\//i.test(restaurant.website) && <a href={restaurant.website} target="_blank" rel="noopener noreferrer" className="text-xs underline">Website</a>}
                                        <button onClick={() => removeRestaurant(restaurant.id)} className="text-xs underline">Remove</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="relative z-10 px-8 pb-24 text-center">
                    <h2 className="font-serif text-5xl"> Ready to decide? </h2>
                    <p className="mt-4 text-sm text-[#68665A]"> Time to let everyone have their say. </p>
                    <button onClick={() => router.push(`/room/${roomId}/vote`)} disabled={eligible.length === 0 || !member} className="mt-8 rounded-full bg-[#343329] px-10 py-4 text-[11px] uppercase tracking-[0.2em] text-white hover:bg-[#565344] disabled:opacity-40">
                        Continue to Voting →
                    </button>
                </section>

                <footer className="relative z-10 flex justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
                    <span> Made for good company </span>
                    <span> FoodFinder © 2026 </span>
                </footer>
            </div>
        </main>
    );
}