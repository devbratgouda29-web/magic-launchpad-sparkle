import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Safety net for every Supabase auth redirect (email confirmation, magic link,
 * OAuth). Never 404s: it settles the session, then sends the user to a real
 * screen instead of leaving them on an unknown URL.
 */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — From The Last Bench" },
      { name: "description", content: "Completing your sign-in and returning you to the app." },
      { property: "og:title", content: "Signing you in — From The Last Bench" },
      { property: "og:description", content: "Completing your sign-in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rawHash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(rawHash);
        const query = new URLSearchParams(window.location.search);

        if (hashParams.get("type") === "recovery") {
          window.location.replace(`/reset-password#${rawHash}`);
          return;
        }

        // 1) PKCE / email-confirmation code flow
        const code = query.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        // 2) Implicit flow: tokens arrive in the URL hash
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (!code && access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }

        // 3) Older confirmation links carry a token_hash to verify
        const token_hash = query.get("token_hash") ?? hashParams.get("token_hash");
        const otpType = (query.get("type") ?? hashParams.get("type")) as
          | "signup"
          | "email"
          | "magiclink"
          | "invite"
          | "email_change"
          | null;
        if (!code && !access_token && token_hash && otpType) {
          await supabase.auth.verifyOtp({ token_hash, type: otpType });
        }

        // Clean the sensitive bits out of the address bar.
        window.history.replaceState({}, "", "/auth/callback");

        const { data } = await supabase.auth.getSession();
        if (!active) return;
        navigate({ to: data.session ? "/home" : "/home", replace: true });
      } catch {
        if (active) navigate({ to: "/home", replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);


  return (
    <main className="grid min-h-screen place-items-center gap-3 bg-background p-6 text-center">
      <div>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-400" />
        <h1 className="mt-3 text-sm font-bold">Finishing sign-in…</h1>
        <p className="mt-1 text-xs text-muted-foreground">Taking you back to the app.</p>
      </div>
    </main>
  );
}
