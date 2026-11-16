/** @returns {Record<string, unknown> & { id: string }} */
export function decodeDocument(document) {
  function decode(value) {
    if ("nullValue" in value) return null;
    for (const key of ["stringValue", "booleanValue", "timestampValue", "referenceValue"]) if (key in value) return value[key];
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return value.doubleValue;
    if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
    if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
    throw new Error("Unsupported Firestore value in study export.");
  }
  return { id: document.name.split("/").at(-1), ...Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, decode(value)])) };
}

export function createStudyReport(rooms, events, runId, environment = "production") {
  const selectedEvents = events.filter((event) => event.studyRunId === runId && event.environment === environment);
  const groups = rooms.filter((room) => room.study?.runId === runId && room.study.environment === environment).map((room) => ({
    groupId: room.id, createdAt: new Date(room.createdAt).toISOString(), appVersion: room.study.appVersion,
    chosenMethod: room.tieStrategy, assignmentSource: room.study.assignmentSource, phase: room.phase,
    memberCount: Object.keys(room.members).length, nominationCount: Object.keys(room.restaurants).length,
    ...room.study,
    unhappyCount: room.study.responseCount - room.study.happyCount,
    happyFraction: room.study.responseCount ? room.study.happyCount / room.study.responseCount : null,
  }));
  const pageVisits = new Map();
  const visitors = new Map();
  const eventCounts = {};
  for (const event of selectedEvents) {
    eventCounts[event.eventName] = (eventCounts[event.eventName] ?? 0) + 1;
    const visitor = visitors.get(event.context.visitorId) ?? { visitorId: event.context.visitorId, sessions: new Set(), days: new Set(), firstSeenAt: event.recordedAt, lastSeenAt: event.recordedAt };
    visitor.sessions.add(event.context.sessionId); visitor.days.add(event.recordedAt.slice(0, 10));
    if (event.recordedAt < visitor.firstSeenAt) visitor.firstSeenAt = event.recordedAt;
    if (event.recordedAt > visitor.lastSeenAt) visitor.lastSeenAt = event.recordedAt;
    visitors.set(visitor.visitorId, visitor);
    if ((event.eventName === "screen_view" || event.eventName === "page_time_spent") && typeof event.parameters.page_visit_id === "string") {
      const key = `${event.context.visitorId}:${event.parameters.page_visit_id}`;
      const visit = pageVisits.get(key) ?? { visitorId: event.context.visitorId, sessionId: event.context.sessionId,
        groupId: event.context.groupId, screen: event.parameters.screen_name, pageVisitId: event.parameters.page_visit_id, durationMs: 0 };
      if (event.eventName === "page_time_spent") visit.durationMs += event.parameters.duration_ms;
      pageVisits.set(key, visit);
    }
  }
  const methods = ["random", "runoff"].map((method) => {
    const assigned = groups.filter((group) => group.chosenMethod === method && group.assignmentSource === "randomized");
    const completed = assigned.filter((group) => group.phase === "results");
    const shortlistEvaluations = assigned.reduce((sum, group) => sum + group.shortlistEvaluations, 0);
    const allChoicesPruned = assigned.reduce((sum, group) => sum + group.allChoicesPruned, 0);
    const nonemptyEvaluations = shortlistEvaluations - assigned.reduce((sum, group) => sum + group.emptyShortlists, 0);
    const initialRoundsCompleted = assigned.filter((group) => group.phase === "runoff" || group.phase === "results").length;
    const initialTieCount = assigned.reduce((sum, group) => sum + group.initialTies, 0);
    return { method, groupCount: assigned.length, completedCount: completed.length,
      shortlistEvaluations, nonemptyEvaluations, allChoicesPruned,
      allPrunedRate: nonemptyEvaluations ? allChoicesPruned / nonemptyEvaluations : null,
      initialRoundsCompleted, initialTieCount, initialTieRate: initialRoundsCompleted ? initialTieCount / initialRoundsCompleted : null,
      randomFallbackCount: completed.filter((group) => group.chosenMethod === "runoff" && group.resolutionMethod === "random").length,
      meanDecisionSeconds: completed.length ? completed.reduce((sum, group) => sum + group.decisionSeconds, 0) / completed.length : null,
      happyCount: completed.reduce((sum, group) => sum + group.happyCount, 0), responseCount: completed.reduce((sum, group) => sum + group.responseCount, 0),
    };
  });
  return { runId, environment, groups, methods, eventCounts, pageVisits: [...pageVisits.values()],
    visitors: [...visitors.values()].map(({ sessions, days, ...visitor }) => ({ ...visitor, sessionCount: sessions.size, activeDays: [...days].sort() })),
    events: selectedEvents };
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [keys.map(cell).join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\n") + "\n";
}
