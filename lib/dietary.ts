// Dietary needs a member can select, matched against Yelp's restaurant categories.
// Yelp categories describe what a restaurant is known for, not every dish it serves,
// so a missing tag means "unknown", never "unsafe" or "safe".

export type DietaryTag = "vegetarian" | "vegan" | "gluten_free" | "halal" | "kosher";

export const ALL_DIETARY_TAGS: DietaryTag[] = ["vegetarian", "vegan", "gluten_free", "halal", "kosher"];

export const dietaryLabels: Record<DietaryTag, string> = {
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    gluten_free: "Gluten-free",
    halal: "Halal",
    kosher: "Kosher",
};

export function isDietaryTag(value: unknown): value is DietaryTag {
    return typeof value === "string" && (ALL_DIETARY_TAGS as string[]).includes(value);
}

export type DietaryLookup = {
    // true when we found this restaurant on Yelp; false means we have no dietary data at all
    checked: boolean;
    tags: DietaryTag[];
    yelpUrl: string;
};

const NO_DIETARY_INFO: DietaryLookup = { checked: false, tags: [], yelpUrl: "" };

// Calls our /api/yelp/dietary route. Never throws: missing data just means "unknown".
export async function lookupDietary(place: { name: string; latitude: number | null; longitude: number | null }) {
    if (place.latitude === null || place.longitude === null) return NO_DIETARY_INFO;

    try {
        const params = new URLSearchParams({
            name: place.name,
            latitude: String(place.latitude),
            longitude: String(place.longitude),
        });
        const res = await fetch(`/api/yelp/dietary?${params}`);
        if (!res.ok) return NO_DIETARY_INFO;
        const data = (await res.json()) as Partial<DietaryLookup>;
        return {
            checked: Boolean(data.checked),
            tags: (data.tags ?? []).filter(isDietaryTag),
            yelpUrl: typeof data.yelpUrl === "string" ? data.yelpUrl : "",
        };
    } catch {
        return NO_DIETARY_INFO;
    }
}
