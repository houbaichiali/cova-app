import type { Metadata } from "next";
import { SavedPostsList } from "@/components/community/SavedPostsList";

export const metadata: Metadata = { title: "Saved posts" };

export default function SavedPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <SavedPostsList />
    </div>
  );
}
