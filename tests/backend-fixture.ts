import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import * as dietary from "../lib/dietary.ts";

type Backend = typeof import("../backend/AppBackend");
type User = { uid: string; isAnonymous: boolean; displayName: string; getIdToken: () => Promise<string> };

export function backendFixture(anonymous = true) {
  const store = new Map<string, unknown>();
  const watchers = new Map<string, Set<(value: ReturnType<typeof snapshot>) => void>>();
  let sequence = 0;
  let stopCount = 0;
  let listenerCount = 0;
  const user: User = { uid: "one", isAnonymous: anonymous, displayName: "One", getIdToken: async () => "test-token" };
  const auth = { currentUser: user as User | null, authStateReady: async () => {} };
  function snapshot(path: string) {
    const data = structuredClone(store.get(path));
    return { exists: () => data !== undefined, data: () => data };
  }
  function notify(path: string) {
    for (const callback of watchers.get(path) ?? []) queueMicrotask(() => callback(snapshot(path)));
  }
  function set(path: string, value: unknown) { store.set(path, structuredClone(value)); notify(path); }
  const firestore = {
    doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
    collection: (_db: unknown, path: string) => path,
    getDoc: async (path: string) => snapshot(path),
    setDoc: async (path: string, value: unknown) => set(path, value),
    addDoc: async (path: string, value: unknown) => {
      const id = `room-${++sequence}`; set(`${path}/${id}`, value); return { id };
    },
    runTransaction: async (_db: unknown, operation: (transaction: { get: (path: string) => Promise<ReturnType<typeof snapshot>>; set: (path: string, value: unknown) => void }) => unknown) => {
      const writes = new Map<string, unknown>();
      const result = await operation({ get: firestore.getDoc, set: (path, value) => { writes.set(path, structuredClone(value)); } });
      for (const [path, value] of writes) set(path, value);
      return result;
    },
    onSnapshot: (path: string, callback: (value: ReturnType<typeof snapshot>) => void, _onError: (error: Error) => void) => {
      void _onError;
      listenerCount++;
      let stopped = false;
      const guarded = (value: ReturnType<typeof snapshot>) => { if (!stopped) callback(value); };
      if (!watchers.has(path)) watchers.set(path, new Set());
      watchers.get(path)!.add(guarded);
      queueMicrotask(() => guarded(snapshot(path)));
      return () => { stopped = true; stopCount++; watchers.get(path)?.delete(guarded); };
    },
  };
  const authWatchers = new Set<(value: User | null) => void>();
  const emitAuth = () => { for (const callback of authWatchers) callback(auth.currentUser); };
  const firebaseAuth = {
    onAuthStateChanged: (_auth: unknown, callback: (value: User | null) => void) => {
      authWatchers.add(callback);
      queueMicrotask(() => { if (authWatchers.has(callback)) callback(auth.currentUser); });
      return () => { authWatchers.delete(callback); };
    },
    signInAnonymously: async () => { auth.currentUser = user; emitAuth(); return { user }; },
    EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
    linkWithCredential: async (existing: User) => { existing.isAnonymous = false; return { user: existing }; },
    createUserWithEmailAndPassword: async () => { user.isAnonymous = false; auth.currentUser = user; return { user }; },
    signInWithEmailAndPassword: async () => { user.isAnonymous = false; auth.currentUser = user; return { user }; },
    signOut: async () => { auth.currentUser = null; emitAuth(); },
    updateProfile: async (existing: User, value: { displayName: string }) => { existing.displayName = value.displayName; },
  };
  const source = readFileSync(new URL("../backend/AppBackend.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const exports = {};
  const execute = runInThisContext(`(function(require, exports) { ${compiled.outputText}\n})`);
  execute((id: string) => {
    if (id === "firebase/auth") return firebaseAuth;
    if (id === "firebase/firestore") return firestore;
    if (id === "./firebase") return { auth, db: {} };
    if (id === "../lib/dietary") return dietary;
    throw new Error(`Unexpected import: ${id}`);
  }, exports);
  return { backend: exports as Backend, auth, user, store, set, source, firebaseAuth, emitAuth,
    counts: () => ({ stopCount, listenerCount }) };
}
