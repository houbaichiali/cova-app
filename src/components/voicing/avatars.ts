/**
 * Placeholder avatars. To use your own models later:
 *  1. put the .glb files in /public/avatars/
 *  2. set `glb: "/avatars/yourfile.glb"` on an entry below (or add a new entry).
 * The stage animates the mouth through a morph target named like jawOpen / mouthOpen / viseme_aa,
 * and falls back to a gentle scale pulse when the model has none.
 */
export interface AvatarDef {
  id: string;
  label: string;
  color: number;
  accent: number;
  shape: "robot" | "blob" | "cat" | "alien";
  glb?: string;
}

export const AVATARS: AvatarDef[] = [
  { id: "robot", label: "Robot", color: 0x6f9fba, accent: 0xa9cfe5, shape: "robot" },
  { id: "blob", label: "Blob", color: 0xf0a8b8, accent: 0xffd1dc, shape: "blob" },
  { id: "cat", label: "Cat", color: 0xf2b866, accent: 0xffe0a8, shape: "cat" },
  { id: "alien", label: "Alien", color: 0x7fd6a4, accent: 0xc4f5da, shape: "alien" },
];

export const getAvatar = (id: string): AvatarDef => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;
