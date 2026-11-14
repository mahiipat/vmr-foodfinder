import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../backend/firebase";
import { ALL_BUDGET_RANGES, type BudgetRange } from "../backend/AppBackend";

export type AccountPreferences = {
  budgetRanges: BudgetRange[];
  distanceCapMiles: number | null;
};

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  budgetRanges: [...ALL_BUDGET_RANGES],
  distanceCapMiles: null,
};

export async function getAccountPreferences(uid: string): Promise<AccountPreferences> {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return { ...DEFAULT_ACCOUNT_PREFERENCES };
  const raw = snapshot.data();
  const ranges = Array.isArray(raw.budgetRanges)
    ? raw.budgetRanges.filter((range: unknown): range is BudgetRange =>
        typeof range === "string" && ALL_BUDGET_RANGES.includes(range as BudgetRange))
    : [...ALL_BUDGET_RANGES];
  const cap = raw.distanceCapMiles;
  return {
    budgetRanges: ranges.length ? ranges : [...ALL_BUDGET_RANGES],
    distanceCapMiles: typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? cap : null,
  };
}

export async function saveAccountPreferences(uid: string, preferences: AccountPreferences) {
  if (!uid) throw new Error("Sign in to save your preferences.");
  if (!preferences.budgetRanges.length) throw new Error("Select at least one budget range.");
  await setDoc(doc(db, "users", uid), {
    budgetRanges: preferences.budgetRanges,
    distanceCapMiles: preferences.distanceCapMiles,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}