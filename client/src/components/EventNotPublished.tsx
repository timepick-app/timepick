export function EventNotPublished() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-blue-200 bg-blue-50 p-8 text-center shadow-sm">
        {/* Icône horloge */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <svg
            className="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-xl font-semibold text-gray-900">Événement non disponible</h2>

        <p className="mb-4 text-sm text-gray-700">
          Cet événement n'est pas encore accessible au public.
        </p>

        <p className="text-xs text-gray-600">
          Contactez l'organisateur pour plus d'informations.
        </p>
      </div>
    </div>
  )
}
