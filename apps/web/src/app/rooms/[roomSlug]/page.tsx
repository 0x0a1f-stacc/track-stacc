import { RoomShell } from "@/components/room/RoomShell";

export default function RoomPage({ params }: { params: { roomSlug: string } }) {
  return <RoomShell roomSlug={params.roomSlug} />;
}
