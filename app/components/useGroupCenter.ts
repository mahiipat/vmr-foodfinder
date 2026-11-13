"use client";
import { useEffect, useState } from "react";
import { isValidCoordinate, type GroupCenter } from "../../lib/places";

// Where restaurant search and "x mi away" are measured from.
// Uses exact coordinates on the room if they exist (e.g. from location permission),
// otherwise looks up the city/ZIP the host typed when creating the group.
export function useGroupCenter(room?: Record<string, unknown> | null): GroupCenter | null {
    const location = typeof room?.location === "string" ? room.location.trim() : "";
    const latitude = room?.latitude;
    const longitude = room?.longitude;
    const hasExact = isValidCoordinate(latitude, longitude);
    const [geocoded, setGeocoded] = useState<{ query: string; center: GroupCenter } | null>(null);

    useEffect(() => {
        if (hasExact || !location || location === "Unknown") return;
        let cancelled = false;
        void loadCenter(location).then((center) => {
            if (!cancelled && center) setGeocoded({ query: location, center });
        });
        return () => {
            cancelled = true;
        };
    }, [hasExact, location]);

    if (hasExact) {
        return { latitude: latitude as number, longitude: longitude as number, label: location || "your group" };
    }
    return geocoded?.query === location ? geocoded.center : null;
}

async function loadCenter(location: string): Promise<GroupCenter | null> {
    // cache per tab so every page in the room doesn't look up the same city again
    const key = `foodfinder-center-${location.toLowerCase()}`;
    try {
        const cached = JSON.parse(sessionStorage.getItem(key) || "null");
        if (cached && isValidCoordinate(cached.latitude, cached.longitude)) return cached;
    } catch {
        // storage blocked or bad value, fall through to the lookup
    }

    try {
        const res = await fetch(`/api/places/geocode?${new URLSearchParams({ query: location })}`);
        if (!res.ok) return null;
        const { center } = (await res.json()) as { center?: GroupCenter };
        if (!center) return null;
        try {
            sessionStorage.setItem(key, JSON.stringify(center));
        } catch {
            // storage blocked, the center still works for this page
        }
        return center;
    } catch {
        return null;
    }
}
