"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { createGroup as createGroupRecord } from "../backend/AppBackend";

export default function Home() {
    const router = useRouter();
    const [groupName, setGroupName] = useState("");
    const [groupLocation, setGroupLocation] = useState("");

    function createGroup() {
        if (!groupName.trim() || !groupLocation.trim()) return;
        const id = crypto.randomUUID().slice(0, 8);
        localStorage.setItem(`foodfinder-location-${id}`, groupLocation.trim());
        router.push(`/room/${id}`);
    }

    return (
        <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
            <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden rounded-sm bg-[#F0EADF] shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.65),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.50),transparent_45%)]"></div>

                <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/10 px-6 py-6 sm:px-12">
                    <a href="#create" className="text-[10px] font-semibold uppercase tracking-[0.25em]"> Create Group </a>
                    <Link href="/" className="font-serif text-3xl tracking-tight"> foodfinder. </Link>
                    <a href="#about" className="text-[10px] font-semibold uppercase tracking-[0.25em]"> About </a>
                </nav>

                <section className="relative z-10 flex flex-col items-center px-6 pt-20 text-center sm:pt-24">
                    <p className="mb-7 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#777466]"> Good food. Better company. </p>

                    <h1 className="font-serif text-[clamp(4rem,10vw,9rem)] font-normal uppercase leading-[0.85] tracking-[-0.055em]">
                        Less Debating.
                        <span className="mt-2 block"> More Dining. </span>
                    </h1>

                    <p className="mt-9 max-w-sm text-sm leading-7 text-[#68665A]">
                        Your next favorite meal is just a group decision away.
                        Nominate, vote, and discover where to eat together.
                    </p>

                    <a href="#create" className="mt-8 rounded-full border border-[#343329] px-9 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:bg-[#343329] hover:text-white">
                        Get Started
                    </a>
                </section>

                <section id="create" className="relative z-10 mx-auto mt-20 max-w-md px-6 pb-28 text-center sm:mt-24">
                    <div className="border-t border-[#343329]/25 pt-10">
                        <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-[#777466]"> The first step </p>
                        <h2 className="font-serif text-4xl"> Gather your people. </h2>
                        <p className="mt-3 text-sm text-[#68665A]"> Create a room and invite your friends. No account needed. </p>

                        <div className="mt-9">
                            <input
                                type="text"
                                placeholder="Your group name"
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") createGroup(); }}
                                className="w-full border-b border-[#343329]/40 bg-transparent px-2 py-4 text-center text-base outline-none placeholder:text-[#8E8A7D] focus:border-[#343329]"
                            />
                            <div className="mt-6">
                                <input
                                    type="text"
                                    placeholder="Group location (City or ZIP code)"
                                    value={groupLocation}
                                    onChange={(e) => setGroupLocation(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") createGroup();
                                    }}
                                    className="w-full border-b border-[#343329]/40 bg-transparent px-2 py-4 text-center text-base outline-none placeholder:text-[#8E8A7D] focus:border-[#343329]"
                                    required
                                />
                                <p className="mt-2 text-xs text-[#777466]">
                                    * Required for matching restaurants near your group.
                                </p>
                            </div>
                            <button
                                onClick={createGroup}
                                disabled={!groupName.trim() || !groupLocation.trim()}
                                className="mt-7 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#565344] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Create Your Group →
                            </button>
                        </div>
                    </div>
                </section>

                <footer id="about" className="relative z-10 flex items-center justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
                    <span> Made for good company </span>
                    <span> FoodFinder © 2026 </span>
                </footer>
            </div>
        </main>
    );
}
