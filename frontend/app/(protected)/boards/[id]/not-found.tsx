import Link from "next/link";

// Shown when getBoard or getBoardMembers calls notFound() (Requirements 2.8). The copy is the same
// for a missing board and a board the caller cannot access, so it reveals nothing (Requirement 2.4).
export default function BoardNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <h1 className="break-words text-2xl font-semibold">Board not found</h1>
        <p className="break-words">This board does not exist or you cannot open it.</p>
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
