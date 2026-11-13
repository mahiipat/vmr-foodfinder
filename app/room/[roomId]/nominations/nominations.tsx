"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_BUDGET_RANGES,
  budgetRangeLabels,
  groupDietaryNeeds,
  markMemberReadyForVoting,
  nominatePlace,
  submitPreferences,
  subscribeRoomState,
  type BudgetRange,
  type RoomState,
} from "../../../../backend/AppBackend";
import { getMemberSession } from "../../../../lib/foodfinder";
import { trackEvent, trackScreen } from "../../../../lib/analytics";
import { lookupDietary, type DietaryTag } from "../../../../lib/dietary";
import type { PlaceResult } from "../../../../lib/places";
import RestaurantSearch from "../../../components/restaurantSearch";
import RestaurantCard from "../../../components/restaurantCard";
import DietaryNeedsPicker from "../../../components/dietaryNeedsPicker";
import { useGroupCenter } from "../../../components/useGroupCenter";

export default function Nominations({ roomId }: { roomId: string }) {
  const router = useRouter();
  const session = useMemo(() => getMemberSession(roomId), [roomId]);
  const memberId = session?.memberId || "";
  const memberName = session?.name || "";
  const [state, setState] = useState<RoomState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const center = useGroupCenter(state?.room);

  useEffect(() => {
    void trackScreen("nominations");
  }, []);

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
    void trackEvent("budget_ranges_updated", { selected_range_count: nextRanges.length });
  }

  async function toggleBudgetRange(range: BudgetRange) {
    const exists = selectedBudgetRanges.includes(range);
    const nextRanges = exists
      ? selectedBudgetRanges.filter((item) => item !== range)
      : [...selectedBudgetRanges, range];

    await saveBudgetRanges(nextRanges);
  }

  async function saveDietaryNeeds(nextNeeds: DietaryTag[]) {
    if (!memberId) return;

    await submitPreferences(roomId, memberId, {
      dietaryNeeds: nextNeeds,
      budgetRanges: selectedBudgetRanges,
      favorites: [],
    });
    void trackEvent("dietary_needs_updated", { need_count: nextNeeds.length });
  }

  // typed name, used when Google search is unavailable or can't find the place
  async function addRestaurant(restaurantName: string) {
    if (!memberId || !restaurantName.trim()) return;

    await submitPreferences(roomId, memberId, {
      favorites: [restaurantName.trim()],
      budgetRanges: selectedBudgetRanges,
    });

    void trackEvent("restaurant_nominated", { source: "typed" });
  }

  // picked from Google Places search; looks up Yelp dietary info before saving
  async function addPlace(place: PlaceResult) {
    if (!memberId) return;

    const dietary = await lookupDietary(place);
    await nominatePlace(roomId, memberId, {
      ...place,
      dietaryTags: dietary.tags,
      dietaryChecked: dietary.checked,
      yelpUrl: dietary.yelpUrl,
    });

    void trackEvent("restaurant_nominated", {
      source: "google_places",
      dietary_info_found: dietary.checked,
    });
  }

  async function markReady() {
    if (!memberId || !state || state.options.length === 0) return;

    await submitPreferences(roomId, memberId, {
      favorites: [],
      budgetRanges: selectedBudgetRanges,
    });

    await markMemberReadyForVoting(roomId, memberId, true);
    void trackEvent("ready_to_vote");
  }

  if (!loaded) {
    return <main className="min-h-screen bg-[#F0EADF] p-10">Loading...</main>;
  }

  const restaurants = state?.options || [];
  const myDietaryNeeds = myPreference?.dietaryNeeds || [];
  const dietaryNeeds = groupDietaryNeeds(state?.preferences || []);
  const nominatedPlaceIds = restaurants.flatMap((restaurant) => restaurant.placeId ? [restaurant.placeId] : []);
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
            Suggest your favorite places. We&apos;ll narrow down the options to fit
            everyone&apos;s budget range.{" "}
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

            <DietaryNeedsPicker
              selected={myDietaryNeeds}
              onChange={(next) => void saveDietaryNeeds(next)}
              disabled={!memberId}
            />
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

            <RestaurantSearch
              center={center}
              disabled={!memberId}
              nominatedPlaceIds={nominatedPlaceIds}
              onAddPlace={addPlace}
              onAddName={addRestaurant}
            />

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
              {restaurants.length} currently match everyone&apos;s range
            </p>

            {restaurants.length === 0 && (
              <p className="mt-8 text-sm italic text-[#777466]">
                No restaurants available yet.
              </p>
            )}

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {restaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  dietaryNeeds={dietaryNeeds}
                />
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
              ? "You&apos;re ready! Waiting for everyone else."
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
                You&apos;re ready to vote!
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
