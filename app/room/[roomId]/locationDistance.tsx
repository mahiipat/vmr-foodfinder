"use client";
import { useState } from "react";
import type { RoomData } from "../../../lib/foodfinder";

export default function LocationDistance({
    room,
    onUpdate,
}: {
    room: RoomData;
    onUpdate: (room: RoomData) => void;
}) {
    const [enabled, setEnabled] = useState(Boolean(room.distanceCapMiles));
    const [status, setStatus] = useState("");

    function useLocation() {
        setStatus("Requesting location...");

        if (!navigator.geolocation) {
            setStatus("Location unavailable. Enter an address below.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                onUpdate({
                    ...room,
                    hostLocation: {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        address: "Current location",
                    },
                });

                setStatus("Location set from your device.");
            },
            () => {
                setStatus("Location permission unavailable or denied. Enter an address below.");
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
            }
        );
    }

    return (
        <section className="mt-12 border-t border-[#343329]/30 pt-8">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">
                Distance preferences
            </p>

            <h2 className="mt-4 font-serif text-4xl">
                Keep it close.
            </h2>

            <label className="mt-6 flex items-center gap-3 text-sm">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                        const checked = e.target.checked;
                        setEnabled(checked);

                        onUpdate({
                            ...room,
                            distanceCapMiles: checked
                                ? room.distanceCapMiles || 5
                                : null,
                        });
                    }}
                />
                Limit how far we travel
            </label>

            {enabled && (
                <div className="mt-5 space-y-4">
                    <button
                        type="button"
                        onClick={useLocation}
                        className="rounded-full border border-[#343329] px-6 py-3 text-xs"
                    >
                        Use my current location
                    </button>

                    <p role="status" className="text-xs text-[#68665A]">
                        {status}
                    </p>

                    <label className="block text-sm">
                        Or enter a starting location

                        <input
                            value={
                                room.hostLocation?.address === "Current location"
                                    ? ""
                                    : room.hostLocation?.address || ""
                            }
                            onChange={(e) =>
                                onUpdate({
                                    ...room,
                                    hostLocation: {
                                        address: e.target.value,
                                    },
                                })
                            }
                            placeholder="Address, city or ZIP code"
                            className="mt-2 w-full border-b bg-transparent p-3"
                        />
                    </label>

                    <label className="block text-sm">
                        Maximum distance (miles)

                        <input
                            type="number"
                            min="0.1"
                            step="0.5"
                            value={room.distanceCapMiles || 5}
                            onChange={(e) =>
                                onUpdate({
                                    ...room,
                                    distanceCapMiles: Math.max(
                                        0.1,
                                        Number(e.target.value) || 0.1
                                    ),
                                })
                            }
                            className="mt-2 w-full border-b bg-transparent p-3"
                        />
                    </label>

                    <p className="text-xs text-[#68665A]">
                        Distance filtering applies when restaurant coordinatesare available. Manual addresses require backend geocoding.
                    </p>
                </div>
            )}
        </section>
    );
}