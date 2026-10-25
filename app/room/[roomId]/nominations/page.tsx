import Nominations from "./nominations";

export const instant = false;
export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params;
    return <Nominations roomId={roomId} />;
}