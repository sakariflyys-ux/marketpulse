import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Mail } from "lucide-react";

import { auth, enabledProviders } from "@/auth";
import { signInWithEmail, signInWithProvider } from "@/components/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Sign in · MarketPulse" };

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"
      />
    </svg>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.23 1.3-1.6 3.8-5.35 3.8-3.22 0-5.85-2.66-5.85-5.95S8.78 5.9 12 5.9c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.35 14.56 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.1-.15-1.52Z"
      />
    </svg>
  );
}

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const oauth = enabledProviders.filter((p) => p.type !== "email");
  const email = enabledProviders.find((p) => p.type === "email");

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to MarketPulse</CardTitle>
          <CardDescription>Track trending stores and winning ads.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {enabledProviders.length === 0 ? (
            <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">No auth providers configured</p>
                <p className="text-muted-foreground">
                  Set <code className="font-mono text-xs">AUTH_GITHUB_*</code>,{" "}
                  <code className="font-mono text-xs">AUTH_GOOGLE_*</code>, or{" "}
                  <code className="font-mono text-xs">AUTH_RESEND_KEY</code> +{" "}
                  <code className="font-mono text-xs">AUTH_EMAIL_FROM</code> in{" "}
                  <code className="font-mono text-xs">.env</code> and restart the dev server.
                </p>
              </div>
            </div>
          ) : null}

          {oauth.map((provider) => (
            <form key={provider.id} action={signInWithProvider.bind(null, provider.id)}>
              <Button type="submit" variant="outline" className="w-full">
                {provider.id === "github" ? <GithubIcon className="size-4" /> : null}
                {provider.id === "google" ? <GoogleIcon className="size-4" /> : null}
                Continue with {provider.name}
              </Button>
            </form>
          ))}

          {email ? (
            <form action={signInWithEmail} className="flex flex-col gap-2">
              {oauth.length > 0 ? (
                <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <Input type="email" name="email" placeholder="you@example.com" required />
              <Button type="submit" className="w-full">
                <Mail />
                Send magic link
              </Button>
            </form>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/dashboard">Continue without signing in</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
