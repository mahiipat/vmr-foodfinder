import { isDietaryTag, type DietaryLookup, type DietaryTag } from "../../../../lib/dietary";
import { isValidCoordinate, milesBetween } from "../../../../lib/places";

// Finds a Google Places restaurant on Yelp and returns its dietary categories.
// Yelp has no menu or allergen data, only categories like "vegan" or "halal",
// so this is advisory: the UI shows anything not listed as "unknown", not "unsafe".
const MAX_MATCH_DISTANCE_MILES = 0.25; // same name AND this close counts as the same restaurant

type YelpBusiness = {
    name: string;
    url?: string;
    coordinates?: { latitude: number; longitude: number };
    categories?: { alias: string }[];
};

function simplify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(request: Request) {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
        return Response.json({ error: "Dietary lookup is not configured." }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const name = (searchParams.get("name") ?? "").trim().slice(0, 100);
    const latitude = Number(searchParams.get("latitude"));
    const longitude = Number(searchParams.get("longitude"));
    if (!name || !isValidCoordinate(latitude, longitude)) {
        return Response.json({ error: "Name and location are required." }, { status: 400 });
    }

    const params = new URLSearchParams({
        term: name,
        latitude: String(latitude),
        longitude: String(longitude),
        limit: "5",
        sort_by: "best_match",
    });
    const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });

    if (!res.ok) {
        console.error("Yelp search failed", res.status, await res.text());
        return Response.json({ error: "Dietary lookup failed." }, { status: 502 });
    }

    const data: { businesses?: YelpBusiness[] } = await res.json();
    const target = simplify(name);
    const match = (data.businesses ?? []).find((b) => {
        const candidate = simplify(b.name);
        const sameName = candidate.includes(target) || target.includes(candidate);
        const close = b.coordinates && isValidCoordinate(b.coordinates.latitude, b.coordinates.longitude)
            && milesBetween({ latitude, longitude }, b.coordinates) <= MAX_MATCH_DISTANCE_MILES;
        return sameName && close;
    });

    const result: DietaryLookup = match
        ? {
            checked: true,
            tags: Array.from(new Set((match.categories ?? []).map((c) => c.alias).filter(isDietaryTag))) as DietaryTag[],
            yelpUrl: match.url?.split("?")[0] ?? "",
        }
        : { checked: false, tags: [], yelpUrl: "" };

    return Response.json(result);
}
