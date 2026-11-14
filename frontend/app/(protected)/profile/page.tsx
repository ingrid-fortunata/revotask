import { ProfileForm } from "@/components/profile/ProfileForm";
import { getCurrentUser } from "@/lib/server/session";

// Profile (Requirements 4.1 to 4.9). The session is verified here, not only in the layout (DD6).
// getCurrentUser() is cached per request, so the layout and this page share one E30 read, and no
// token reaches the browser. A read failure throws to app/error.tsx, and there is no loading.tsx,
// because redirect() in a streaming context would not send an HTTP redirect.
export default async function ProfilePage() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
      <section className="surface mt-4 w-full max-w-xl p-4 sm:mt-6 sm:p-5">
        <h2 className="text-lg font-semibold">Your details</h2>
        <p className="mt-1 text-sm text-base-content/70">
          Change your name or email. Password changes are not available yet.
        </p>
        <div className="mt-4">
          <ProfileForm user={user} />
        </div>
      </section>
    </main>
  );
}
