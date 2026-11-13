import type { GroupCenter } from "../../../../lib/places";

// Turns a city or ZIP code ("Atlanta", "30332") into coordinates for centering
// restaurant search. Uses Places Text Search so no extra Google API needs enabling.
type TextSearchResponse = {
    places?: {
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
    }[];
};

export async function GET(request: Request) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return Response.json({ error: "Restaurant search is not configured." }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") ?? "").trim().slice(0, 100);
    if (query.length < 2) {
        return Response.json({ error: "Enter a city or ZIP code." }, { status: 400 });
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.formattedAddress,places.location",
        },
        body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    });

    if (!res.ok) {
        console.error("Places geocode failed", res.status, await res.text());
        return Response.json({ error: "Could not look up that location." }, { status: 502 });
    }

    const data: TextSearchResponse = await res.json();
    const match = data.places?.[0];
    if (!match?.location) {
        return Response.json({ error: "Couldn't find that city or ZIP code." }, { status: 404 });
    }

    const center: GroupCenter = {
        latitude: match.location.latitude,
        longitude: match.location.longitude,
        label: match.formattedAddress ?? query,
    };
    return Response.json({ center });
}
