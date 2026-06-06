import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for every (dashboard) page. Server pages await
// auth() + Supabase before rendering; without this, Next.js holds the previous
// page frozen until the RSC payload arrives — on slow mobile that reads as a
// dead tap. A generic glass skeleton gives instant feedback on every nav.
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      <Skeleton className="h-44 w-full rounded-3xl" />

      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-28 shrink-0 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>

      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
