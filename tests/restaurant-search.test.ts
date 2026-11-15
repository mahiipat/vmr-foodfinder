import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/restaurants/search/route.ts";

test("Google Places results are normalized into restaurant cards", async () => {
  const originalFetch = globalThis.fetch;
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  const previousYelpKey = process.env.YELP_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
  delete process.env.YELP_API_KEY;
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://places.googleapis.com/v1/places:searchText");
    assert.equal(new Headers(init?.headers).get("X-Goog-Api-Key"), "test-google-key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      textQuery: "Jimmy John's restaurant in Atlanta, GA",
      includedType: "restaurant",
      maxResultCount: 6,
    });
    return Response.json({
      places: [{
        id: "place-123",
        displayName: { text: "Jimmy John's" },
        primaryTypeDisplayName: { text: "Sandwich shop" },
        priceLevel: "PRICE_LEVEL_INEXPENSIVE",
        rating: 4.2,
        userRatingCount: 1200,
        location: { latitude: 33.75, longitude: -84.39 },
        formattedAddress: "1 Main Street, Atlanta, GA",
      }],
    });
  }) as typeof fetch;

  try {
    const response = await GET(new Request("http://localhost/api/restaurants/search?query=Jimmy%20John%27s&location=Atlanta%2C%20GA"));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(data, {
      source: "google",
      restaurants: [{
        id: "google-place-123",
        name: "Jimmy John's",
        cuisine: "Sandwich shop",
        budgetRange: null,
        priceLevel: "PRICE_LEVEL_INEXPENSIVE",
        priceLabel: "$",
        distanceMiles: null,
        rating: 4.2,
        reviewCount: 1200,
        lat: 33.75,
        lng: -84.39,
        address: "1 Main Street, Atlanta, GA",
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
    if (previousYelpKey === undefined) delete process.env.YELP_API_KEY;
    else process.env.YELP_API_KEY = previousYelpKey;
  }
});

test("Yelp is used when Google Places fails", async () => {
  const originalFetch = globalThis.fetch;
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  const previousYelpKey = process.env.YELP_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
  process.env.YELP_API_KEY = "test-yelp-key";
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://places.googleapis.com/")) {
      return Response.json({ error: "provider unavailable" }, { status: 503 });
    }
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-yelp-key");
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("term"), "pizza restaurant");
    assert.equal(url.searchParams.get("location"), "Atlanta, GA");
    return Response.json({
      businesses: [{
        id: "business-456",
        name: "Pizza Place",
        categories: [{ title: "Pizza" }],
        price: "$$",
        rating: 4.5,
        review_count: 875,
        coordinates: { latitude: 33.75, longitude: -84.39 },
        location: { display_address: ["2 Main Street", "Atlanta, GA"] },
        distance: 1609.344,
      }],
    });
  }) as typeof fetch;

  try {
    const response = await GET(new Request("http://localhost/api/restaurants/search?query=pizza&location=Atlanta%2C%20GA"));
    const data = await response.json() as { source: string; restaurants: Array<Record<string, unknown>> };
    assert.equal(response.status, 200);
    assert.equal(data.source, "yelp");
    assert.deepEqual(data.restaurants[0], {
      id: "yelp-business-456",
      name: "Pizza Place",
      cuisine: "Pizza",
      budgetRange: null,
      priceLabel: "$$",
      distanceMiles: 1,
      rating: 4.5,
      reviewCount: 875,
      lat: 33.75,
      lng: -84.39,
      address: "2 Main Street, Atlanta, GA",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
    if (previousYelpKey === undefined) delete process.env.YELP_API_KEY;
    else process.env.YELP_API_KEY = previousYelpKey;
  }
});

test("restaurant searches reject incomplete or oversized input", async () => {
  const response = await GET(new Request("http://localhost/api/restaurants/search?query=pizza"));
  assert.equal(response.status, 400);
});
