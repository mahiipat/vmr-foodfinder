import assert from "node:assert/strict";
import test from "node:test";
import { createStudyReport, decodeDocument, toCsv } from "../lib/study-report.mjs";

test("study reports filter runs/environments, aggregate page segments and compare randomized groups", () => {
  const study = { runId: "pilot", environment: "production", appVersion: "0.1.0", assignmentSource: "randomized",
    shortlistEvaluations: 3, emptyShortlists: 1, allChoicesPruned: 1, initialTies: 1, runoffTies: 0,
    decisionSeconds: 90, resolutionMethod: "runoff", happyCount: 1, responseCount: 2 };
  const room = { id: "one", createdAt: 1700000000000, tieStrategy: "runoff", phase: "results",
    members: { a: { name: "Do not export" }, b: {} }, restaurants: { alpha: {} }, study };
  const context = { visitorId: "visitor", sessionId: "session", groupId: "one" };
  const event = { studyRunId: "pilot", environment: "production", actorUid: "a", context,
    recordedAt: "2026-11-16T02:00:00Z", eventName: "page_time_spent",
    parameters: { page_visit_id: "visit", screen_name: "voting", duration_ms: 1200 } };
  const report = createStudyReport([room, { ...room, study: { ...study, runId: "developer_testing" } },
    { ...room, id: "explicit", study: { ...study, assignmentSource: "explicit" } }], [
    event, { ...event, actorUid: "upgraded-account", parameters: { ...event.parameters, duration_ms: 800 } },
    { ...event, studyRunId: "old" }, { ...event, environment: "development" },
  ], "pilot");
  assert.equal(report.groups.length, 2);
  assert.ok(!JSON.stringify(report.groups).includes("Do not export"));
  assert.equal(report.events.length, 2);
  assert.equal(report.pageVisits.length, 1); assert.equal(report.pageVisits[0].durationMs, 2000);
  const runoff = report.methods.find((method) => method.method === "runoff")!;
  assert.equal(runoff.groupCount, 1); assert.equal(runoff.happyCount, 1); assert.equal(runoff.responseCount, 2);
  assert.equal(runoff.allPrunedRate, 0.5); assert.equal(runoff.initialTieRate, 1);
  assert.equal(runoff.meanDecisionSeconds, 90);
  assert.equal(report.methods.find((method) => method.method === "random")?.meanDecisionSeconds, null);
});

test("Firestore REST decoding preserves timestamps/nested values and CSV is spreadsheet-safe", () => {
  const document = decodeDocument({ name: "projects/demo/databases/(default)/documents/study_events/event-1", fields: {
    recordedAt: { timestampValue: "2026-11-16T02:00:00Z" },
    parameters: { mapValue: { fields: { duration_ms: { integerValue: "1250" }, happy: { booleanValue: false } } } },
  } });
  assert.equal(document.id, "event-1");
  assert.deepEqual(document.parameters, { duration_ms: 1250, happy: false });
  assert.equal(document.recordedAt, "2026-11-16T02:00:00Z");
  assert.equal(toCsv([{ name: '=HYPERLINK("bad")', count: 2 }]), '"name","count"\n"\'=HYPERLINK(""bad"")","2"\n');
});
