// Shown at once on a client navigation while the page reads its data from Flask. The layout and its
// session check sit above this file, so an unauthenticated hard load still gets an HTTP 307.
export default function Loading() {
  return (
    <main className="w-full p-4 sm:p-6 lg:p-8" aria-busy="true">
      <p className="sr-only" role="status">Loading</p>
      <div className="flex flex-col gap-6">
        <div className="skeleton h-9 w-48" />
        <div className="skeleton h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
        </div>
      </div>
    </main>
  );
}
