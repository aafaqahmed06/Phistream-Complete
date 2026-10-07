import type { Metadata } from "next";
import { NotificationsList } from "@/components/admin/NotificationsList";

export const metadata: Metadata = { title: "Emails" };

export default function AdminEmailsPage() {
  return <NotificationsList />;
}
