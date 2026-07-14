export function EventSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Skeleton titre */}
      <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
      <div className="h-32 w-full animate-pulse rounded bg-gray-200" />
    </div>
  )
}
