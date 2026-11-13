import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Create an account · RevoTask" };

export default function RegisterPage() {
  return (
    <section className="card w-full bg-base-100 shadow">
      <div className="card-body gap-4">
        <h1 className="card-title">Create your account</h1>
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
