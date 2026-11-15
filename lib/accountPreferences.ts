import { auth } from "../backend/firebase";
import { ALL_BUDGET_RANGES, getProfile, saveProfile, type BudgetRange } from "../backend/AppBackend";

export type AccountPreferences = {
  budgetRanges: BudgetRange[];
  distanceCapMiles: number | null;
};

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  budgetRanges: [...ALL_BUDGET_RANGES],
  distanceCapMiles: null,
};

export async function getAccountPreferences(uid: string): Promise<AccountPreferences> {
  await auth.authStateReady();
  if (!uid || auth.currentUser?.uid !== uid) throw new Error("Sign in to load your preferences.");
  const profile = await getProfile();
  return {
    budgetRanges: profile.budgetRanges,
    distanceCapMiles: profile.distanceCapMiles,
  };
}

export async function saveAccountPreferences(uid: string, preferences: AccountPreferences) {
  await auth.authStateReady();
  if (!uid || auth.currentUser?.uid !== uid) throw new Error("Sign in to save your preferences.");
  if (!preferences.budgetRanges.length) throw new Error("Select at least one budget range.");
  const profile = await getProfile();
  await saveProfile({
    ...profile,
    displayName: auth.currentUser.displayName ?? profile.displayName,
    budgetRanges: preferences.budgetRanges,
    distanceCapMiles: preferences.distanceCapMiles,
  });
}