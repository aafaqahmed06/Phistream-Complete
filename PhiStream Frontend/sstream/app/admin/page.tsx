import type { Metadata } from "next";
import { Overview } from "@/components/admin/Overview";

// A layout's title template only reaches NESTED pages, so this one is absolute.
export const metadata: Metadata = { title: { absolute: "Overview — Control room" } };

export default function AdminOverviewPage() {
  return <Overview />;
}
