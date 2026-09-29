import type { Metadata } from "next";
import { Providers } from "@/components/app/providers";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Sign-in and the dashboard, under Privy. The landing page and address pages never load it. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <Providers>{children}</Providers>;
}
