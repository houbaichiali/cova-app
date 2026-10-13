import type { Metadata } from "next";
import { SpaceLobby } from "@/components/spaces/SpaceLobby";

export const metadata: Metadata = { title: "Voicing" };

export default function VoicingPage() {
  return <SpaceLobby kind="voice" />;
}
