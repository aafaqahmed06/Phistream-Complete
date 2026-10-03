import type { Metadata } from "next";
import { ApplicationDetail } from "@/components/admin/ApplicationDetail";

// The applicant's name is private and only reaches the browser after sign-in,
// so the tab title stays generic.
export const metadata: Metadata = { title: "Application" };

export default async function AdminApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationDetail id={id} />;
}
