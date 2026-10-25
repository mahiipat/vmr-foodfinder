import Results from "./results";

export const instant = false;
export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params;
    return <Results roomId={roomId} />;
}