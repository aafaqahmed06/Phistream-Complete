import type { Metadata } from "next";
import { ApplicationsList } from "@/components/admin/ApplicationsList";

export const metadata: Metadata = { title: "Applications" };

export default function AdminApplicationsPage() {
  return <ApplicationsList />;
}
