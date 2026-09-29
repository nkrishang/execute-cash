"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLogin } from "@privy-io/react-auth";
import { Logo } from "@/components/logo";
import { useSession, useSignInStalled } from "./providers";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export function LoginCard() {
  const { configured } = useSession();
  return (
    <div className="login-card">
      <Link href="/" className="login-mark" aria-label="Execute">
        <Logo title="" aria-hidden="true" />
      </Link>
      <h1 className="login-title">Sign-in to continue</h1>
      <p className="login-sub">Manage API secrets and webhooks.</p>
      {configured ? <PrivyLogin /> : <NotConfigured />}
    </div>
  );
}

function PrivyLogin() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { ready, authenticated } = useSession();
  const stalled = useSignInStalled();
  const { login } = useLogin({ onComplete: () => router.replace(next) });

  useEffect(() => {
    if (ready && authenticated) router.replace(next);
  }, [ready, authenticated, next, router]);

  const busy = !ready || authenticated;
  if (stalled) {
    return (
      <>
        <button type="button" className="btn btn-primary login-button" onClick={() => window.location.reload()}>
          Reload
        </button>
        <p className="login-fine">Sign-in isn’t responding.</p>
      </>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-primary login-button" disabled={busy} onClick={() => login()}>
        {busy ? "One moment" : "Continue with email"}
        {!busy && (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <p className="login-fine">We’ll email you a one-time code. No password.</p>
    </>
  );
}

function NotConfigured() {
  return (
    <p className="login-note">
      <strong>Sign-in is not configured.</strong> Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> in <code>.env.local</code> and restart the dev server.
    </p>
  );
}
