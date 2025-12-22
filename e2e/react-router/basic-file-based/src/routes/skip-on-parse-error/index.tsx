import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/skip-on-parse-error/')({
  component: SkipOnParseErrorIndex,
})

function SkipOnParseErrorIndex() {
  const uuidValue = '123e4567-e89b-12d3-a456-426614174000'
  const numericValue = 12345
  const stringValue = 'hello-world'

  return (
    <div className="space-y-4">
      <h2 data-testid="index-heading">Test Links</h2>

      <div className="space-y-2">
        <h3>UUID Route Tests</h3>
        <div className="flex gap-2">
          <Link
            to="/skip-on-parse-error/$uuid"
            params={{ uuid: uuidValue }}
            className="border p-2 rounded"
            data-testid="link-to-uuid"
          >
            Navigate to UUID: {uuidValue.slice(0, 8)}...
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h3>Numeric Route Tests</h3>
        <div className="flex gap-2">
          <Link
            to="/skip-on-parse-error/$num"
            params={{ num: numericValue }}
            className="border p-2 rounded"
            data-testid="link-to-numeric"
          >
            Navigate to Numeric: {numericValue}
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h3>String Route Tests (Catch-all)</h3>
        <div className="flex gap-2">
          <Link
            to="/skip-on-parse-error/$slug"
            params={{ slug: stringValue }}
            className="border p-2 rounded"
            data-testid="link-to-string"
          >
            Navigate to String: {stringValue}
          </Link>
        </div>
      </div>

      <div className="mt-4 p-2 bg-gray-100 rounded">
        <p className="text-sm">
          <strong>Expected behavior:</strong>
        </p>
        <ul className="text-sm list-disc ml-4">
          <li>UUID values match the UUID route (validates UUID format)</li>
          <li>Numeric values match the Numeric route (validates number)</li>
          <li>Other strings match the Catch-all route</li>
        </ul>
      </div>
    </div>
  )
}
