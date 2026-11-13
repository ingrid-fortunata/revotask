import { getCurrentUser } from "@/lib/server/session";

// Placeholder body inside the protected shell. The dashboard replaces it in T06 (A9).
// The page verifies the session itself: the layout is not the authorization boundary (DD6).
export default async function HomePage() {
  await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <section className="card w-full bg-base-100 shadow">
        <div className="card-body">
          <h1 className="card-title">RevoTask</h1>
          <p>Application shell placeholder. Board features arrive in later slices.</p>
        </div>
      </section>
    </main>
  );
}
