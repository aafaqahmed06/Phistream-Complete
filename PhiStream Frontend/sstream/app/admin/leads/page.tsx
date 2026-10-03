import type { Metadata } from "next";
import { LeadsList } from "@/components/admin/LeadsList";

export const metadata: Metadata = { title: "Leads" };

export default function AdminLeadsPage() {
  return <LeadsList />;
}
