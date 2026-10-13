import type { Metadata } from "next";
import { VoiceRoom } from "@/components/voicing/VoiceRoom";

export const metadata: Metadata = { title: "Voicing room" };

export default async function VoicingRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VoiceRoom code={code} />;
}
