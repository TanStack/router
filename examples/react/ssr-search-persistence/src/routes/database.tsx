import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { serverDatabase } from '../lib/serverDatabase'
import { ClientOnly } from '../components/ClientOnly'
import type { ServerSearchRecord } from '../lib/serverDatabase'

export const Route = createFileRoute('/database')({
  component: DatabaseComponent,
})

function DatabaseComponent() {
  return (
    <ClientOnly fallback={<div>Loading database...</div>}>
      <DatabaseContent />
    </ClientOnly>
  )
}

function DatabaseContent() {
  const router = useRouter()
  const [records, setRecords] = useState<Array<ServerSearchRecord>>([])
  useEffect(() => {
    const loadRecords = () => {
      const allRecords = serverDatabase.getAllRecords()
      setRecords(allRecords)
    }

    loadRecords()
    const interval = setInterval(loadRecords, 2000)

    return () => clearInterval(interval)
  }, [])

  const clearAllRecords = () => {
    serverDatabase.clear()

    // Also clear from router store
    const searchStore = router.options.searchPersistenceStore
    if (searchStore) {
      records.forEach((record) => {
        searchStore.clearSearch(record.routeId)
      })
    }

    setRecords([])
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Search Database</h2>
        <div className="text-sm text-gray-600">
          {records.length} record{records.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <p className="text-sm text-gray-700">
          This demonstrates server-side search parameter persistence. Search
          parameters are saved to a server database and restored across SSR
          requests.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Persisted Search Parameters</h3>
        {records.length > 0 && (
          <button
            type="button"
            onClick={clearAllRecords}
            className="text-red-600 hover:text-red-800 text-sm"
          >
            Clear All
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No search parameters saved</p>
          <p className="text-sm mt-2">
            Navigate to Products or Users and set some filters to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((record, index) => (
            <div
              key={`${record.routeId}-${record.timestamp}-${index}`}
              className="border rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <span className="font-semibold">{record.routeId}</span>
                  <span className="text-sm text-gray-600">{record.userId}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {formatTimestamp(record.timestamp)}
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded mb-3">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(record.searchParams, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    serverDatabase.delete(record.routeId, record.userId)

                    const searchStore = router.options.searchPersistenceStore
                    if (searchStore) {
                      searchStore.clearSearch(record.routeId)
                    }

                    setRecords(records.filter((r) => r !== record))
                  }}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
        <p>
          <strong>How it works:</strong> Search parameters are automatically
          saved to a server database and restored when you navigate back to the
          same route. This works across page refreshes and new tabs because the
          data is stored server-side.
        </p>
      </div>
    </div>
  )
}
