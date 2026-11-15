import type { Restaurant } from "../../../../backend/AppBackend";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  types?: string[];
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
};

type YelpBusiness = {
  id?: string;
  name?: string;
  categories?: Array<{ title?: string }>;
  price?: string;
  rating?: number;
  review_count?: number;
  coordinates?: { latitude?: number; longitude?: number };
  location?: { display_address?: string[] };
  distance?: number;
};

function googlePriceLabel(level?: string): string {
  switch (level) {
    case "PRICE_LEVEL_FREE":
      return "Free";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
    default:
      return "Price unavailable";
  }
}

function cleanRating(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cleanCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function validCoordinates(lat?: number, lng?: number): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

function mapGooglePlaces(places: GooglePlace[] = []): Restaurant[] {
  return places.flatMap((place) => {
    const name = place.displayName?.text?.trim();
    if (!place.id || !name) return [];
    const type = place.primaryTypeDisplayName?.text ||
      place.primaryType?.replaceAll("_", " ") || "Restaurant";
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;

    return [{
      id: `google-${place.id}`,
      name,
      cuisine: type,
      budgetRange: null,
      priceLevel: place.priceLevel,
      priceLabel: googlePriceLabel(place.priceLevel),
      distanceMiles: null,
      rating: cleanRating(place.rating),
      reviewCount: cleanCount(place.userRatingCount),
      ...(validCoordinates(lat, lng) ? { lat, lng } : {}),
      ...(place.formattedAddress ? { address: place.formattedAddress } : {}),
    }];
  });
}

function mapYelpBusinesses(businesses: YelpBusiness[] = []): Restaurant[] {
  return businesses.flatMap((business) => {
    const name = business.name?.trim();
    if (!business.id || !name) return [];
    const categories = business.categories?.flatMap((category) =>
      category.title ? [category.title] : [],
    );
    const lat = business.coordinates?.latitude;
    const lng = business.coordinates?.longitude;
    const distanceMiles = typeof business.distance === "number" && Number.isFinite(business.distance)
      ? business.distance / 1609.344
      : null;

    return [{
      id: `yelp-${business.id}`,
      name,
      cuisine: categories?.slice(0, 2).join(", ") || "Restaurant",
      budgetRange: null,
      priceLabel: business.price && /^\$+$/.test(business.price) ? business.price : "Price unavailable",
      distanceMiles,
      rating: cleanRating(business.rating),
      reviewCount: cleanCount(business.review_count),
      ...(validCoordinates(lat, lng) ? { lat, lng } : {}),
      ...(business.location?.display_address?.length
        ? { address: business.location.display_address.join(", ") }
        : {}),
    }];
  });
}

async function searchGoogle(query: string, location: string, apiKey: string): Promise<Restaurant[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.primaryTypeDisplayName",
        "places.primaryType",
        "places.priceLevel",
        "places.rating",
        "places.userRatingCount",
        "places.location",
        "places.formattedAddress",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${query} restaurant in ${location}`,
      includedType: "restaurant",
      maxResultCount: 6,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google Places search failed.");
  const data = await response.json() as { places?: GooglePlace[] };
  return mapGooglePlaces(data.places);
}

async function searchYelp(query: string, location: string, apiKey: string): Promise<Restaurant[]> {
  const url = new URL("https://api.yelp.com/v3/businesses/search");
  url.search = new URLSearchParams({
    term: `${query} restaurant`,
    location,
    limit: "6",
    sort_by: "best_match",
  }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Yelp search failed.");
  const data = await response.json() as { businesses?: YelpBusiness[] };
  return mapYelpBusinesses(data.businesses);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim() ?? "";
  const location = params.get("location")?.trim() ?? "";
  if (!query || query.length > 100 || !location || location.length > 200) {
    return Response.json({ error: "Enter a restaurant and group location to search." }, { status: 400 });
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const yelpKey = process.env.YELP_API_KEY;
  if (!googleKey && !yelpKey) {
    return Response.json({ error: "Restaurant search is not configured on the server." }, { status: 503 });
  }

  let providerFailed = false;
  if (googleKey) {
    try {
      const restaurants = await searchGoogle(query, location, googleKey);
      if (restaurants.length > 0 || !yelpKey) {
        return Response.json({ restaurants, source: "google" });
      }
    } catch {
      providerFailed = true;
    }
  }

  if (yelpKey) {
    try {
      const restaurants = await searchYelp(query, location, yelpKey);
      return Response.json({ restaurants, source: "yelp" });
    } catch {
      providerFailed = true;
    }
  }

  if (providerFailed) {
    return Response.json({ error: "Restaurant search is temporarily unavailable. Please try again." }, { status: 502 });
  }
  return Response.json({ restaurants: [], source: "google" });
}
