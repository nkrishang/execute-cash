import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginCard } from "@/components/app/login-card";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in — Execute" };

export default function LoginPage() {
  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-brand" aria-label="Execute">
            <Logo className="nav-logo" title="" aria-hidden="true" />
            <span className="nav-wordmark">execute</span>
          </Link>
        </div>
      </header>
      <main className="login">
        <Suspense fallback={null}>
          <LoginCard />
        </Suspense>
      </main>
    </>
  );
}
