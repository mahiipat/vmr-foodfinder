import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInThisContext } from "node:vm";
import { initializeApp, deleteApp } from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import * as firestore from "firebase/firestore";
import ts from "typescript";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-foodfinder";
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && projectId.startsWith("demo-"));
const source = readFileSync(new URL("../backend/AppBackend.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });

function client() {
  let eventTracker = async () => {};
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
    if (id === "./firebase") return { auth, db, trackEvent: (...args) => eventTracker(...args),
      STUDY_RUN_ID: "emulator_run", STUDY_ENVIRONMENT: "emulator", APP_VERSION: "0.1.0",
      runAccountAction: async (action) => action(),
      ensureUser: async () => { await auth.authStateReady(); return auth.currentUser ?? (await firebaseAuth.signInAnonymously(auth)).user; } };
    throw new Error(`Unexpected import: ${id}`);
  }, backend);
  return { app, auth, db, backend, setEventTracker: (tracker) => { eventTracker = tracker; } };
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
      const persisted = (await firestore.getDoc(firestore.doc(one.db, "rooms", roomId))).data();
      assert.equal(persisted.study.allChoicesPruned, 1);
      assert.equal(persisted.study.initialTies, 1);
      assert.equal(persisted.study.happyCount, 1);
      assert.equal(persisted.study.responseCount, 1);
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

test("Firestore telemetry persists real browser timing, enforces rules and exports private study tables", { skip: !enabled, timeout: 60000 }, async () => {
  const one = client(); const other = client();
  const directory = await mkdtemp(join(tmpdir(), "foodfinder-study-"));
  try {
    const { roomId } = await one.backend.createGroup({ groupName: "Private name", location: "Private address" });
    await one.backend.joinGroup(roomId, "One");
    let now = 0;
    const storage = () => {
      const data = new Map();
      return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    };
    const browser = Object.assign(new EventTarget(), {
      location: { href: `http://localhost/room/${roomId}/results?utm_source=emulator` },
      screen: { width: 1440, height: 900 }, innerWidth: 1000, innerHeight: 700,
      localStorage: storage(), sessionStorage: storage(), setInterval: () => 1, clearInterval: () => {},
    });
    const page = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => true, referrer: "" });
    const telemetry = {};
    const firebaseSource = readFileSync(new URL("../backend/firebase.js", import.meta.url), "utf8");
    const compiledFirebase = ts.transpileModule(firebaseSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    runInThisContext(`(function(require, exports, window, document, navigator, performance, process) { ${compiledFirebase.outputText}\n})`)(
      (id) => {
        if (id === "firebase/app") return { getApps: () => [one.app] };
        if (id === "firebase/auth") return { ...firebaseAuth, getAuth: () => one.auth };
        if (id === "firebase/firestore") return { ...firestore, getFirestore: () => one.db };
        if (id === "../package.json") return { version: "0.1.0" };
        throw new Error(`Unexpected import: ${id}`);
      }, telemetry, browser, page, { userAgent: "Test browser", platform: "test", language: "en" },
      { now: () => now }, { env: { NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_STUDY_RUN_ID: "emulator_run", NODE_ENV: "test" } },
    );
    const stop = telemetry.trackScreen("results");
    await new Promise(setImmediate);
    await firestore.waitForPendingWrites(one.db);
    now = 2400; stop();
    await new Promise(setImmediate);
    await firestore.waitForPendingWrites(one.db);
    one.setEventTracker(telemetry.trackEvent);
    const tracked = await one.backend.createGroup({ groupName: "Tracked", location: "Atlanta", tieStrategy: "runoff" });
    const first = await one.backend.joinGroup(tracked.roomId, "One");
    const second = await other.backend.joinGroup(tracked.roomId, "Two");
    await one.backend.joinGroup(tracked.roomId, "One");
    await one.backend.submitPreferences(tracked.roomId, first.memberId, { favorites: ["Alpha", "Beta"], budgetRanges: ["UNDER_10"], dietaryNeeds: ["vegan"] });
    await other.backend.markMemberReadyForVoting(tracked.roomId, second.memberId);
    await one.backend.markMemberReadyForVoting(tracked.roomId, first.memberId);
    await one.backend.updateMemberDistance(tracked.roomId, first.memberId, { location: { address: "Atlanta" }, distanceCapMiles: 5 });
    await one.backend.submitPreferences(tracked.roomId, first.memberId, { budgetRanges: [...one.backend.ALL_BUDGET_RANGES] });
    await other.backend.markMemberReadyForVoting(tracked.roomId, second.memberId);
    const ballot = await one.backend.markMemberReadyForVoting(tracked.roomId, first.memberId);
    const [alpha, beta] = ballot.state.options.map((restaurant) => restaurant.id);
    await other.backend.submitVotes(tracked.roomId, second.memberId, [beta]);
    await one.backend.submitVotes(tracked.roomId, first.memberId, [alpha]);
    await other.backend.submitVotes(tracked.roomId, second.memberId, [beta], 1);
    await one.backend.submitVotes(tracked.roomId, first.memberId, [beta], 1);
    await one.backend.submitResultFeedback(tracked.roomId, first.memberId, true);
    await new Promise(setImmediate);
    await firestore.waitForPendingWrites(one.db);
    const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`;
    const response = await fetch(`${base}/study_events`, { headers: { Authorization: "Bearer owner" } });
    assert.equal(response.status, 200);
    const documents = (await response.json()).documents;
    const recordedNames = documents.map((document) => document.fields.eventName.stringValue);
    for (const name of ["group_created", "experiment_assigned", "group_joined", "budget_ranges_updated", "dietary_needs_updated",
      "restaurant_nominated", "shortlist_evaluated", "all_choices_pruned", "distance_preferences_updated", "voting_started",
      "votes_submitted", "voting_round_completed", "tie_detected", "runoff_started", "tie_resolved", "decision_completed", "winner_satisfaction_submitted"]) {
      assert.ok(recordedNames.includes(name), `missing persisted event ${name}`);
    }
    const duration = documents.find((document) => document.fields.eventName.stringValue === "page_time_spent");
    assert.ok(duration, "page timing must be persisted, not just logged");
    assert.equal(Number(duration.fields.parameters.mapValue.fields.duration_ms.integerValue), 2400);
    const id = duration.name.split("/").at(-1);
    const ref = firestore.doc(one.db, "study_events", id);
    const event = (await (await fetch(`${base}/study_events/${id}`, { headers: { Authorization: "Bearer owner" } })).json()).fields;
    const valid = {
      schemaVersion: 1, studyRunId: "emulator_run", environment: "emulator", appVersion: "0.1.0",
      actorUid: one.auth.currentUser.uid, eventName: "screen_view", recordedAt: firestore.serverTimestamp(),
      clientTimeMs: Date.now(), parameters: {}, context: {
        visitorId: "visitor", sessionId: "session", groupId: roomId, page: "/room/:roomId/results", referrerHost: "",
        utmSource: "", utmMedium: "", utmCampaign: "", userAgent: "test", platform: "test", language: "en", timezone: "UTC",
        deviceCategory: "desktop", screenWidth: 1000, screenHeight: 800, viewportWidth: 1000, viewportHeight: 800,
      },
    };
    assert.ok(event.recordedAt.timestampValue);
    await assert.rejects(firestore.getDoc(ref), /permission/i);
    await assert.rejects(firestore.getDocs(firestore.collection(one.db, "study_events")), /permission/i);
    await assert.rejects(firestore.updateDoc(ref, { actorUid: "hijacked" }), /permission/i);
    await assert.rejects(firestore.deleteDoc(ref), /permission/i);
    for (const invalid of [
      { ...valid, actorUid: "someone-else" }, { ...valid, privileged: true },
      { ...valid, recordedAt: firestore.Timestamp.fromMillis(0) },
      { ...valid, parameters: { duration_ms: -1 } }, { ...valid, parameters: { member_count: "bad" } },
      { ...valid, parameters: { source: "x".repeat(1000) } }, { ...valid, parameters: { unknown: "field" } },
      { ...valid, context: { ...valid.context, visitorId: "" } },
    ]) await assert.rejects(firestore.addDoc(firestore.collection(one.db, "study_events"), invalid), /permission/i);
    await assert.rejects(firestore.addDoc(firestore.collection(other.db, "study_events"), valid), /permission/i);
    const roomRef = firestore.doc(one.db, "rooms", roomId);
    await assert.rejects(firestore.updateDoc(roomRef, { "study.runId": "hijacked" }), /permission/i);
    await assert.rejects(firestore.setDoc(firestore.doc(one.db, "profiles", one.auth.currentUser.uid), {
      displayName: "One", favorites: [], budgetRanges: ["UNDER_10"], distanceCapMiles: null, hostLocation: null, studyAnalyst: true,
    }), /permission/i);
    const claim = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
      method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ localId: one.auth.currentUser.uid, customAttributes: JSON.stringify({ studyAnalyst: true }) }),
    });
    assert.equal(claim.status, 200);
    await one.auth.currentUser.getIdToken(true);
    assert.ok((await firestore.getDocs(firestore.collection(one.db, "study_events"))).size > 0);

    const seed = Array.from({ length: 501 }, (_, index) => ({ update: {
      name: `${duration.name.slice(0, duration.name.lastIndexOf("/"))}/pagination-${String(index).padStart(4, "0")}`,
      fields: { ...duration.fields, eventName: { stringValue: "group_creation_started" }, parameters: { mapValue: { fields: {} } } },
    } }));
    for (let offset = 0; offset < seed.length; offset += 500) {
      const seeded = await fetch(`${base}:commit`, { method: "POST",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ writes: seed.slice(offset, offset + 500) }),
      });
      assert.equal(seeded.status, 200);
    }
    const output = join(directory, "report");
    await promisify(execFile)(process.execPath, ["scripts/export-study.mjs", "--project", projectId,
      "--run", "emulator_run", "--environment", "emulator", "--out", output], {
      cwd: new URL("..", import.meta.url), env: process.env,
    });
    const report = JSON.parse(await readFile(`${output}.json`, "utf8"));
    assert.ok(report.groups.some((group) => group.groupId === roomId));
    assert.equal(report.events.length, documents.length + 501, "export must paginate past 500 events without loss or duplication");
    assert.ok(report.pageVisits.some((visit) => visit.durationMs === 2400));
    assert.ok(!JSON.stringify(report.groups).includes("Private address"));
    assert.match(await readFile(`${output}-groups.csv`, "utf8"), /chosenMethod/);
  } finally {
    await Promise.all([firestore.terminate(one.db), firestore.terminate(other.db)]);
    await Promise.all([deleteApp(one.app), deleteApp(other.app)]);
    await rm(directory, { recursive: true, force: true });
  }
});
