import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { runInThisContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { backendFixture } from "./backend-fixture.ts";

const studyStart = Date.parse("2026-11-16T01:53:20.605Z");
const { version: appVersion } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

function analyticsFixture({ browser = true, emulator = false, failLogging = false } = {}) {
  const events: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const warnings: unknown[][] = [];
  const defaults: Record<string, unknown>[] = [];
  const initialization: string[] = [];
  let now = 0;
  let focused = true;
  let nextInterval = 0;
  const intervals = new Map<number, () => void>();
  const page = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => focused });
  const browserWindow = Object.assign(new EventTarget(), {
    setInterval: (callback: () => void) => { intervals.set(++nextInterval, callback); return nextInterval; },
    clearInterval: (id: number) => { intervals.delete(id); },
  });
  const source = readFileSync(new URL("../backend/firebase.js", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {} as {
    trackEvent: (name: string, parameters?: Record<string, unknown>) => Promise<void>;
    trackScreen: (name: string) => () => void;
  };
  const noop = () => {};
  runInThisContext(`(function(require, exports, window, document, performance, process, console) { ${compiled.outputText}\n})`)(
    (id: string) => {
      if (id === "../package.json") return { version: appVersion };
      if (id === "firebase/app") return { getApps: () => [], initializeApp: () => ({}) };
      if (id === "firebase/auth") return { getAuth: () => ({}), connectAuthEmulator: noop };
      if (id === "firebase/firestore") return { getFirestore: () => ({}), connectFirestoreEmulator: noop };
      if (id === "firebase/analytics") return {
        getAnalytics: () => { initialization.push("initialize"); return {}; }, isSupported: async () => true, setUserProperties: noop,
        setDefaultEventParameters: (parameters: Record<string, unknown>) => { initialization.push("defaults"); defaults.push(parameters); },
        logEvent: (_instance: unknown, name: string, parameters: Record<string, unknown>) => {
          if (failLogging) throw new Error("SDK unavailable");
          events.push({ name, parameters });
        },
      };
      throw new Error(`Unexpected import: ${id}`);
    }, exports, browser ? browserWindow : undefined, browser ? page : undefined, { now: () => now },
    { env: { NODE_ENV: "production", NEXT_PUBLIC_USE_FIREBASE_EMULATORS: String(emulator) } },
    { warn: (...args: unknown[]) => warnings.push(args) },
  );
  return { ...exports, events, warnings, intervals, defaults, initialization,
    advance: (milliseconds: number) => { now += milliseconds; },
    heartbeat: () => { for (const callback of intervals.values()) callback(); },
    visibility: (state: string) => { page.visibilityState = state; page.dispatchEvent(new Event("visibilitychange")); },
    focus: (value: boolean) => { focused = value; browserWindow.dispatchEvent(new Event(value ? "focus" : "blur")); },
    pagehide: () => { browserWindow.dispatchEvent(new Event("pagehide")); },
    pageshow: () => { browserWindow.dispatchEvent(new Event("pageshow")); },
  };
}

test("custom analytics events carry the new study cohort and cannot override measurement metadata", async () => {
  const f = analyticsFixture();
  await f.trackEvent("decision_completed", { decision_seconds: 60, study_cohort: "old", analytics_version: 1 });
  assert.deepEqual(f.events, [{ name: "decision_completed", parameters: {
    decision_seconds: 60, study_cohort: "study_20261116", analytics_version: 2, app_environment: "production", app_version: appVersion,
  } }]);
  assert.deepEqual(f.initialization, ["defaults", "initialize"]);
  assert.deepEqual(f.defaults, [{ study_cohort: "study_20261116", analytics_version: 2,
    app_environment: "production", app_version: appVersion }]);
});

test("analytics stays disabled on the server/emulators and logging failures are reported without rejecting", async () => {
  for (const options of [{ browser: false }, { emulator: true }]) {
    const f = analyticsFixture(options);
    await f.trackEvent("group_created");
    assert.deepEqual(f.events, []);
  }
  const failed = analyticsFixture({ failLogging: true });
  await failed.trackEvent("group_created");
  assert.equal(failed.warnings.length, 1);
});

test("page timing excludes hidden/unfocused time, checkpoints long visits, and cleans up once", async () => {
  const f = analyticsFixture();
  const stop = f.trackScreen("home");
  f.advance(1250);
  f.focus(false);
  f.visibility("hidden");
  f.pagehide();
  f.advance(30000);
  f.heartbeat();
  f.visibility("visible");
  f.advance(10000);
  f.focus(true);
  f.advance(750);
  f.heartbeat();
  f.advance(500);
  stop(); stop();
  f.advance(10000); f.focus(true); f.heartbeat();
  await setImmediate();
  const durations = f.events.filter((event) => event.name === "page_time_spent");
  assert.deepEqual(durations.map((event) => event.parameters.duration_ms), [1250, 750, 500]);
  assert.deepEqual(durations.map((event) => event.parameters.flush_reason), ["blur", "heartbeat", "navigation"]);
  assert.equal(new Set(durations.map((event) => event.parameters.page_visit_id)).size, 1);
  assert.ok(durations.every((event) => event.parameters.screen_name === "home"));
  assert.equal(f.events.filter((event) => event.name === "screen_view").length, 1);
  assert.equal(f.intervals.size, 0);
});

test("page navigation creates separate visits and back-forward restoration resumes without counting the gap", async () => {
  const f = analyticsFixture();
  const leaveHome = f.trackScreen("home");
  f.advance(1200); leaveHome();
  const leaveResults = f.trackScreen("results");
  f.advance(2300); f.pagehide();
  f.pagehide();
  f.advance(30000); f.pageshow();
  f.advance(600); leaveResults();
  await setImmediate();
  const durations = f.events.filter((event) => event.name === "page_time_spent");
  assert.deepEqual(durations.map((event) => [event.parameters.screen_name, event.parameters.duration_ms]), [
    ["home", 1200], ["results", 2300], ["results", 600],
  ]);
  assert.notEqual(durations[0].parameters.page_visit_id, durations[1].parameters.page_visit_id);
  assert.equal(durations[1].parameters.page_visit_id, durations[2].parameters.page_visit_id);
  assert.deepEqual(f.events.filter((event) => event.name === "screen_view").map((event) => event.parameters.firebase_screen), ["home", "results"]);
});

test("an initially backgrounded screen records only time after becoming visible", async () => {
  const f = analyticsFixture();
  f.visibility("hidden");
  const stop = f.trackScreen("profile");
  f.advance(30000); f.heartbeat();
  f.visibility("visible");
  f.advance(2000); stop();
  await setImmediate();
  assert.deepEqual(f.events.filter((event) => event.name === "page_time_spent").map((event) => event.parameters.duration_ms), [2000]);
});

test("group joins preserve returning_member while snapshots do not duplicate action events", async (t) => {
  let now = studyStart - 1;
  t.mock.method(Date, "now", () => now);
  const f = backendFixture();
  await f.backend.createGroup({ groupName: "Legacy", location: "Atlanta" });
  assert.equal(f.analyticsEvents[0].parameters.group_cohort, "legacy");
  f.analyticsEvents.length = 0;
  now = studyStart;
  const { roomId } = await f.backend.createGroup({ groupName: "Private group", location: "Private location", tieStrategy: "runoff" });
  await f.backend.joinGroup(roomId, "Private member");
  await f.backend.joinGroup(roomId, "Private member");
  const count = f.analyticsEvents.length;
  const stop = f.backend.subscribeRoomState(roomId, () => {});
  await setImmediate(); stop();
  assert.equal(f.analyticsEvents.length, count);
  assert.deepEqual(f.analyticsEvents.map((event) => event.name), ["group_created", "experiment_assigned", "group_joined", "group_joined"]);
  assert.equal(f.analyticsEvents[1].parameters.assignment_source, "explicit");
  assert.equal(f.analyticsEvents[2].parameters.returning_member, false);
  assert.equal(f.analyticsEvents[3].parameters.returning_member, true);
  for (const event of f.analyticsEvents) {
    assert.equal(event.parameters.tie_strategy, "runoff");
    assert.equal(event.parameters.group_cohort, "study_20261116");
    assert.equal(event.parameters.group_id, roomId);
    assert.ok(!JSON.stringify(event).includes("Private"));
  }
  t.mock.method(Math, "random", () => 0.1);
  await f.backend.createGroup({ groupName: "Randomized", location: "Atlanta" });
  assert.equal(f.analyticsEvents.at(-1)?.parameters.assignment_source, "randomized");
  assert.equal(f.analyticsEvents.at(-1)?.parameters.tie_strategy, "random");
});

test("shortlist analytics distinguishes all-pruned nominations from no nominations and counts each attempt", async () => {
  const f = backendFixture();
  const { roomId } = await f.backend.createGroup({ groupName: "Dinner", location: "Atlanta" });
  await f.backend.joinGroup(roomId, "One");
  const beforeFailure = f.analyticsEvents.length;
  f.failTransactions(new Error("Commit rejected"));
  await assert.rejects(f.backend.markMemberReadyForVoting(roomId, "one"), /Commit rejected/);
  assert.equal(f.analyticsEvents.length, beforeFailure);
  f.failTransactions(null);
  await f.backend.markMemberReadyForVoting(roomId, "one");
  assert.equal(f.analyticsEvents.filter((event) => event.name === "shortlist_empty").length, 1);
  assert.equal(f.analyticsEvents.filter((event) => event.name === "all_choices_pruned").length, 0);
  await f.backend.submitPreferences(roomId, "one", { favorites: ["Alpha"], budgetRanges: ["UNDER_10"] });
  await f.backend.markMemberReadyForVoting(roomId, "one");
  const pruned = f.analyticsEvents.filter((event) => event.name === "all_choices_pruned");
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].parameters.nomination_count, 1);
  const evaluated = f.analyticsEvents.filter((event) => event.name === "shortlist_evaluated");
  assert.equal(evaluated[1].parameters.eligible_count, 0);
  assert.equal(evaluated[1].parameters.pruned_count, 1);
  assert.equal(evaluated[1].parameters.all_pruned, true);
  await f.backend.submitPreferences(roomId, "one", { budgetRanges: [...f.backend.ALL_BUDGET_RANGES] });
  await f.backend.markMemberReadyForVoting(roomId, "one");
  assert.equal(f.analyticsEvents.filter((event) => event.name === "voting_started").length, 1);
});

for (const scenario of ["random", "runoff", "runoff_random", "no_tie"] as const) {
  test(`${scenario} reports committed round outcomes, real resolution and decision time exactly once`, async (t) => {
    let now = studyStart + 1000;
    t.mock.method(Date, "now", () => now);
    const f = backendFixture();
    const strategy = scenario === "random" ? "random" : "runoff";
    const { roomId } = await f.backend.createGroup({ groupName: "Dinner", location: "Atlanta", tieStrategy: strategy });
    await f.backend.joinGroup(roomId, "One");
    await f.backend.submitPreferences(roomId, "one", { favorites: ["Alpha", "Beta"] });
    f.auth.currentUser = { ...f.user, uid: "two" };
    await f.backend.joinGroup(roomId, "Two");
    await f.backend.markMemberReadyForVoting(roomId, "two");
    f.auth.currentUser = f.user;
    const ballot = await f.backend.markMemberReadyForVoting(roomId, "one");
    const [alpha, beta] = ballot.state.options.map((restaurant) => restaurant.id);
    now += 60000;
    f.retryTransactions(3);
    await f.backend.submitVotes(roomId, "one", [alpha]);
    f.auth.currentUser = { ...f.user, uid: "two" };
    await f.backend.submitVotes(roomId, "two", [scenario === "no_tie" ? alpha : beta]);
    if (scenario === "runoff" || scenario === "runoff_random") {
      assert.equal(f.analyticsEvents.filter((event) => event.name === "runoff_started").length, 1);
      assert.equal(f.analyticsEvents.filter((event) => event.name === "decision_completed").length, 0);
      await f.backend.submitVotes(roomId, "two", [beta], 1);
      f.auth.currentUser = f.user;
      now += 30000;
      await f.backend.submitVotes(roomId, "one", [scenario === "runoff" ? beta : alpha], 1);
    }
    const decisions = f.analyticsEvents.filter((event) => event.name === "decision_completed");
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].parameters.tie_strategy, strategy);
    assert.equal(decisions[0].parameters.resolution_method, scenario === "no_tie" ? "none" : scenario === "runoff" ? "runoff" : "random");
    assert.equal(decisions[0].parameters.random_fallback, scenario === "runoff_random");
    assert.equal(decisions[0].parameters.decision_seconds, scenario.startsWith("runoff") ? 90 : 60);
    const rounds = f.analyticsEvents.filter((event) => event.name === "voting_round_completed");
    assert.equal(rounds[0].parameters.round, 0);
    assert.equal(rounds[0].parameters.had_tie, scenario !== "no_tie");
    const count = f.analyticsEvents.length;
    await assert.rejects(f.backend.submitVotes(roomId, f.auth.currentUser!.uid, [alpha]), /closed/);
    assert.equal(f.analyticsEvents.length, count);
    const uid = f.auth.currentUser!.uid;
    await f.backend.submitResultFeedback(roomId, uid, true);
    await f.backend.submitResultFeedback(roomId, uid, true);
    await f.backend.submitResultFeedback(roomId, uid, false);
    const feedback = f.analyticsEvents.filter((event) => event.name === "winner_satisfaction_submitted");
    assert.equal(feedback.length, 2);
    assert.equal(feedback[1].parameters.response_changed, true);
    assert.equal(feedback[1].parameters.response_count, 1);
    assert.equal(feedback[1].parameters.happy_count, 0);
  });
}
