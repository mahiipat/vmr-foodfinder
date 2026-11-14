"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, updateProfile, type User } from "firebase/auth";
import { auth } from "../../backend/firebase";
import { ALL_BUDGET_RANGES, budgetRangeLabels, type BudgetRange } from "../../backend/AppBackend";
import { getAccountPreferences, saveAccountPreferences } from "../../lib/accountPreferences";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [budgets, setBudgets] = useState<BudgetRange[]>([...ALL_BUDGET_RANGES]);
  const [distanceEnabled, setDistanceEnabled] = useState(false);
  const [distance, setDistance] = useState("5");
  const [prefsBusy, setPrefsBusy] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setName(currentUser?.displayName ?? "");
      setLoading(false);
      if (!currentUser) router.replace("/login");
      if (currentUser) {
        void getAccountPreferences(currentUser.uid).then((prefs) => {
          setBudgets(prefs.budgetRanges);
          setDistanceEnabled(prefs.distanceCapMiles !== null);
          setDistance(String(prefs.distanceCapMiles ?? 5));
        }).catch(() => setMessage("Unable to load saved preferences."));
      }
    });
  }, [router]);

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await updateProfile(user, { displayName: name.trim() });
      setName(name.trim());
      setMessage("Your name has been updated.");
    } catch {
      setMessage("Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || prefsBusy) return;
    setPrefsBusy(true);
    setMessage("");
    try {
      const cap = Number(distance);
      if (distanceEnabled && (!Number.isFinite(cap) || cap <= 0)) throw new Error("Enter a valid distance in miles.");
      await saveAccountPreferences(user.uid, { budgetRanges: budgets, distanceCapMiles: distanceEnabled ? cap : null });
      setMessage("Your default preferences have been saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save preferences.");
    } finally {
      setPrefsBusy(false);
    }
  }

  function openRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomCode.trim();
    if (!code || code.includes("/") || code.includes("?")) {
      setMessage("Enter a valid room code.");
      return;
    }
    router.push(`/room/${encodeURIComponent(code)}`);
  }

  async function logOut() {
    setMessage("");
    try {
      await signOut(auth);
      router.replace("/login");
    } catch {
      setMessage("Couldn't sign out. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
      <div className="relative mx-auto min-h-[90vh] max-w-7xl overflow-hidden rounded-sm bg-[#F0EADF] shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.45),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.40),transparent_45%)]" />
        <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/15 px-6 py-6 sm:px-12">
          <Link href="/" className="text-[10px] uppercase tracking-[0.2em]">← Home</Link>
          <Link href="/" className="font-serif text-3xl">foodfinder.</Link>
          <span className="text-[10px] uppercase tracking-[0.2em]">My profile</span>
        </nav>
        <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24 pt-16 sm:pt-20">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#777466]">A seat at the table</p>
            <h1 className="mt-5 font-serif text-[clamp(3.5rem,8vw,6rem)] leading-none tracking-[-0.05em]">Your profile.</h1>
            <p className="mt-6 text-sm text-[#68665A]">Good food. Better company. All you need is you.</p>
          </div>
          {loading ? (
            <p role="status" className="mt-16 text-center text-sm text-[#68665A]">Loading your profile...</p>
          ) : user ? (
            <div className="mt-14 border-y border-[#343329]/25 py-10">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#566B48]/40 bg-[#E4E8D8] font-serif text-4xl text-[#566B48]">
                  {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <h2 className="font-serif text-3xl">{user.displayName || "FoodFinder member"}</h2>
                <p className="text-sm text-[#68665A]">{user.email}</p>
              </div>
              <form onSubmit={saveName} className="mt-12">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">Personal details</p>
                <label htmlFor="display-name" className="mt-6 block text-sm">Display name</label>
                <input id="display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required className="mt-2 w-full border-b border-[#343329]/40 bg-transparent px-2 py-3 outline-none focus:border-[#343329]" placeholder="Your name" />
                <label className="mt-6 block text-sm">Email address</label>
                <div className="mt-2 border-b border-[#343329]/20 px-2 py-3 text-sm text-[#68665A]">{user.email}</div>
                <button type="submit" disabled={saving || !name.trim() || name.trim() === (user.displayName ?? "")} className="mt-8 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#565344] disabled:cursor-not-allowed disabled:opacity-40">
                  {saving ? "Saving..." : "Save changes →"}
                </button>
              </form>
              <form onSubmit={savePreferences} className="mt-12 border-t border-[#343329]/20 pt-8">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">01 / Your budget</p>
                <h3 className="mt-3 font-serif text-3xl">Your budget ranges.</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {ALL_BUDGET_RANGES.map((range) => (
                    <label key={range} className="flex cursor-pointer items-center gap-3 border border-[#343329]/25 px-4 py-3 text-sm">
                      <input type="checkbox" checked={budgets.includes(range)} onChange={() => setBudgets((prev) => prev.includes(range) ? (prev.length > 1 ? prev.filter((value) => value !== range) : prev) : [...prev, range])} className="accent-[#566B48]" />
                      {budgetRangeLabels[range]}
                    </label>
                  ))}
                </div>
                <p className="mt-9 text-[10px] uppercase tracking-[0.3em] text-[#777466]">02 / Your distance</p>
                <h3 className="mt-3 font-serif text-3xl">Keep it close.</h3>
                <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={distanceEnabled} onChange={(event) => setDistanceEnabled(event.target.checked)} className="peer sr-only" />
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#566B48] peer-checked:bg-[#566B48]">
                    {distanceEnabled && <span className="text-xs text-white">✓</span>}
                  </span>
                  Limit how far I'll travel
                </label>
                {distanceEnabled && <label className="mt-5 block text-sm">Maximum distance (miles)
                  <input type="number" min="0.1" step="0.5" required value={distance} onChange={(event) => setDistance(event.target.value)} className="mt-2 w-full border-b border-[#343329]/40 bg-transparent px-2 py-3 outline-none" />
                </label>}
                <p className="mt-4 text-xs leading-5 text-[#68665A]">We'll ask for your device location in each room. Your profile saves the distance limit, not your coordinates.</p>
                <button disabled={prefsBusy} type="submit" className="mt-7 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] uppercase tracking-[0.2em] text-white disabled:opacity-40">{prefsBusy ? "Saving..." : "Save preferences →"}</button>
              </form>
              <form onSubmit={openRoom} className="mt-12 border-t border-[#343329]/20 pt-8">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#777466]">03 / Join your friends</p>
                <h3 className="mt-3 font-serif text-3xl">Have a room code?</h3>
                <p className="mt-3 text-sm text-[#68665A]">Enter the code to join under your account name. Your saved defaults will be applied on your first visit.</p>
                <input aria-label="Room code" placeholder="Enter room code" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} className="mt-6 w-full border-b border-[#343329]/40 bg-transparent px-2 py-3 text-center outline-none" />
                <button type="submit" disabled={!roomCode.trim()} className="mt-5 w-full rounded-full border border-[#343329] px-8 py-4 text-[11px] uppercase tracking-[0.2em] disabled:opacity-40">Join room →</button>
              </form>
              {message && <p role="status" className="mt-4 text-center text-sm text-[#566B48]">{message}</p>}
              <div className="mt-10 border-t border-[#343329]/20 pt-8 text-center">
                <button type="button" onClick={() => void logOut()} className="rounded-full border border-[#343329] px-8 py-3 text-[11px] uppercase tracking-[0.18em] transition hover:bg-[#343329] hover:text-white">Sign out</button>
              </div>
            </div>
          ) : null}
        </section>
        <footer className="relative z-10 flex items-center justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
          <span>Made for good company</span><span>FoodFinder © 2026</span>
        </footer>
      </div>
    </main>
  );
}