import type { Metadata } from "next";
import { Dashboard } from "@/components/app/dashboard";

export const metadata: Metadata = { title: "Dashboard — Execute" };

export default function DashboardPage() {
  return <Dashboard />;
}
