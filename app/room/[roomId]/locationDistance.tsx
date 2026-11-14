"use client";
import { useState } from "react";
import { updateMemberDistance, type RoomState, type HostLocation } from "../../../backend/AppBackend";
import { getMemberSession } from "../../../lib/foodfinder";

export default function LocationDistance({ roomId, state, disabled = false }: {
  roomId: string;
  state: RoomState;
  disabled?: boolean;
}) {
  const memberId = getMemberSession(roomId)?.memberId || "";
  const preference = state.memberDistances?.[memberId];
  const location = preference?.location ?? null;
  const cap = preference?.distanceCapMiles ?? null;
  const enabled = cap !== null;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [addressDraft, setAddressDraft] = useState<string | null>(null);
  const [capDraft, setCapDraft] = useState<string | null>(null);

  async function save(nextCap: number | null, nextLocation: HostLocation | null) {
    if (!memberId) return;
    setBusy(true);
    setStatus("");
    try {
      await updateMemberDistance(roomId, memberId, { distanceCapMiles: nextCap, location: nextLocation });
      setStatus("Your distance preferences are saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save preferences.");
    } finally {
      setBusy(false);
    }
  }

  function useLocation() {
    if (!navigator.geolocation) { setStatus("Location unavailable. Enter an address instead."); return; }
    setStatus("Requesting location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void save(cap ?? 5, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: "Current location",
        });
        setAddressDraft(null);
      },
      () => setStatus("Location denied or unavailable. Enter an address below."),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <section className="mt-12 border-t border-[#343329]/30 pt-8">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">Distance preferences</p>
      <h2 className="mt-4 font-serif text-4xl">Keep it close.</h2>
      <p className="mt-3 text-xs text-[#68665A]">Your personal travel limit. Other members can set their own.</p>
      <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-[#343329]">
        <input type="checkbox" checked={enabled} disabled={busy || disabled || !memberId} onChange={(event) => void save(event.target.checked ? 5 : null, location)} className="peer sr-only" />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#343329]/50 transition peer-checked:border-[#566B48] peer-checked:bg-[#566B48] peer-focus-visible:ring-2 peer-focus-visible:ring-[#566B48]/40">
          {enabled && <span className="text-xs text-white">✓</span>}
        </span>
        Limit how far I'll travel
      </label>
      {enabled && <div className="mt-5 space-y-4">
        <button type="button" disabled={busy || disabled || !memberId} onClick={useLocation} className="rounded-full border border-[#343329] px-6 py-3 text-xs transition hover:bg-[#343329] hover:text-white disabled:opacity-40">Use my current location</button>
        <label className="block text-sm">Or enter a starting location
          <input value={addressDraft ?? (location?.address === "Current location" ? "" : location?.address ?? "")} disabled={busy || disabled} onChange={(event) => setAddressDraft(event.target.value)} placeholder="Address, city or ZIP code" className="mt-2 w-full border-b border-[#343329]/40 bg-transparent p-3 outline-none" />
        </label>
        <button type="button" disabled={busy || disabled || !addressDraft?.trim()} onClick={() => { void save(cap, { address: addressDraft!.trim() }); setAddressDraft(null); }} className="rounded-full border border-[#343329] px-5 py-2 text-xs disabled:opacity-40">Save starting location</button>
        <label className="block text-sm">Maximum distance (miles)
          <input type="number" min="0.1" step="0.5" value={capDraft ?? String(cap ?? 5)} disabled={busy || disabled} onChange={(event) => setCapDraft(event.target.value)} onBlur={() => {
            if (capDraft !== null) {
              const next = Number(capDraft);
              if (Number.isFinite(next) && next > 0) void save(next, location);
              else setStatus("Enter a distance greater than zero.");
              setCapDraft(null);
            }
          }} className="mt-2 w-full border-b border-[#343329]/40 bg-transparent p-3 outline-none" />
        </label>
        <p className="text-xs leading-5 text-[#68665A]">Device location is required for accurate distance checks. Manually entered addresses need geocoding. Restaurants without coordinates cannot be distance-verified yet.</p>
      </div>}
      {status && <p role="status" className="mt-4 text-xs text-[#566B48]">{status}</p>}
    </section>
  );
}