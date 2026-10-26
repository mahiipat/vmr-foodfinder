import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import {
  getAnalytics,
  isSupported,
  logEvent,
  setUserProperties,
} from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBz8CtR24o638d7PZkznvf5r7TP0u0ccVY",
  authDomain: "movie-voting-app-663bb.firebaseapp.com",
  projectId: "movie-voting-app-663bb",
  storageBucket: "movie-voting-app-663bb.firebasestorage.app",
  messagingSenderId: "1045378493192",
  appId: "1:1045378493192:web:5da3b2d8c4f7763e015abd",
  measurementId: "G-9Z8Q7FDR3H",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);

let analytics = null;
let analyticsPromise = null;

function getAnalyticsInstance() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => {
        if (!supported) return null;
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
    logEvent(instance, eventName, parameters);
  }
}

export async function trackScreen(screenName, screenClass = screenName) {
  await trackEvent("screen_view", {
    firebase_screen: screenName,
    firebase_screen_class: screenClass,
  });
}

export async function setAnalyticsProperties(properties) {
  const instance = await getAnalyticsInstance();
  if (instance) {
    setUserProperties(instance, properties);
  }
}

export { app, analytics };
