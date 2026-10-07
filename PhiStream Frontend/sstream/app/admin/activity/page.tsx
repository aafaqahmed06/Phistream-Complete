import type { Metadata } from "next";
import { AuditLog } from "@/components/admin/AuditLog";

export const metadata: Metadata = { title: "Activity" };

export default function AdminActivityPage() {
  return <AuditLog />;
}
