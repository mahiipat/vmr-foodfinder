import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as places from "../lib/places.ts";
import * as dietary from "../lib/dietary.ts";

function loadRoute(path: string) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const exports: Record<string, (request: Request) => Promise<Response>> = {};
  const execute = runInThisContext(`(function(require, exports) { ${compiled.outputText}\n})`);
  execute((id: string) => {
    if (id === "../../../../lib/places") return places;
    if (id === "../../../../lib/dietary") return dietary;
    throw new Error(`Unexpected import: ${id}`);
  }, exports);
  return exports;
}

test("Places search uses nearby coordinates or group-location text and preserves card details", async (t) => {
  const previousEnv = process.env;
  process.env = { ...process.env, GOOGLE_PLACES_API_KEY: "test-key" };
  t.after(() => { process.env = previousEnv; });
  const payloads: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    payloads.push(JSON.parse(String(init.body)));
    return Response.json({ places: [{ id: "alpha", displayName: { text: "Alpha" },
      location: { latitude: 33.75, longitude: -84.39 }, photos: [{ name: "places/alpha/photos/one" }],
      googleMapsUri: "https://maps.google.com/", websiteUri: "https://example.com/", rating: 4.2, userRatingCount: 100 }] });
  });
  const { POST } = loadRoute("../app/api/places/search/route.ts");
  const request = (body: unknown) => new Request("http://localhost/api/places/search", { method: "POST", body: JSON.stringify(body) });
  const response = await POST(request({ latitude: 33.75, longitude: -84.39 }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.places[0].placeId, "alpha");
  assert.equal(data.places[0].photoName, "places/alpha/photos/one");
  assert.equal(data.places[0].distanceMiles, 0);
  assert.equal(data.places[0].priceLevel, null);
  assert.deepEqual(payloads[0].locationRestriction, { circle: { center: { latitude: 33.75, longitude: -84.39 }, radius: 5000 } });
  await POST(request({ query: "pizza", location: "Atlanta" }));
  assert.equal(payloads[1].textQuery, "pizza restaurant in Atlanta");
  await POST(request({ query: "pizza", location: "Atlanta", latitude: 33.75, longitude: -84.39 }));
  assert.equal(payloads[2].textQuery, "pizza");
});

test("Yelp dietary lookup rejects missing coordinates and only returns nearby matching categories", async (t) => {
  const previousEnv = process.env;
  process.env = { ...process.env, YELP_API_KEY: "test-key" };
  t.after(() => { process.env = previousEnv; });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ businesses: [
    { name: "Alpha", coordinates: { latitude: 40, longitude: -80 }, categories: [{ alias: "halal" }] },
    { name: "Alpha", coordinates: { latitude: 33.75, longitude: -84.39 }, categories: [{ alias: "vegan" }, { alias: "cafes" }], url: "https://www.yelp.com/biz/alpha?tracking=1" },
  ] }));
  const { GET } = loadRoute("../app/api/yelp/dietary/route.ts");
  assert.equal((await GET(new Request("http://localhost/api/yelp/dietary?name=Alpha"))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
  const response = await GET(new Request("http://localhost/api/yelp/dietary?name=Alpha&latitude=33.75&longitude=-84.39"));
  assert.deepEqual(await response.json(), { checked: true, tags: ["vegan"], yelpUrl: "https://www.yelp.com/biz/alpha" });
});
