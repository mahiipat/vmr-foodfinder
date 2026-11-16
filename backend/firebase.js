import { getApps, initializeApp } from "firebase/app";
import { version as appVersion } from "../package.json";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import {
  getAnalytics,
  isSupported,
  logEvent,
  setDefaultEventParameters,
  setUserProperties,
} from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBz8CtR24o638d7PZkznvf5r7TP0u0ccVY",
  authDomain: "movie-voting-app-663bb.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "movie-voting-app-663bb",
  storageBucket: "movie-voting-app-663bb.firebasestorage.app",
  messagingSenderId: "1045378493192",
  appId: "1:1045378493192:web:5da3b2d8c4f7763e015abd",
  measurementId: "G-9Z8Q7FDR3H",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" && !auth.emulatorConfig) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

let analytics = null;
let analyticsPromise = null;
export const ANALYTICS_STUDY_STARTED_AT = Date.parse("2026-11-16T01:53:20.605Z");
const analyticsContext = {
  analytics_version: 2,
  study_cohort: "study_20261116",
  app_environment: process.env.NODE_ENV,
  app_version: appVersion,
};

function getAnalyticsInstance() {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => {
        if (!supported) return null;
        setDefaultEventParameters(analyticsContext);
        analytics = getAnalytics(app);
        return analytics;
      })
      .catch((error) => {
        console.warn("Firebase Analytics is unavailable.", error);
        return null;
      });
  }
  return analyticsPromise;
}

export async function trackEvent(eventName, parameters = {}) {
  const instance = await getAnalyticsInstance();
  if (instance) {
    try {
      logEvent(instance, eventName, {
        ...parameters,
        ...analyticsContext,
      });
    } catch (error) {
      console.warn("Unable to record analytics event.", error);
    }
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

export async function setAnalyticsProperties(properties) {
  const instance = await getAnalyticsInstance();
  if (instance) {
    setUserProperties(instance, properties);
  }
}

export { app, analytics };
