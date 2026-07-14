import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function EventNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        {/* Icône calendrier croix */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4"
              className="text-red-500"
              style={{ display: 'none' }}
            />
            <line x1="9" y1="9" x2="15" y2="15" className="text-red-500" stroke="currentColor" strokeWidth={2} />
            <line x1="15" y1="9" x2="9" y2="15" className="text-red-500" stroke="currentColor" strokeWidth={2} />
          </svg>
        </div>

        <h2 className="mb-2 text-xl font-semibold text-gray-900">Événement non trouvé</h2>

        <p className="mb-6 text-sm text-gray-600">
          Cet événement n'existe pas. Vérifiez le lien et réessayez.
        </p>

        <Link to="/booking">
          <Button variant="outline">Retour à l'accueil</Button>
        </Link>
      </div>
    </div>
  )
}
