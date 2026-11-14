"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createGroup as createGroupRecord } from "../backend/AppBackend";
import { trackEvent, trackScreen } from "../lib/analytics";

export default function Home() {
    const router = useRouter();
    const [groupName, setGroupName] = useState("");
    const [groupLocation, setGroupLocation] = useState("");
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError] = useState("");

    useEffect(() => {
        void trackScreen("home");
    }, []);

    async function useCurrentLocation() {
        if (!navigator.geolocation) {
            setLocationError("Your browser does not support location services.");
            return;
        }

        setLocationLoading(true);
        setLocationError("");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;

                try {
                    // Convert device coordinates into a city or ZIP code
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
                    );

                    if (!response.ok) {
                        throw new Error("Unable to retrieve location");
                    }

                    const data = await response.json();

                    const city =
                        data.address?.city ||
                        data.address?.town ||
                        data.address?.village ||
                        data.address?.municipality ||
                        data.address?.county;

                    const state = data.address?.state;

                    if (city) {
                        setGroupLocation(state ? `${city}, ${state}` : city);
                    } else if (data.address?.postcode) {
                        setGroupLocation(data.address.postcode);
                    } else {
                        setLocationError(
                            "Couldn't identify your city. Please enter it manually."
                        );
                    }
                } catch (error) {
                    console.error(error);
                    setLocationError(
                        "Unable to identify your location. Please enter it manually."
                    );
                } finally {
                    setLocationLoading(false);
                }
            },
            () => {
                setLocationLoading(false);
                setLocationError(
                    "Location access denied or unavailable. Please enter your city or ZIP code."
                );
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    }

    async function createGroup() {
        if (!groupName.trim() || !groupLocation.trim()) return;
        void trackEvent("group_creation_started");
        const { roomId } = await createGroupRecord({ groupName: groupName.trim(), location: groupLocation.trim() });
        void trackEvent("group_created");
        router.push(`/room/${roomId}`);
    }

    return (
        <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
            <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden rounded-sm bg-[#F0EADF] shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.65),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.50),transparent_45%)]"></div>

                <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/10 px-6 py-6 sm:px-12">
                    <a href="#create" className="text-[10px] font-semibold uppercase tracking-[0.25em]"> Create Group </a>
                    <Link href="/" className="font-serif text-3xl tracking-tight"> foodfinder. </Link>
                    <Link href="/login" className="text-[10px] font-semibold uppercase tracking-[0.25em]"> Login </Link>
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
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Group location (City or ZIP code)"
                                        value={groupLocation}
                                        onChange={(e) => {
                                            setGroupLocation(e.target.value);
                                            setLocationError("");
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") createGroup();
                                        }}
                                        className="w-full border-b border-[#343329]/40 bg-transparent px-10 py-4 text-center text-base outline-none placeholder:text-[#8E8A7D] focus:border-[#343329]"
                                        required
                                    />

                                    <button
                                        type="button"
                                        onClick={useCurrentLocation}
                                        disabled={locationLoading}
                                        title="Use my current location"
                                        aria-label="Use my current location"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#343329] transition hover:text-[#566B48] disabled:opacity-40"
                                    >
                                        {locationLoading ? (
                                            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[#566B48] border-t-transparent" />
                                        ) : (
                                            <svg
                                                width="19"
                                                height="19"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <circle cx="12" cy="12" r="3" />
                                                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                                                <circle cx="12" cy="12" r="8" />
                                            </svg>
                                        )}
                                    </button>
                                </div>

                                {locationError && (
                                    <p role="alert" className="mt-2 text-xs text-[#9C5A49]">
                                        {locationError}
                                    </p>
                                )}

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
