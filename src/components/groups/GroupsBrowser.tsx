"use client";

import { SpaceLobby } from "@/components/spaces/SpaceLobby";

/** Groups landing: create a group chat, join by code/link, or search public groups. */
export function GroupsBrowser() {
  return <SpaceLobby kind="group" />;
}
