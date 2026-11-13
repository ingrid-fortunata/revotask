import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Create an account · RevoTask" };

export default function RegisterPage() {
  return (
    <section className="surface w-full">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <RegisterForm />
        <p className="text-sm">
          Already registered?{" "}
          <Link href="/login" className="link link-primary inline-flex min-h-11 min-w-11 items-center">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
