import { Fragment } from 'react'
import { Link, createFileRoute } from '../../routeScope.gen'

export const Route = createFileRoute('__MODULE_ID__:/pages/page-__PAGE__')({
  loader: () => ({
    rows: Array.from({ length: 8 }, (_, index) => ({
      label: `Row ${index + 1}`,
      value: (index + 1) * (__PAGE__ + 1),
    })),
  }),
  component: Page,
})

function Page() {
  const { rows } = Route.useLoaderData()
  return (
    <article>
      <h3>Page __PAGE__ of __TITLE__</h3>
      <dl className="facts">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      <Link to="/pages/page-__NEXT_PAGE__">Next page</Link>
    </article>
  )
}
