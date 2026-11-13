import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeRedirectPath } from "@/lib/safeRedirect";

export const metadata: Metadata = { title: "Sign in · RevoTask" };

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The `next` value is validated here on the server before it reaches the client form (P10).
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const redirectTo = safeRedirectPath(next);
  return (
    <section className="surface w-full">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold">Sign in to RevoTask</h1>
        <LoginForm redirectTo={redirectTo} />
        <p className="text-sm">
          New here?{" "}
          <Link href="/register" className="link link-primary inline-flex min-h-11 min-w-11 items-center">
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
}
