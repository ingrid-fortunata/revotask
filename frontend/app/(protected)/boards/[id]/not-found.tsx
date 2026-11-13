import Link from "next/link";

// Shown when getBoard or getBoardMembers calls notFound() (Requirements 2.8). The copy is the same
// for a missing board and a board the caller cannot access, so it reveals nothing (Requirement 2.4).
export default function BoardNotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="surface flex max-w-xl flex-col items-start gap-4 p-6">
        <h1 className="break-words text-2xl font-semibold">Board not found</h1>
        <p className="break-words text-base-content/80">This board does not exist or you cannot open it.</p>
        <Link
          href="/"
          className="btn btn-primary min-h-11 min-w-11 w-full sm:w-auto"
        >
          Back to your boards
        </Link>
      </div>
    </main>
  );
}
