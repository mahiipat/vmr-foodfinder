import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBz8CtR24o638d7PZkznvf5r7TP0u0ccVY",
  authDomain: "movie-voting-app-663bb.firebaseapp.com",
  projectId: "movie-voting-app-663bb",
  storageBucket: "movie-voting-app-663bb.firebasestorage.app",
  messagingSenderId: "1045378493192",
  appId: "1:1045378493192:web:5da3b2d8c4f7763e015abd"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);