import Link from "next/link";

// App-wide 404 for any URL no route matches. It sits in the root layout, so it carries no session
// shell and reads no cookie. `/` sends a signed-out visitor on to /login. A missing board keeps its
// own state in (protected)/boards/[id]/not-found.tsx.
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-6">
      <div className="surface flex flex-col items-start gap-4 p-6">
        <h1 className="break-words text-xl font-semibold">Page not found</h1>
        <p className="break-words text-base-content/80">This page does not exist or has moved.</p>
        <Link href="/" className="btn btn-primary min-h-11 min-w-11 w-full sm:w-auto">
          Go to RevoTask
        </Link>
      </div>
    </main>
  );
}
