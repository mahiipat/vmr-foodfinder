import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createStudyReport, decodeDocument, toCsv } from "../lib/study-report.mjs";

const { values } = parseArgs({ options: {
  project: { type: "string" }, run: { type: "string" }, database: { type: "string", default: "(default)" },
  environment: { type: "string", default: "production" }, out: { type: "string", default: "study-report" },
} });

try {
  if (!values.project || !values.run || !/^[A-Za-z0-9_-]{1,80}$/.test(values.run)) {
    throw new Error("Usage: npm run study:export -- --project PROJECT --run RUN_ID [--environment production] [--out PATH_PREFIX]");
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && (!values.project.startsWith("demo-") || !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(emulator))) {
    throw new Error("Emulator export is restricted to local demo projects.");
  }
  let token = process.env.FIRESTORE_ACCESS_TOKEN;
  if (!emulator && !token) {
    try { token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
    catch { throw new Error("Authorize gcloud locally, or set FIRESTORE_ACCESS_TOKEN to a short-lived OAuth token locally. A Firebase web API key cannot export private study data."); }
  }
  const parent = `projects/${values.project}/databases/${encodeURIComponent(values.database)}/documents`;
  const base = emulator ? `http://${emulator}/v1` : "https://firestore.googleapis.com/v1";
  async function query(collectionId, fieldPath) {
    const documents = [];
    let last;
    for (;;) {
      const response = await fetch(`${base}/${parent}:runQuery`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${emulator ? "owner" : token}` },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: values.run } } },
          orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 500,
          ...(last ? { startAt: { values: [{ referenceValue: last }], before: false } } : {}),
        } }),
      });
      if (!response.ok) throw new Error(`Firestore export failed (${response.status}): ${await response.text()}`);
      const rows = (await response.json()).filter((row) => row.document).map((row) => row.document);
      documents.push(...rows.map(decodeDocument));
      if (rows.length < 500) break;
      last = rows.at(-1).name;
    }
    return documents;
  }
  const [rooms, events] = await Promise.all([query("rooms", "study.runId"), query("study_events", "studyRunId")]);
  const report = createStudyReport(rooms, events, values.run, values.environment);
  await Promise.all([
    writeFile(`${values.out}.json`, JSON.stringify(report, null, 2) + "\n"),
    ...["groups", "methods", "pageVisits", "visitors"].map((table) => writeFile(`${values.out}-${table}.csv`, toCsv(report[table]))),
  ]);
  console.log(`Exported ${report.groups.length} groups and ${report.events.length} events to ${values.out}.json and CSV tables.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
