import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInThisContext } from "node:vm";
import { initializeApp, deleteApp } from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import * as firestore from "firebase/firestore";
import ts from "typescript";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-foodfinder";
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && projectId.startsWith("demo-"));
const source = readFileSync(new URL("../backend/AppBackend.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });

function client() {
  const app = initializeApp({ projectId, apiKey: "emulator-only" }, crypto.randomUUID());
  const auth = firebaseAuth.getAuth(app);
  firebaseAuth.connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = firestore.getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  firestore.connectFirestoreEmulator(db, host, Number(port));
  const backend = {};
  runInThisContext(`(function(require, exports) { ${compiled.outputText}\n})`)((id) => {
    if (id === "firebase/auth") return firebaseAuth;
    if (id === "firebase/firestore") return firestore;
    if (id === "./firebase") return { auth, db, trackEvent: async () => {},
      ANALYTICS_STUDY_STARTED_AT: Date.parse("2026-11-16T01:53:20.605Z") };
    throw new Error(`Unexpected import: ${id}`);
  }, backend);
  return { app, auth, db, backend };
}
function waitFor(backend, roomId, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error("No expected realtime room update")); }, 10000);
    const stop = backend.subscribeRoomState(roomId, (state) => {
      if (predicate(state)) { clearTimeout(timer); stop(); resolve(state); }
    }, (error) => { clearTimeout(timer); stop(); reject(error); });
  });
}

test("direct Firestore prototype: realtime updates, readiness, ties, profiles and feedback", { skip: !enabled, timeout: 60000 }, async () => {
  const one = client(); const two = client();
  try {
    for (const tieStrategy of ["random", "runoff"]) {
      const { roomId } = await one.backend.createGroup({ groupName: "Dinner", location: "Atlanta", tieStrategy });
      const first = await one.backend.joinGroup(roomId, "One");
      const second = await two.backend.joinGroup(roomId, "Two");
      const firstId = first.memberId; const secondId = second.memberId;
      const realtime = waitFor(two.backend, roomId, (state) => state?.readyMemberIds.includes(firstId));
      await one.backend.submitPreferences(roomId, firstId, { favorites: ["Alpha"] });
      await two.backend.submitPreferences(roomId, secondId, { favorites: ["Beta"] });
      assert.deepEqual((await one.backend.getRoomState(roomId)).options.map((r) => r.name), ["Alpha"]);
      assert.deepEqual((await two.backend.getRoomState(roomId)).options.map((r) => r.name), ["Beta"]);
      await one.backend.markMemberReadyForVoting(roomId, firstId);
      await realtime;
      await two.backend.submitPreferences(roomId, secondId, { budgetRanges: ["UNDER_10"] });
      await Promise.all([one.backend.markMemberReadyForVoting(roomId, firstId), two.backend.markMemberReadyForVoting(roomId, secondId)]);
      const reset = await one.backend.getRoomState(roomId);
      assert.equal(reset.phase, "nominations"); assert.ok(reset.reaskReason); assert.deepEqual(reset.readyMemberIds, []);
      await two.backend.submitPreferences(roomId, secondId, { budgetRanges: [...two.backend.ALL_BUDGET_RANGES] });
      const voting = waitFor(one.backend, roomId, (state) => state?.phase === "voting");
      await Promise.all([one.backend.markMemberReadyForVoting(roomId, firstId), two.backend.markMemberReadyForVoting(roomId, secondId)]);
      const ballot = await voting;
      const alpha = ballot.options.find((r) => r.name === "Alpha").id;
      const beta = ballot.options.find((r) => r.name === "Beta").id;
      await Promise.all([one.backend.submitVotes(roomId, firstId, [alpha]), two.backend.submitVotes(roomId, secondId, [beta])]);
      if (tieStrategy === "runoff") {
        assert.equal((await one.backend.getRoomState(roomId)).phase, "runoff");
        await Promise.all([one.backend.submitVotes(roomId, firstId, [beta], 1), two.backend.submitVotes(roomId, secondId, [beta], 1)]);
      }
      const result = await one.backend.getRoomState(roomId);
      assert.equal(result.phase, "results"); assert.ok(result.winner);
      assert.equal((await two.backend.getRoomState(roomId)).winner.id, result.winner.id);
      await one.backend.submitResultFeedback(roomId, firstId, true);
      assert.equal((await one.backend.getRoomState(roomId)).feedback[firstId].happy, true);
    }
    const uid = one.auth.currentUser.uid;
    await one.backend.signUp(`prototype-${crypto.randomUUID()}@example.test`, "password123", "One");
    assert.equal(one.auth.currentUser.uid, uid);
    await one.backend.saveProfile({ ...one.backend.defaultProfile("One"), favorites: ["Saved favorite"] });
    const { roomId } = await one.backend.createGroup({ groupName: "Profile defaults", location: "Atlanta" });
    const joined = await one.backend.joinGroup(roomId, "One");
    assert.deepEqual(joined.state.preferences[0].favorites, ["Saved favorite"]);
    await assert.rejects(firestore.getDoc(firestore.doc(two.db, "profiles", uid)), /permission/i);
  } finally {
    await Promise.all([firestore.terminate(one.db), firestore.terminate(two.db)]);
    await Promise.all([deleteApp(one.app), deleteApp(two.app)]);
  }
});
