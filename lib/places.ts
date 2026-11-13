// Shared Google Places types and helpers. Safe to import on the client:
// the API key only ever lives in the /api/places route handlers.

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

// Photos go through our own route so the API key never reaches the browser.
export function placePhotoUrl(photoName: string, maxWidthPx = 400) {
    return `/api/places/photo?${new URLSearchParams({ name: photoName, width: String(maxWidthPx) })}`;
}
