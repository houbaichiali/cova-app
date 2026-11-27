import type { Metadata } from "next";
import { VerifyEmailPanel } from "@/components/auth/VerifyEmailPanel";

export const metadata: Metadata = { title: "Verify your email · COVA" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return <VerifyEmailPanel initialEmail={email ?? ""} />;
}
