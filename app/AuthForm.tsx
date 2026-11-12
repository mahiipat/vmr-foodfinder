"use client"
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../backend/firebase";

export default function AuthForm({
  mode,
}: {
  mode: "login" | "signup";
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        await updateProfile(credential.user, {
          displayName: name.trim(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      router.push("/profile");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#A99B82] p-6 text-[#343329]">
      <div className="mx-auto max-w-lg bg-[#F0EADF] p-10 shadow-xl">
        <Link href="/" className="font-serif text-3xl">
          foodfinder.
        </Link>

        <h1 className="mt-12 font-serif text-5xl">
          {mode === "login" ? "Welcome back." : "Join the table."}
        </h1>

        <form onSubmit={submit} className="mt-10 space-y-5">
          {mode === "signup" && (
            <label className="block text-sm">
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full border-b bg-transparent p-3"
              />
            </label>
          )}

          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full border-b bg-transparent p-3"
            />
          </label>

          <label className="block text-sm">
            Password
            <input
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full border-b bg-transparent p-3"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-[#343329] p-4 text-white disabled:opacity-50"
          >
            {busy
              ? "Please wait..."
              : mode === "login"
              ? "Log In →"
              : "Sign Up →"}
          </button>
        </form>

        <p className="mt-8 text-sm">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <Link
            className="underline"
            href={mode === "login" ? "/signup" : "/login"}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </Link>
        </p>
      </div>
    </main>
  );
}