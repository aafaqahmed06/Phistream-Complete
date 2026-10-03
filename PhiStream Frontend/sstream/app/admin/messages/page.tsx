import type { Metadata } from "next";
import { MessagesList } from "@/components/admin/MessagesList";

export const metadata: Metadata = { title: "Messages" };

export default function AdminMessagesPage() {
  return <MessagesList />;
}
