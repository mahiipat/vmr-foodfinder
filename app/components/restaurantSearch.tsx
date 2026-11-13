"use client";
import { useEffect, useState } from "react";
import { placePhotoUrl, priceLevelLabel, type GroupCenter, type PlaceResult } from "../../lib/places";

type Props = {
    center: GroupCenter | null;
    disabled?: boolean;
    // restaurants already on the list, so their card says "Added"
    nominatedPlaceIds: string[];
    onAddPlace: (place: PlaceResult) => Promise<void>;
    // fallback when Google search isn't available or can't find the place
    onAddName: (name: string) => Promise<void>;
};

// Empty box: restaurants closest to the group. Typing: search by name.
// If search isn't configured it turns into the plain "type a name" input.
export default function RestaurantSearch({ center, disabled, nominatedPlaceIds, onAddPlace, onAddName }: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PlaceResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [unavailable, setUnavailable] = useState(false);
    const [addingId, setAddingId] = useState("");
    const trimmed = query.trim();
    // depend on the numbers, not the center object, so a re-render doesn't trigger a new search
    const latitude = center?.latitude;
    const longitude = center?.longitude;

    useEffect(() => {
        if (unavailable || trimmed.length === 1 || (!trimmed && latitude === undefined)) return;

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/places/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: trimmed, latitude, longitude }),
                    signal: controller.signal,
                });
                if (res.status === 503) {
                    setUnavailable(true);
                    return;
                }
                const data = await res.json();
                setResults(res.ok ? data.places ?? [] : []);
                setError(res.ok ? "" : "Search isn't working right now. Try again or add the name below.");
            } catch {
                // aborted by a newer search, or offline
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, trimmed ? 350 : 0);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [trimmed, latitude, longitude, unavailable]);

    async function addPlace(place: PlaceResult) {
        setAddingId(place.placeId);
        try {
            await onAddPlace(place);
        } finally {
            setAddingId("");
        }
    }

    async function addName() {
        if (!trimmed) return;
        await onAddName(trimmed);
        setQuery("");
    }

    if (unavailable) {
        return (
            <div className="mt-6">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addName(); }}
                    placeholder="Restaurant name"
                    className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"
                />
                <button
                    onClick={() => void addName()}
                    disabled={disabled || !trimmed}
                    className="mt-7 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] uppercase tracking-[0.2em] text-white hover:bg-[#565344] disabled:opacity-40"
                >
                    Add Nomination +
                </button>
            </div>
        );
    }

    const heading = trimmed
        ? `Results for "${trimmed}"`
        : center ? `Closest to ${center.label}` : "Search for a restaurant";

    return (
        <div className="mt-6">
            <input
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value.trim() && !center) setResults([]);
                }}
                placeholder="Search restaurants by name"
                autoComplete="off"
                className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"
            />

            <p className="mt-5 text-[10px] uppercase tracking-[0.25em] text-[#777466]">
                {heading}{loading && " · Searching..."}
            </p>
            {error && <p className="mt-2 text-xs text-[#9C5A49]">{error}</p>}

            <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {results.map((place) => {
                    const added = nominatedPlaceIds.includes(place.placeId);
                    const details = [
                        place.cuisine,
                        priceLevelLabel(place.priceLevel),
                        place.distanceMiles !== null ? `${place.distanceMiles.toFixed(1)} mi` : "",
                    ].filter(Boolean);

                    return (
                        <div key={place.placeId} className="flex items-center gap-4 border border-[#343329]/15 bg-white/20 p-3">
                            {place.photoName ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={placePhotoUrl(place.photoName, 160)} alt="" loading="lazy" className="h-16 w-16 shrink-0 object-cover" />
                            ) : (
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-[#343329]/10 font-serif text-2xl text-[#777466]">
                                    {place.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-serif text-lg">{place.name}</p>
                                <p className="text-xs text-[#68665A]">{details.join(" · ")}</p>
                                <p className="truncate text-xs text-[#777466]">
                                    {place.rating !== null && `★ ${place.rating.toFixed(1)} (${place.userRatingCount ?? 0}) · `}
                                    {place.address}
                                </p>
                            </div>
                            <button
                                onClick={() => void addPlace(place)}
                                disabled={disabled || added || addingId !== ""}
                                className="shrink-0 rounded-full border border-[#343329] px-4 py-2 text-[10px] uppercase tracking-[0.15em] hover:bg-[#343329] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                {added ? "Added" : addingId === place.placeId ? "Adding..." : "Add +"}
                            </button>
                        </div>
                    );
                })}

                {!loading && trimmed.length > 1 && results.length === 0 && !error && (
                    <p className="py-4 text-sm italic text-[#777466]">No restaurants found.</p>
                )}
            </div>

            {trimmed.length > 1 && (
                <button
                    onClick={() => void addName()}
                    disabled={disabled}
                    className="mt-3 text-xs text-[#68665A] underline disabled:opacity-40"
                >
                    Can&apos;t find it? Add &quot;{trimmed}&quot; without details
                </button>
            )}
        </div>
    );
}
