"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_BUDGET_RANGES,
  budgetRangeLabels,
  markMemberReadyForVoting,
  submitPreferences,
  subscribeRoomState,
  type BudgetRange,
  type RoomState,
} from "../../../../backend/AppBackend";
import { getMemberSession } from "../../../../lib/foodfinder";

export default function Nominations({ roomId }: { roomId: string }) {
  const router = useRouter();
  const session = useMemo(() => getMemberSession(roomId), [roomId]);
  const memberId = session?.memberId || "";
  const memberName = session?.name || "";
  const [state, setState] = useState<RoomState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const stop = subscribeRoomState(roomId, (nextState) => {
      setState(nextState);
      setLoaded(true);
    });

    return () => stop();
  }, [roomId]);

  const myPreference = useMemo(
    () => state?.preferences.find((pref) => pref.memberId === memberId),
    [state, memberId],
  );

  const selectedBudgetRanges = myPreference?.budgetRanges?.length
    ? myPreference.budgetRanges
    : ALL_BUDGET_RANGES;

  useEffect(() => {
    if (state?.allMembersReadyToVote) {
      router.push(`/room/${roomId}/vote`);
    }
  }, [state?.allMembersReadyToVote, roomId, router]);

  async function saveBudgetRanges(nextRanges: BudgetRange[]) {
    if (!memberId) return;

    await submitPreferences(roomId, memberId, {
      budgetRanges: nextRanges.length ? nextRanges : [...ALL_BUDGET_RANGES],
      favorites: [],
    });
  }

  async function toggleBudgetRange(range: BudgetRange) {
    const exists = selectedBudgetRanges.includes(range);
    const nextRanges = exists
      ? selectedBudgetRanges.filter((item) => item !== range)
      : [...selectedBudgetRanges, range];

    await saveBudgetRanges(nextRanges);
  }

  async function addRestaurant() {
    if (!memberId || !name.trim()) return;

    await submitPreferences(roomId, memberId, {
      favorites: [name.trim()],
      budgetRanges: selectedBudgetRanges,
    });

    setName("");
  }

  async function markReady() {
    if (!memberId || !state || state.options.length === 0) return;

    await submitPreferences(roomId, memberId, {
      favorites: [],
      budgetRanges: selectedBudgetRanges,
    });

    await markMemberReadyForVoting(roomId, memberId, true);
  }

  if (!loaded) {
    return <main className="min-h-screen bg-[#F0EADF] p-10">Loading...</main>;
  }

  const restaurants = state?.options || [];
  const waiting = Boolean(myPreference?.readyToVote);
  const readyCount = state?.readyMemberIds.length || 0;
  const memberCount = state?.members.length || 0;

  return (
    <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
      <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden bg-[#F0EADF] shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.35),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.35),transparent_45%)]"></div>

        <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/15 px-6 py-6 sm:px-12">
          <button
            onClick={() => router.push(`/room/${roomId}`)}
            className="text-[10px] uppercase tracking-[0.2em]"
          >
            {" "}
            ← Your Room{" "}
          </button>
          <span className="font-serif text-3xl">foodfinder.</span>
          <span className="text-[10px] uppercase tracking-[0.2em]">
            {" "}
            Nominations{" "}
          </span>
        </nav>

        <section className="relative z-10 px-6 pt-20 text-center">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#777466]">
            {" "}
            The possibilities{" "}
          </p>
          <h1 className="mt-5 font-serif text-[clamp(4rem,9vw,8rem)] uppercase leading-[0.85] tracking-[-0.05em]">
            {" "}
            On the menu.{" "}
          </h1>
          <p className="mx-auto mt-8 max-w-md text-sm leading-7 text-[#68665A]">
            {" "}
            Suggest your favorite places. We'll narrow down the options to fit
            everyone's budget range.{" "}
          </p>
        </section>

        <section className="relative z-10 mx-auto mt-20 grid max-w-5xl gap-14 px-8 pb-20 md:grid-cols-2">
          <div className="border-t border-[#343329]/30 pt-8">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">
              {" "}
              01 / Set your limits{" "}
            </p>
            <h2 className="mt-4 font-serif text-4xl"> Your budget ranges. </h2>
            <p className="mt-3 text-sm text-[#68665A]">
              {" "}
              Select one or more ranges. By default, all ranges are
              selected.{" "}
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3">
              {ALL_BUDGET_RANGES.map((range) => {
                const selected = selectedBudgetRanges.includes(range);

                return (
                  <label
                    key={range}
                    className="flex items-center gap-3 border border-[#343329]/20 px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => void toggleBudgetRange(range)}
                    />
                    <span className="text-sm">{budgetRangeLabels[range]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#343329]/30 pt-8">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">
              {" "}
              02 / Your suggestions{" "}
            </p>
            <h2 className="mt-4 font-serif text-4xl"> Add a restaurant. </h2>
            <p className="mt-3 text-sm text-[#68665A]">
              {" "}
              Nominating as {memberName || "Guest"}.{" "}
            </p>

            <div className="mt-6 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Restaurant name"
                className="w-full border-b border-[#343329]/30 bg-transparent px-2 py-3 outline-none"
              />
            </div>

            <button
              onClick={addRestaurant}
              disabled={!memberId || !name.trim()}
              className="mt-7 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] uppercase tracking-[0.2em] text-white hover:bg-[#565344] disabled:opacity-40"
            >
              Add Nomination +
            </button>

            {!memberId && (
              <p className="mt-3 text-xs text-[#9C5A49]">
                Join the group room before nominating.
              </p>
            )}
          </div>
        </section>

        <section className="relative z-10 mx-auto max-w-5xl px-8 pb-20">
          <div className="border-t border-[#343329]/30 pt-8">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">
              {" "}
              03 / The shortlist{" "}
            </p>
            <h2 className="mt-4 font-serif text-4xl"> The contenders. </h2>
            <p className="mt-3 text-sm text-[#68665A]">
              {restaurants.length} currently match everyone's range
            </p>

            {restaurants.length === 0 && (
              <p className="mt-8 text-sm italic text-[#777466]">
                No restaurants available yet.
              </p>
            )}

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {restaurants.map((restaurant) => (
                <div
                  key={restaurant.id}
                  className="border border-[#343329]/20 bg-white/20 p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-serif text-3xl">{restaurant.name}</h3>
                    <span className="text-xs uppercase tracking-[0.15em] text-[#68665A]">
                      {restaurant.priceLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#68665A]">
                    {restaurant.cuisine} · {restaurant.distanceMiles.toFixed(1)}{" "}
                    mi
                  </p>
                  <p className="mt-2 text-xs text-[#777466]">
                    ⭐ {restaurant.rating.toFixed(1)} ({restaurant.reviewCount}{" "}
                    ratings)
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 px-8 pb-24 text-center">
          <h2 className="font-serif text-5xl">
            {" "}
            {waiting ? "Waiting for your group." : "Ready to decide?"}{" "}
          </h2>
          <p className="mt-4 text-sm text-[#68665A]">
            {waiting
              ? "You're ready! Waiting for everyone else."
              : "Time to let everyone have their say."}
          </p>
          <p className="mt-3 text-xs text-[#777466]">
            {readyCount} of {memberCount} members ready
          </p>
          {!waiting ? (
            <button
              onClick={markReady}
              disabled={restaurants.length === 0 || !memberId}
              className="mt-8 rounded-full bg-[#343329] px-10 py-4 text-[11px] uppercase tracking-[0.2em] text-white hover:bg-[#565344] disabled:opacity-40"
            >
              Ready to Vote →
            </button>
          ) : (
            <div className="mt-8">
              <p className="font-serif text-2xl text-[#566B48]">
                You're ready to vote!
              </p>

              <p className="mt-4 text-xs text-[#777466]">
                Voting opens when everyone is ready.
              </p>
            </div>
          )}
        </section>

        <footer className="relative z-10 flex justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
          <span> Made for good company </span>
          <span> FoodFinder © 2026 </span>
        </footer>
      </div>
    </main>
  );
}
