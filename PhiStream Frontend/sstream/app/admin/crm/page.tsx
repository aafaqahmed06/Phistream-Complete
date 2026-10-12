import type { Metadata } from "next";
import { NotificationsList } from "@/components/admin/NotificationsList";

export const metadata: Metadata = { title: "CRM sync" };

export default function AdminCrmPage() {
  return <NotificationsList kind="crm" />;
}
