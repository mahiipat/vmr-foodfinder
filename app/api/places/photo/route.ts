// Redirects to a Google Places photo. Going through this route keeps the API key off the client:
// Google returns a public photo URL (no key in it) that we redirect the browser to.
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(request: Request) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return new Response(null, { status: 503 });

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name") ?? "";
    const width = Math.min(Math.max(Number(searchParams.get("width")) || 400, 100), 1200);
    if (!PHOTO_NAME.test(name)) return new Response(null, { status: 400 });

    const res = await fetch(
        `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
        { headers: { "X-Goog-Api-Key": apiKey } },
    );
    if (!res.ok) {
        console.error("Places photo failed", res.status, await res.text());
        return new Response(null, { status: 502 });
    }

    const { photoUri } = (await res.json()) as { photoUri?: string };
    if (!photoUri) return new Response(null, { status: 404 });

    return new Response(null, {
        status: 302,
        // let the browser reuse the photo for a day instead of paying for it on every render
        headers: { Location: photoUri, "Cache-Control": "public, max-age=86400" },
    });
}
