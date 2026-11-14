"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  chooseTieBreaker,
  subscribeRoomState,
  submitSatisfaction,
  type RoomState,
} from "../../../../backend/AppBackend";
import { getMemberSession } from "../../../../lib/foodfinder";
import { trackEvent, trackScreen } from "../../../../lib/analytics";

export default function Results({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => { setMemberId(getMemberSession(roomId)?.memberId || ""); }, [roomId]);

  useEffect(() => { void trackScreen("results"); }, []);
  useEffect(() => {
    const stop = subscribeRoomState(roomId, (next) => {
      setState(next);
      setLoaded(true);
    }, (err) => setError(err.message));
    return () => stop();
  }, [roomId]);

  const rankings = state?.options || [];
  const totalVotes = Object.keys(state?.votesByMember || {}).filter(
    (id) => (state?.votesByMember[id] || []).length > 0,
  ).length;
  const tied = state?.hasTie && state.allMembersVoted;
  const runoffComplete = state?.tieMode === "runoff" && state.runoffAllMembersVoted;
  const randomWinner = state?.tieMode === "random"
    ? rankings.find((r) => r.id === state.tieWinnerId) || null : null;
  const finalWinner = randomWinner || (runoffComplete ? state?.runoffWinner : null) ||
    (state?.allMembersVoted && !state.hasTie ? state.winner : null);
  const candidateIds = state?.tieMode === "runoff" && runoffComplete && state.runoffHasTie
    ? state.runoffRankings.filter((r) => r.votes === state.runoffRankings[0]?.votes).map((r) => r.id)
    : rankings.filter((r) => r.votes > 0 && r.votes === rankings[0]?.votes).map((r) => r.id);
  const needsDecision = Boolean(tied && (!state?.tieMode || (runoffComplete && state.runoffHasTie)));

  const decisionKey = finalWinner
    ? state?.tieMode === "random" ? `random:${state.tieWinnerId}`
      : state?.tieMode === "runoff" ? `runoff:${state.runoffRoundId}`
      : `original:${finalWinner.id}`
    : null;
  const satisfaction = state?.satisfactionByMember || {};
  const responses = Object.values(satisfaction);
  const happyCount = responses.filter(Boolean).length;
  const myResponse = memberId && Object.prototype.hasOwnProperty.call(satisfaction, memberId)
    ? satisfaction[memberId] : null;

  async function saveFeedback(happy: boolean) {
    if (!finalWinner || !decisionKey || !memberId || feedbackSaving) return;
    setFeedbackSaving(true);
    setFeedbackError("");
    try {
      await submitSatisfaction(roomId, memberId, finalWinner.id, decisionKey, happy);
      void trackEvent("winner_satisfaction_submitted", { happy });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Could not save your response.");
    } finally {
      setFeedbackSaving(false);
    }
  }

  async function choose(mode: "random" | "runoff") {
    if (!state || saving || !needsDecision) return;
    setSaving(true);
    setError("");
    try {
      await chooseTieBreaker(roomId, mode, candidateIds,
        state.tieMode === "runoff" ? state.runoffRoundId : null);
      void trackEvent("tie_breaker_selected", { mode });
      if (mode === "runoff") router.push(`/room/${roomId}/vote`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve the tie.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <main className="min-h-screen bg-[#F0EADF] p-10">Loading...</main>;

  return (
    <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
      <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden bg-[#F0EADF] shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.45),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.40),transparent_45%)]" />
        <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/15 px-6 py-6 sm:px-12">
          <button onClick={() => { void trackEvent("return_to_voting"); router.push(`/room/${roomId}/vote`); }} className="text-[10px] uppercase tracking-[0.2em]">← Voting</button>
          <span className="font-serif text-3xl">foodfinder.</span>
          <span className="text-[10px] uppercase tracking-[0.2em]">Results</span>
        </nav>
        <section className="relative z-10 px-6 pt-20 text-center">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#777466]">The moment of truth</p>
          <h1 className="mt-5 font-serif text-[clamp(4rem,9vw,8rem)] uppercase leading-[0.85] tracking-[-0.05em]">The verdict.</h1>
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-7 text-[#68665A]">Your group&apos;s preferences, all in one place. Here&apos;s how the votes stack up.</p>
        </section>

        <section className="relative z-10 mx-auto mt-16 max-w-3xl px-8 pb-16 text-center">
          <div className="border-y border-[#343329]/30 py-14">
            {finalWinner ? (
              <div className="flex flex-col items-center gap-8">
                <div className="w-full border border-[#566B48]/40 bg-[#E4E8D8] px-6 py-9 sm:px-10">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#566B48]">
                    {state?.tieMode === "random" ? "It's a tie — a random winner was chosen!" : state?.tieMode === "runoff" ? "The runoff winner" : "We have a winner!"}
                  </p>
                  <h2 className="mt-5 font-serif text-5xl sm:text-6xl">{finalWinner.name}</h2>
                  <p className="mt-5 text-sm text-[#566B48]">{finalWinner.cuisine} · {finalWinner.priceLabel}</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-[#566B48]">
                    <span>Rating: {finalWinner.reviewCount > 0 ? `${finalWinner.rating.toFixed(1)} / 5 (${finalWinner.reviewCount} reviews)` : "Not available"}</span>
                    <span>{finalWinner.priceLabel}</span>
                    {finalWinner.lat !== undefined && finalWinner.lng !== undefined && (
                      <span>{finalWinner.distanceMiles.toFixed(1)} mi (estimated)</span>
                    )}
                  </div>
                </div>
                <div className="w-full max-w-xl border border-[#343329]/25 bg-[#F5F0E7] px-5 py-6 sm:px-8">
                  <h3 className="font-serif text-2xl text-[#343329]">Happy with this pick?</h3>
                  <p className="mt-2 text-xs text-[#68665A]">Let your group know what you think.</p>
                  {memberId ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button type="button" disabled={feedbackSaving} onClick={() => void saveFeedback(true)}
                        aria-pressed={myResponse === true}
                        className={`border px-4 py-3 text-sm transition disabled:opacity-50 ${myResponse === true ? "border-[#566B48] bg-[#C4D2B5] font-semibold" : "border-[#566B48]/35 bg-[#F0EADF] hover:bg-[#D7E1CC]"}`}>
                        👍 Yes!
                      </button>
                      <button type="button" disabled={feedbackSaving} onClick={() => void saveFeedback(false)}
                        aria-pressed={myResponse === false}
                        className={`border px-4 py-3 text-sm transition disabled:opacity-50 ${myResponse === false ? "border-[#9C5A49] bg-[#E8C9C2] font-semibold" : "border-[#566B48]/35 bg-[#F0EADF] hover:bg-[#E8C9C2]"}`}>
                        👎 Not really
                      </button>
                    </div>
                  ) : <p className="mt-4 text-sm text-[#9C5A49]">Join this group to submit feedback.</p>}
                  {myResponse !== null && <p className="mt-3 text-xs text-[#68665A]">Response saved. You can change it anytime.</p>}
                  {feedbackError && <p role="alert" className="mt-3 text-xs text-[#9C5A49]">{feedbackError}</p>}
                  <div className="mt-4 text-xs text-[#68665A]">
                    <strong>{happyCount}</strong> happy · <strong>{responses.length - happyCount}</strong> not happy · {responses.length} of {state?.members.length ?? 0} responded
                  </div>
                </div>
              </div>
            ) : totalVotes === 0 ? (
              <><p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">Awaiting votes</p><h2 className="mt-5 font-serif text-5xl">No votes yet.</h2></>
            ) : !state?.allMembersVoted ? (
              <><p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">Voting in progress</p><h2 className="mt-5 font-serif text-5xl">Waiting for everyone.</h2><p className="mt-5 text-sm text-[#68665A]">The final result will appear when everyone has voted.</p></>
            ) : state?.tieMode === "runoff" && !runoffComplete ? (
              <><p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">Runoff in progress</p><h2 className="mt-5 font-serif text-5xl">One more vote.</h2><p className="mt-5 text-sm text-[#68665A]">{Object.keys(state.runoffVotesByMember).length} of {state.members.length} members voted in the runoff.</p><button onClick={() => router.push(`/room/${roomId}/vote`)} className="mt-8 rounded-full bg-[#343329] px-9 py-4 text-[11px] uppercase tracking-[0.2em] text-white">Go to Runoff →</button></>
            ) : (
              <><p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">It&apos;s a tie</p><h2 className="mt-5 font-serif text-5xl">More than one favorite.</h2><p className="mt-5 text-sm text-[#68665A]">{state?.tieMode === "runoff" ? "The runoff ended in a tie too. Choose how to decide." : "Top restaurants are tied. How would you like to decide?"}</p></>
            )}

            {needsDecision && (
              <div className="mx-auto mt-10 grid max-w-xl grid-cols-2 gap-3 sm:gap-4">
                <button disabled={saving} onClick={() => void choose("random")} className="border border-[#A86B65]/45 bg-[#E8C9C2]/60 p-4 text-left transition hover:bg-[#E8C9C2] disabled:opacity-40 sm:p-6">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#777466]">Option 01</span>
                  <span className="mt-3 block font-serif text-xl sm:text-3xl">Random Winner</span>
                  <span className="mt-3 block text-xs leading-6 text-[#68665A]">Choose one tied restaurant at random. Everyone sees the same winner.</span>
                </button>
                <button disabled={saving} onClick={() => void choose("runoff")} className="border border-[#A86B65]/45 bg-[#E8C9C2]/60 p-4 text-left transition hover:bg-[#E8C9C2] disabled:opacity-40 sm:p-6">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#777466]">Option 02</span>
                  <span className="mt-3 block font-serif text-xl sm:text-3xl">Runoff Vote</span>
                  <span className="mt-3 block text-xs leading-6 text-[#68665A]">Vote again, this time only between the tied restaurants.</span>
                </button>
              </div>
            )}
            {error && <p role="alert" className="mt-5 text-sm text-[#9C5A49]">{error}</p>}
          </div>
        </section>

        <section className="relative z-10 mx-auto max-w-3xl px-8 pb-24">
          <div className="flex items-center justify-between"><h3 className="font-serif text-4xl">The full results.</h3><span className="text-xs text-[#777466]">{totalVotes} votes cast</span></div>
          {rankings.length === 0 && <p className="mt-8 text-sm text-[#777466]">No eligible restaurants yet.</p>}
          <div className="mt-8 space-y-8">
            {rankings.map((restaurant, index) => (
              <div key={restaurant.id}>
                <div className="flex items-center justify-between gap-4"><div><p className="font-serif text-2xl">{String(index + 1).padStart(2, "0")} / {restaurant.name}</p><p className="mt-2 text-xs text-[#777466]">{restaurant.priceLabel} · {restaurant.cuisine}</p></div><span className="text-sm">{restaurant.votes} {restaurant.votes === 1 ? "vote" : "votes"}</span></div>
                <div className="mt-3 h-2 w-full bg-[#343329]/10"><div className="h-full bg-[#747A60] transition-all" style={{ width: `${totalVotes ? (restaurant.votes / totalVotes) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
          {state?.tieMode === "runoff" && state.runoffRankings.length > 0 && (
            <div className="mt-14 border-t border-[#343329]/30 pt-10"><h3 className="font-serif text-4xl">Runoff results.</h3><div className="mt-7 space-y-4">{state.runoffRankings.map((r) => <div key={r.id} className="flex justify-between border-b border-[#343329]/15 pb-3"><span className="font-serif text-2xl">{r.name}</span><span>{r.votes} {r.votes === 1 ? "vote" : "votes"}</span></div>)}</div></div>
          )}
          <div className="mt-16 flex flex-wrap justify-center gap-4"><button onClick={() => router.push(`/room/${roomId}/vote`)} className="rounded-full border border-[#343329] px-8 py-4 text-[10px] uppercase tracking-[0.2em]">Back to Voting</button><button onClick={() => { void trackEvent("new_group_started"); router.push("/"); }} className="rounded-full bg-[#343329] px-8 py-4 text-[10px] uppercase tracking-[0.2em] text-white">Start Another Group →</button></div>
        </section>
        <footer className="relative z-10 flex justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12"><span>Made for good company</span><span>FoodFinder © 2026</span></footer>
      </div>
    </main>
  );
}