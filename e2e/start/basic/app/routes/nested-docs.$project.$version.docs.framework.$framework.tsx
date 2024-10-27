import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '~/utils/posts'

export const Route = createFileRoute(
  '/nested-docs/$project/$version/docs/framework/$framework',
)({
  loader: () => fetchPosts(),
  component: Page,
})

function Page() {
  const posts = Route.useLoaderData()
  const params = Route.useParams()

  return (
    <>
      <div className="pb-2">
        <small>Select project</small>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ project: 'router' }}
            >
              Router
            </Link>
          </li>
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ project: 'query' }}
            >
              Query
            </Link>
          </li>
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ project: 'table' }}
            >
              Table
            </Link>
          </li>
        </ul>
      </div>
      <div className="pb-2">
        <small>Select version</small>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ version: 'latest' }}
            >
              Latest
            </Link>
          </li>
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ version: 'v2' }}
            >
              V2
            </Link>
          </li>
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ version: 'v1' }}
            >
              V1
            </Link>
          </li>
        </ul>
      </div>
      <div className="pb-2">
        <small>Select framework</small>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ framework: 'react' }}
            >
              React
            </Link>
          </li>
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ framework: 'solidjs' }}
            >
              SolidJS
            </Link>
          </li>
          <li>
            <Link
              from="/nested-docs/$project/$version/docs/framework/$framework"
              to="/nested-docs/$project/$version/docs/framework/$framework"
              params={{ framework: 'vue' }}
            >
              Vue
            </Link>
          </li>
        </ul>
      </div>
      <p className="py-2 font-medium border-y">
        Selected:
        <span data-testid="selected-route-label">
          /nested-docs/{params.project}/{params.version}/docs/framework/
          {params.framework}
        </span>
      </p>
      <div className="flex gap-2 py-2">
        <ul className="list-disc pl-4">
          {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }].map(
            (post) => {
              return (
                <li key={post.id} className="whitespace-nowrap">
                  <Link
                    from="/nested-docs/$project/$version/docs/framework/$framework"
                    to="/nested-docs/$project/$version/docs/framework/$framework/$"
                    params={{
                      _splat: post.id,
                    }}
                    className="block py-1 text-blue-800 hover:text-blue-600"
                    activeProps={{ className: 'text-black font-bold' }}
                  >
                    {`Post ID = ${post.id}`}
                  </Link>
                </li>
              )
            },
          )}
        </ul>
        <hr />
        <Outlet />
      </div>
    </>
  )
}
