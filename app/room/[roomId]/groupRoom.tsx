"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { joinGroup, subscribeRoomState } from "../../../backend/AppBackend";
import { getMemberSession, setMemberSession } from "../../../lib/foodfinder";

export default function GroupRoom({ roomId }: { roomId: string }) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
    const [currentMember, setCurrentMember] = useState(() => getMemberSession(roomId)?.name || "");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const stop = subscribeRoomState(roomId, (state) => {
            setMembers(state?.members || []);
        });

        return () => stop();
    }, [roomId]);

    async function handleJoinGroup() {
        const trimmed = name.trim();
        if (!trimmed) return;

        const existing = getMemberSession(roomId);
        const { memberId } = await joinGroup(roomId, trimmed, existing?.memberId);
        setMemberSession(roomId, { memberId, name: trimmed });
        setCurrentMember(trimmed);
        setName("");
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            alert("Unable to copy link. Please copy it from your browser.");
        }
    }

    return (
        <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
            <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden rounded-sm bg-[#F0EADF] shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.45),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.40),transparent_45%)]"></div>

                <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/10 px-6 py-6 sm:px-12">
                    <Link href="/" className="text-[10px] font-semibold uppercase tracking-[0.25em]"> ← Home </Link>
                    <Link href="/" className="font-serif text-3xl tracking-tight"> foodfinder. </Link>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.25em]"> Your Room </span>
                </nav>

                <section className="relative z-10 flex flex-col items-center px-6 pt-16 text-center sm:pt-20">
                    <p className="mb-6 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#777466]"> Your table is waiting </p>

                    <h1 className="font-serif text-[clamp(4rem,9vw,8rem)] font-normal uppercase leading-[0.85] tracking-[-0.055em]">
                        Gather
                        <span className="mt-2 block"> Together. </span>
                    </h1>

                    <p className="mt-8 max-w-sm text-sm leading-7 text-[#68665A]">
                        Great meals start with great company. Invite your friends,
                        join the table, and find your next favorite spot.
                    </p>

                    <div className="mt-8 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-[#777466]"> Room Code </span>
                            <span className="font-mono text-sm tracking-[0.15em]"> {roomId} </span>
                        </div>

                        <button onClick={copyLink} className="rounded-full border border-[#343329] px-9 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:bg-[#343329] hover:text-white">
                            {copied ? "✓ Link Copied" : "Copy Invite Link"}
                        </button>
                    </div>
                </section>

                <section className="relative z-10 mx-auto mt-20 grid max-w-4xl gap-14 px-8 pb-28 md:grid-cols-2 md:gap-20">
                    <div className="border-t border-[#343329]/25 pt-8">
                        <p className="mb-4 text-[10px] uppercase tracking-[0.3em] text-[#777466]"> 01 / Join the table </p>
                        <h2 className="font-serif text-4xl"> Make yourself at home. </h2>
                        <p className="mt-3 text-sm leading-6 text-[#68665A]"> Enter your name to join the group. No account required. </p>

                        <input
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleJoinGroup(); }}
                            className="mt-7 w-full border-b border-[#343329]/40 bg-transparent px-2 py-4 text-base outline-none placeholder:text-[#8E8A7D] focus:border-[#343329]"
                        />

                        <button onClick={handleJoinGroup} disabled={!name.trim()} className="mt-6 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#565344] disabled:cursor-not-allowed disabled:opacity-40">
                            Join Group →
                        </button>
                        {currentMember && (
                            <p className="mt-4 text-center text-xs text-[#68665A]">
                                ✓ You're joining as {currentMember}
                            </p>
                        )}
                    </div>

                    <div className="border-t border-[#343329]/25 pt-8">
                        <p className="mb-4 text-[10px] uppercase tracking-[0.3em] text-[#777466]"> 02 / Your company </p>
                        <h2 className="font-serif text-4xl"> The guest list. </h2>
                        <p className="mt-3 text-sm leading-6 text-[#68665A]"> Everyone at your table, all in one place. </p>

                        <div className="mt-7 min-h-28">
                            {members.length === 0 ? (
                                <p className="border-b border-[#343329]/20 py-5 text-sm italic text-[#8E8A7D]"> No guests yet. Be the first to join. </p>
                            ) : (
                                <div>
                                    {members.map((member, index) => (
                                        <div key={member.id} className="flex items-center justify-between border-b border-[#343329]/20 py-4">
                                            <span className="font-serif text-2xl"> {member.name} </span>
                                            <span className="text-[10px] uppercase tracking-[0.2em] text-[#777466]"> Guest {String(index + 1).padStart(2, "0")} </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-[#777466]"> {members.length} {members.length === 1 ? "guest" : "guests"} at the table </p>
                    </div>
                </section>

                <section className="relative z-10 mx-auto max-w-4xl px-8 pb-24 text-center">
                    <div className="border-t border-[#343329]/25 pt-10">
                        <p className="mb-4 text-[10px] uppercase tracking-[0.3em] text-[#777466]"> The next step </p>
                        <h2 className="font-serif text-4xl sm:text-5xl"> What's on the menu? </h2>
                        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-[#68665A]">
                            Time to nominate your favorite restaurants and discover where everyone wants to eat.
                        </p>

                        <button onClick={() => router.push(`/room/${roomId}/nominations`)} disabled={!currentMember} className="mt-8 rounded-full bg-[#343329] px-10 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#565344] disabled:cursor-not-allowed disabled:opacity-40">
                            Continue to Nominations →
                        </button>
                    </div>
                </section>

                <footer className="relative z-10 flex items-center justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
                    <span> Made for good company </span>
                    <span> FoodFinder © 2026 </span>
                </footer>
            </div>
        </main>
    );
}
