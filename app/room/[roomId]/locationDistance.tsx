"use client";
import { useState } from "react";
import { updateRoomDistance, type RoomState, type HostLocation } from "../../../backend/AppBackend";

export default function LocationDistance({
  roomId,
  state,
  disabled = false,
}: {
  roomId: string;
  state: RoomState;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [addressDraft, setAddressDraft] = useState<string | null>(null);
  const [capDraft, setCapDraft] = useState<string | null>(null);
  const enabled = state.distanceCapMiles !== null;
  const location = state.hostLocation;

  async function save(cap: number | null, nextLocation: HostLocation | null) {
    setBusy(true);
    setStatus("");
    try {
      await updateRoomDistance(roomId, { distanceCapMiles: cap, hostLocation: nextLocation });
      setStatus("Distance preferences saved.");
    } catch (error) {
      console.error(error);
      setStatus("Unable to save location preferences. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function useLocation() {
    setStatus("Requesting location...");
    if (!navigator.geolocation) {
      setStatus("Location unavailable. Enter an address below.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void save(state.distanceCapMiles ?? 5, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: "Current location",
        });
        setAddressDraft(null);
      },
      () => setStatus("Location permission unavailable or denied. Enter an address below."),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <section className="mt-12 border-t border-[#343329]/30 pt-8">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">
        Distance preferences
      </p>
      <h2 className="mt-4 font-serif text-4xl">Keep it close.</h2>
      <label className="mt-6 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || disabled}
          onChange={(e) => void save(e.target.checked ? 5 : null, location)}
        />
        Limit how far we travel
      </label>
      {enabled && (
        <div className="mt-5 space-y-4">
          <button
            type="button"
            disabled={busy || disabled}
            onClick={useLocation}
            className="rounded-full border border-[#343329] px-6 py-3 text-xs disabled:opacity-40"
          >
            Use my current location
          </button>
          <p role="status" className="text-xs text-[#68665A]">{status}</p>
          <label className="block text-sm">
            Or enter a starting location
            <input
              value={addressDraft ?? (location?.address === "Current location" ? "" : location?.address ?? "")}
              disabled={busy || disabled}
              onChange={(e) => setAddressDraft(e.target.value)}
              placeholder="Address, city or ZIP code"
              className="mt-2 w-full border-b bg-transparent p-3"
            />
          </label>
          <button
            type="button"
            disabled={busy || disabled || addressDraft === null}
            onClick={() => { void save(state.distanceCapMiles, { address: addressDraft ?? "" }); setAddressDraft(null); }}
            className="rounded-full border border-[#343329] px-5 py-2 text-xs disabled:opacity-40"
          >Save starting location</button>
          <label className="block text-sm">
            Maximum distance (miles)
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={capDraft ?? String(state.distanceCapMiles ?? 5)}
              disabled={busy || disabled}
              onChange={(e) => setCapDraft(e.target.value)}
              onBlur={() => {
                if (capDraft !== null) {
                  void save(Math.max(0.1, Number(capDraft) || 0.1), location);
                  setCapDraft(null);
                }
              }}
              className="mt-2 w-full border-b bg-transparent p-3"
            />
          </label>
          <p className="text-xs text-[#68665A]">
            Distance limits are enforced only for restaurants with real coordinates and a device location.
            Manually entered addresses need geocoding, and the current mock restaurant data does not have coordinates.
          </p>
        </div>
      )}
    </section>
  );
}