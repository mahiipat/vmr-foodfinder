import { isValidCoordinate, milesBetween, type PlaceResult } from "../../../../lib/places";

// One call returns everything the result cards need, so we don't need a separate details request.
const FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.shortFormattedAddress",
    "places.formattedAddress",
    "places.location",
    "places.primaryTypeDisplayName",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.photos",
    "places.googleMapsUri",
    "places.websiteUri",
].join(",");

const NEARBY_RADIUS_METERS = 5000; // about 3 miles for "closest to the group"
const SEARCH_BIAS_RADIUS_METERS = 25000; // typed searches prefer nearby but can find places anywhere
const MAX_RESULTS = 10;

type GooglePlace = {
    id: string;
    displayName?: { text: string };
    shortFormattedAddress?: string;
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    primaryTypeDisplayName?: { text: string };
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    photos?: { name: string }[];
    googleMapsUri?: string;
    websiteUri?: string;
};

// Empty query: restaurants closest to the group. Typed query: search by name, biased toward the group.
export async function POST(request: Request) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return Response.json({ error: "Restaurant search is not configured." }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim().slice(0, 100) : "";
    const center = isValidCoordinate(body?.latitude, body?.longitude)
        ? { latitude: body.latitude as number, longitude: body.longitude as number }
        : null;

    if (!query && !center) return Response.json({ places: [] });

    const [url, payload] = query
        ? [
            "https://places.googleapis.com/v1/places:searchText",
            {
                textQuery: query,
                includedType: "restaurant",
                pageSize: MAX_RESULTS,
                ...(center && { locationBias: { circle: { center, radius: SEARCH_BIAS_RADIUS_METERS } } }),
            },
        ]
        : [
            "https://places.googleapis.com/v1/places:searchNearby",
            {
                includedTypes: ["restaurant"],
                maxResultCount: MAX_RESULTS,
                rankPreference: "DISTANCE",
                locationRestriction: { circle: { center, radius: NEARBY_RADIUS_METERS } },
            },
        ];

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        console.error("Places search failed", res.status, await res.text());
        return Response.json({ error: "Restaurant search failed." }, { status: 502 });
    }

    const data: { places?: GooglePlace[] } = await res.json();
    const places: PlaceResult[] = (data.places ?? []).map((p) => {
        const location = p.location && isValidCoordinate(p.location.latitude, p.location.longitude) ? p.location : null;
        return {
            placeId: p.id,
            name: p.displayName?.text ?? "",
            address: p.shortFormattedAddress ?? p.formattedAddress ?? "",
            cuisine: p.primaryTypeDisplayName?.text ?? "Restaurant",
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
            distanceMiles: location && center ? Math.round(milesBetween(center, location) * 10) / 10 : null,
            rating: p.rating ?? null,
            userRatingCount: p.userRatingCount ?? null,
            priceLevel: p.priceLevel ?? null,
            photoName: p.photos?.[0]?.name ?? null,
            mapsUrl: p.googleMapsUri ?? "",
            website: p.websiteUri ?? "",
        };
    });

    return Response.json({ places });
}
