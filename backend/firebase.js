import { getApps, initializeApp } from "firebase/app";
import { version as appVersion } from "../package.json";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBz8CtR24o638d7PZkznvf5r7TP0u0ccVY",
  authDomain: "movie-voting-app-663bb.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "movie-voting-app-663bb",
  storageBucket: "movie-voting-app-663bb.firebasestorage.app",
  messagingSenderId: "1045378493192",
  appId: "1:1045378493192:web:5da3b2d8c4f7763e015abd",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" && !auth.emulatorConfig) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const STUDY_RUN_ID = process.env.NEXT_PUBLIC_STUDY_RUN_ID || "developer_testing";
export const STUDY_ENVIRONMENT = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ? "emulator" : process.env.NODE_ENV || "development";
export const APP_VERSION = appVersion;
let pendingGuest = null;
let pendingAccount = null;
export async function ensureUser() {
  await auth.authStateReady();
  if (pendingAccount) await pendingAccount;
  if (auth.currentUser) return auth.currentUser;
  pendingGuest ??= signInAnonymously(auth)
    .then((credential) => credential.user)
    .finally(() => { pendingGuest = null; });
  return pendingGuest;
}

/**
 * @template T
 * @param {() => Promise<T>} action
 * @returns {Promise<T>}
 */
export async function runAccountAction(action) {
  if (pendingAccount) throw new Error("Another account action is in progress. Please try again.");
  const guest = pendingGuest;
  const operation = Promise.resolve().then(async () => {
    if (guest) {
      try { await guest; }
      catch (error) { console.warn("Guest sign-in failed before an account action.", error); }
    }
    return action();
  });
  pendingAccount = operation;
  try { return await operation; }
  finally { pendingAccount = null; }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let identity = null;

function eventContext() {
  const now = Date.now();
  if (!identity) {
    let visitorId;
    let session;
    let firstVisit = true;
    try {
      visitorId = window.localStorage.getItem("foodfinder-visitor");
      firstVisit = !visitorId;
      session = JSON.parse(window.sessionStorage.getItem("foodfinder-visit") || "null");
      if (!visitorId) window.localStorage.setItem("foodfinder-visitor", visitorId = newId());
    } catch (error) {
      console.warn("Study tracking storage is unavailable; using a temporary browser identity.", error);
    }
    identity = { visitorId: visitorId || newId(), session, firstVisit };
  }
  const newSession = !identity.session || typeof identity.session.id !== "string" ||
    !Number.isFinite(identity.session.lastSeenAt) || now - identity.session.lastSeenAt > 30 * 60 * 1000;
  if (newSession) identity.session = { id: newId(), lastSeenAt: now };
  identity.session.lastSeenAt = now;
  try {
    window.sessionStorage.setItem("foodfinder-visit", JSON.stringify(identity.session));
  } catch (error) {
    console.warn("Study session persistence is unavailable.", error);
  }
  const firstVisit = identity.firstVisit;
  identity.firstVisit = false;
  const location = new URL(window.location.href);
  const room = location.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,128})(?:\/|$)/);
  let referrerHost = "";
  try { if (document.referrer) referrerHost = new URL(document.referrer).hostname; }
  catch (error) { console.warn("Unable to parse study referrer.", error); }
  return { firstVisit, newSession, context: {
    visitorId: identity.visitorId, sessionId: identity.session.id, groupId: room?.[1] || "",
    page: room ? location.pathname.replace(room[1], ":roomId") : ["/", "/login", "/signup", "/profile"].includes(location.pathname) ? location.pathname : "/other",
    referrerHost: referrerHost.slice(0, 253),
    utmSource: (location.searchParams.get("utm_source") || "").slice(0, 100),
    utmMedium: (location.searchParams.get("utm_medium") || "").slice(0, 100),
    utmCampaign: (location.searchParams.get("utm_campaign") || "").slice(0, 100),
    userAgent: navigator.userAgent.slice(0, 1024), platform: (navigator.platform || "").slice(0, 100),
    language: (navigator.language || "").slice(0, 35), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceCategory: /iPad|Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent) ? "tablet" : /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
    screenWidth: window.screen.width, screenHeight: window.screen.height,
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
  } };
}

export async function trackEvent(eventName, parameters = {}) {
  if (typeof window === "undefined") return;
  try {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(eventName) || Object.keys(parameters).length > 40 ||
        Object.entries(parameters).some(([key, value]) => !/^[a-z][a-z0-9_]{0,39}$/.test(key) ||
          !(typeof value === "boolean" || typeof value === "string" && value.length <= 500 || typeof value === "number" && Number.isFinite(value)))) {
      throw new Error("Invalid study event name or parameters.");
    }
    const clientTimeMs = Date.now();
    const { firstVisit, newSession, context } = eventContext();
    const user = await ensureUser();
    const batch = writeBatch(db);
    const events = [...(firstVisit ? ["first_visit"] : []), ...(newSession ? ["session_start"] : []), eventName];
    for (const name of events) {
      batch.set(doc(collection(db, "study_events")), {
        schemaVersion: 1, studyRunId: STUDY_RUN_ID,
        environment: STUDY_ENVIRONMENT,
        appVersion, actorUid: user.uid, eventName: name, recordedAt: serverTimestamp(), clientTimeMs,
        context, parameters: name === eventName ? { ...parameters } : {},
      });
    }
    await batch.commit();
  } catch (error) {
    console.warn(`Unable to persist study event ${eventName}.`, error);
  }
}

export function trackScreen(screenName, screenClass = screenName) {
  const visitId = typeof window === "undefined" ? null : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  void trackEvent("screen_view", {
    firebase_screen: screenName,
    firebase_screen_class: screenClass,
    screen_name: screenName,
    ...(visitId ? { page_visit_id: visitId } : {}),
  });
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let stopped = false;
  const isActive = () => document.visibilityState === "visible" && document.hasFocus();
  let activeSince = isActive() ? performance.now() : null;

  function resume() {
    if (!stopped && activeSince === null && isActive()) activeSince = performance.now();
  }
  function flush(reason) {
    if (activeSince === null) return;
    const duration = Math.round(Math.max(0, performance.now() - activeSince));
    activeSince = null;
    if (duration > 0) {
      void trackEvent("page_time_spent", {
        screen_name: screenName, page_visit_id: visitId, duration_ms: duration, flush_reason: reason,
      });
    }
  }
  function visibilityChanged() {
    if (isActive()) resume();
    else flush("hidden");
  }
  const blurred = () => flush("blur");
  const hidden = () => flush("pagehide");
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("blur", blurred);
  window.addEventListener("focus", resume);
  window.addEventListener("pagehide", hidden);
  window.addEventListener("pageshow", resume);
  const heartbeat = window.setInterval(() => { flush("heartbeat"); resume(); }, 30000);

  return () => {
    if (stopped) return;
    stopped = true;
    flush("navigation");
    window.clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("blur", blurred);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pagehide", hidden);
    window.removeEventListener("pageshow", resume);
  };
}

export { app };
