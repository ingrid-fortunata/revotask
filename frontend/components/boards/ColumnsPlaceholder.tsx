// Stands in for the Kanban columns until T07 and T09 (Requirements 2.7). Props-free and server-compatible (FE-C1).
export function ColumnsPlaceholder() {
  return (
    <section aria-labelledby="columns-heading" className="flex flex-col gap-2">
      <h2 id="columns-heading" className="break-words text-lg font-semibold">
        Columns
      </h2>
      <p className="break-words">Columns will appear here.</p>
    </section>
  );
}
