// Turns device coordinates into a readable street address, e.g.
// "350 Ferst Drive NW, Atlanta, Georgia 30332". Uses OpenStreetMap's free
// Nominatim service (no API key). Returns null if no address can be found.

type NominatimAddress = {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
};

export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    try {
        const params = new URLSearchParams({
            lat: String(latitude),
            lon: String(longitude),
            format: "jsonv2",
            addressdetails: "1",
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
        if (!response.ok) return null;
        const data = (await response.json()) as { address?: NominatimAddress; display_name?: string };
        return formatAddress(data.address) ?? data.display_name ?? null;
    } catch {
        return null;
    }
}

function formatAddress(address?: NominatimAddress): string | null {
    if (!address) return null;
    const street = [address.house_number, address.road].filter(Boolean).join(" ")
        || address.neighbourhood || address.suburb || "";
    const city = address.city || address.town || address.village || address.municipality || address.county || "";
    const stateZip = [address.state, address.postcode].filter(Boolean).join(" ");
    const parts = [street, city, stateZip].filter(Boolean);
    // a street or neighborhood is what makes it "exact"; without one, let the caller fall back
    return street && parts.length > 1 ? parts.join(", ") : null;
}
