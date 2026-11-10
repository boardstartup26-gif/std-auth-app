import { NotificationsSkeleton } from "@/app/_components/states/page-skeletons";

// Shown instantly on navigation (and prefetched, which is what makes a
// force-dynamic route eligible for prefetching at all). Mirrors page.tsx.
export default function Loading() {
  return <NotificationsSkeleton />;
}
