"use client";
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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
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
    <main className="min-h-screen bg-[#A99B82] px-4 py-6 text-[#343329] sm:px-10 sm:py-10">
      <div className="relative mx-auto flex min-h-[90vh] max-w-7xl flex-col overflow-hidden rounded-sm bg-[#F0EADF] shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_95%,rgba(231,153,108,0.65),transparent_45%),radial-gradient(ellipse_at_95%_90%,rgba(143,157,112,0.50),transparent_45%)]" />
        <nav className="relative z-10 flex items-center justify-between border-b border-[#343329]/10 px-6 py-6 sm:px-12">
          <Link
            href="/"
            className="text-[10px] font-semibold uppercase tracking-[0.25em] transition hover:opacity-60"
          >
            ← Home
          </Link>

          <Link
            href="/"
            className="font-serif text-3xl tracking-tight"
          >
            foodfinder.
          </Link>

          <Link
            href={mode === "login" ? "/signup" : "/login"}
            className="text-[10px] font-semibold uppercase tracking-[0.25em] transition hover:opacity-60"
          >
            {mode === "login" ? "Sign Up" : "Login"}
          </Link>
        </nav>

        <section className="relative z-10 flex flex-1 flex-col items-center px-6 pb-24 pt-20 text-center sm:pt-24">

          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#777466]">
            Good food. Better company.
          </p>

          <h1 className="mt-6 font-serif !text-[clamp(3rem,6vw,5.5rem)] font-normal leading-[1.1] tracking-[-0.055em]">            
            {mode === "login" ? "Welcome back." : "Join the table."}
          </h1>

          <p className="mt-7 max-w-sm text-sm leading-7 text-[#68665A]">
            {mode === "login"
              ? "Your next favorite meal is just a group decision away."
              : "Good food is better together. Create your account to get started."}
          </p>

          <div className="mt-14 w-full max-w-md border-t border-[#343329]/25 pt-10">
            <p className="mb-8 text-[10px] uppercase tracking-[0.3em] text-[#777466]">
              {mode === "login" ? "Your account" : "The first step"}
            </p>

            <form onSubmit={submit} className="space-y-6">

              {mode === "signup" && (
                <div>
                  <label htmlFor="auth-name" className="sr-only">
                    Your name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    placeholder="Your name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-b border-[#343329]/40 bg-transparent px-3 py-4 text-center text-base outline-none transition placeholder:text-[#8E8A7D] focus:border-[#343329]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-b border-[#343329]/40 bg-transparent px-3 py-4 text-center text-base outline-none transition placeholder:text-[#8E8A7D] focus:border-[#343329]"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="sr-only">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  placeholder="Password"
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-b border-[#343329]/40 bg-transparent px-3 py-4 text-center text-base outline-none transition placeholder:text-[#8E8A7D] focus:border-[#343329]"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="!mt-5 rounded-sm bg-[#9C5A49]/10 px-4 py-3 text-center text-sm leading-5 text-[#9C5A49]"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-8 w-full rounded-full bg-[#343329] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#565344] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy
                  ? "Please wait..."
                  : mode === "login"
                  ? "Login →"
                  : "Create Account →"}
              </button>
            </form>

            <p className="mt-8 text-sm text-[#68665A]">
              {mode === "login"
                ? "New to FoodFinder?"
                : "Already have an account?"}{" "}
              <Link
                href={mode === "login" ? "/signup" : "/login"}
                className="font-medium text-[#343329] underline underline-offset-4 transition hover:text-[#566B48]"
              >
                {mode === "login" ? "Sign up" : "Login"}
              </Link>
            </p>
          </div>
        </section>

        <footer className="relative z-10 flex items-center justify-between border-t border-[#343329]/15 px-6 py-6 text-[10px] uppercase tracking-[0.15em] text-[#777466] sm:px-12">
          <span>Made for good company</span>
          <span>FoodFinder © 2026</span>
        </footer>
      </div>
    </main>
  );
}