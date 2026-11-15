// Shared Google Places types and helpers. Safe to import on the client:
// the API key only ever lives in the /api/places route handlers.
import type { BudgetRange, Restaurant } from "../backend/AppBackend";
import type { DietaryLookup } from "./dietary";

// The point restaurant search and distances are measured from (the group's location).
export type GroupCenter = {
    latitude: number;
    longitude: number;
    label: string;
};

// One restaurant from Google Places, shaped for the search result cards.
export type PlaceResult = {
    placeId: string;
    name: string;
    address: string;
    cuisine: string;
    latitude: number | null;
    longitude: number | null;
    distanceMiles: number | null;
    rating: number | null;
    userRatingCount: number | null;
    priceLevel: string | null;
    photoName: string | null;
    mapsUrl: string;
    website: string;
};

const PRICE_LEVEL_LABELS: Record<string, string> = {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

export function priceLevelLabel(priceLevel?: string | null) {
    return priceLevel ? PRICE_LEVEL_LABELS[priceLevel] ?? "" : "";
}

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
    return typeof latitude === "number" && typeof longitude === "number"
        && Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

// Straight-line (haversine) distance in miles. Good enough for "x miles away".
export function milesBetween(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number },
) {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusMiles = 3958.8;
    const dLat = toRadians(b.latitude - a.latitude);
    const dLon = toRadians(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

const PRICE_LEVEL_BUDGETS: Record<string, BudgetRange> = {
    PRICE_LEVEL_FREE: "UNDER_10",
    PRICE_LEVEL_INEXPENSIVE: "UNDER_10",
    PRICE_LEVEL_MODERATE: "TEN_TO_THIRTY",
    PRICE_LEVEL_EXPENSIVE: "THIRTY_TO_SIXTY",
    PRICE_LEVEL_VERY_EXPENSIVE: "SIXTY_PLUS",
};

// Turns a search result (plus its Yelp lookup) into the Restaurant saved in the room.
// Optional fields are only set when present, because Firestore rejects undefined values.
export function placeToRestaurant(place: PlaceResult, dietary: DietaryLookup): Restaurant {
    const restaurant: Restaurant = {
        // same id format as /api/restaurants/search, so the same place isn't saved twice
        id: `google-${place.placeId}`,
        name: place.name,
        cuisine: place.cuisine || "Restaurant",
        // unknown price stays null; the backend only keeps it if everyone allows every budget
        budgetRange: place.priceLevel ? PRICE_LEVEL_BUDGETS[place.priceLevel] ?? null : null,
        priceLabel: priceLevelLabel(place.priceLevel) || "Price unavailable",
        distanceMiles: place.distanceMiles,
        rating: place.rating ?? 0,
        reviewCount: place.userRatingCount ?? 0,
        placeId: place.placeId,
        dietaryChecked: dietary.checked,
        dietaryTags: dietary.tags,
    };
    if (place.priceLevel) restaurant.priceLevel = place.priceLevel;
    if (place.latitude !== null && place.longitude !== null) {
        restaurant.lat = place.latitude;
        restaurant.lng = place.longitude;
    }
    if (place.address) restaurant.address = place.address;
    if (place.photoName) restaurant.photoName = place.photoName;
    if (place.mapsUrl) restaurant.mapsUrl = place.mapsUrl;
    if (place.website) restaurant.website = place.website;
    if (dietary.yelpUrl) restaurant.yelpUrl = dietary.yelpUrl;
    return restaurant;
}

// Photos go through our own route so the API key never reaches the browser.
export function placePhotoUrl(photoName: string, maxWidthPx = 400) {
    return `/api/places/photo?${new URLSearchParams({ name: photoName, width: String(maxWidthPx) })}`;
}
