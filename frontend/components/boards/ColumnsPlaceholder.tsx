// Stands in for the Kanban columns until T07 and T09 (Requirements 2.7). Props-free and server-compatible (FE-C1).
// The three dashed lanes are decoration and hint at the columns to come.
export function ColumnsPlaceholder() {
  return (
    <section aria-labelledby="columns-heading" className="surface flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="columns-heading" className="break-words text-lg font-semibold">
          Columns
        </h2>
        <p className="break-words text-base-content/70">Columns will appear here.</p>
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((lane) => (
          <div key={lane} className="h-28 rounded-field border border-dashed border-base-300 bg-base-200/60 sm:h-40" />
        ))}
      </div>
    </section>
  );
}
