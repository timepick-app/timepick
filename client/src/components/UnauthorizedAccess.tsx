interface UnauthorizedAccessProps {
  eventName?: string
}

export function UnauthorizedAccess({ eventName }: UnauthorizedAccessProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-orange-200 bg-orange-50 p-8 text-center shadow-sm">
        {/* Icône cadenas */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
          <svg
            className="h-8 w-8 text-orange-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-xl font-semibold text-gray-900">Accès non autorisé</h2>

        <p className="mb-4 text-sm text-gray-700">
          {eventName
            ? `Vous n'êtes pas autorisé à accéder à l'événement "${eventName}"`
            : "Vous n'êtes pas autorisé à accéder à cet événement"}
        </p>

        <p className="text-xs text-gray-600">
          Contactez l'administrateur si vous pensez qu'il s'agit d'une erreur.
        </p>
      </div>
    </div>
  )
}
