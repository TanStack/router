import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/optional-params')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <h3 className="pb-2">optional path params</h3>
      <ul className="grid mb-2">
        <li>
          <div>single optional only</div>
          <div className="ml-5">
            <ul>
              <li>
                <Link
                  data-testid="l-to-single-index"
                  to="/optional-params/single/{-$id}"
                  params={{
                    id: undefined,
                  }}
                >
                  /optionals/single
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-single-id-index"
                  to="/optional-params/single/{-$id}"
                  params={{ id: 'id' }}
                >
                  /optionals/single/id
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-single-path"
                  to="/optional-params/single/path"
                >
                  /optionals/single/path
                </Link>{' '}
              </li>
            </ul>
          </div>
          <hr />
        </li>
        <li>
          <div>simple optional path param usage</div>
          <div className="ml-5">
            <ul>
              <li>
                <Link
                  data-testid="l-to-simple-index"
                  to="/optional-params/simple/{-$id}"
                  params={{
                    id: undefined,
                  }}
                >
                  /optionals/simple
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-simple-id-index"
                  to="/optional-params/simple/{-$id}"
                  params={{ id: 'id' }}
                >
                  /optionals/simple/id
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-simple-path"
                  to="/optional-params/simple/{-$id}/path"
                  params={{ id: undefined }}
                >
                  /optionals/simple/path
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-simple-id-path"
                  to="/optional-params/simple/{-$id}/path"
                  params={{ id: 'id' }}
                >
                  /optionals/simple/id/path
                </Link>
              </li>
            </ul>
          </div>
          <hr />
        </li>
        <li>
          <div>With path params and index page</div>
          <div className="ml-5">
            <ul>
              <li>
                <Link
                  data-testid="l-to-withIndex-category-index"
                  to="/optional-params/withIndex/{-$id}/$category"
                  params={{
                    id: undefined,
                    category: 'category',
                  }}
                >
                  /optionals/withIndex/category
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withIndex-id-category-index"
                  to="/optional-params/withIndex/{-$id}/$category"
                  params={{
                    id: 'id',
                    category: 'category',
                  }}
                >
                  /optionals/withIndex/id/category
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withIndex-category-path"
                  to="/optional-params/withIndex/{-$id}/$category/path"
                  params={{
                    id: undefined,
                    category: 'category',
                  }}
                >
                  /optionals/withIndex/category/path
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withIndex-id-category-path"
                  to="/optional-params/withIndex/{-$id}/$category/path"
                  params={{
                    id: 'id',
                    category: 'category',
                  }}
                >
                  /optionals/withIndex/id/category/path
                </Link>{' '}
              </li>
            </ul>
          </div>
          <hr />
        </li>
        <li>
          <div>Consecutive path params</div>
          <div className="ml-5">
            <ul>
              <li>
                <Link
                  data-testid="l-to-consecutive-category-info"
                  to="/optional-params/consecutive/{-$id}/{-$slug}/$category/info"
                  params={{
                    id: undefined,
                    slug: undefined,
                    category: 'category',
                  }}
                >
                  /optionals/consecutive/category/info
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-consecutive-id-category-info"
                  to="/optional-params/consecutive/{-$id}/{-$slug}/$category/info"
                  params={{ id: 'id', slug: undefined, category: 'category' }}
                >
                  /optionals/consecutive/id1/category/info
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-consecutive-slug-category-info"
                  to="/optional-params/consecutive/{-$id}/{-$slug}/$category/info"
                  params={{ id: undefined, slug: 'slug', category: 'category' }}
                >
                  /optionals/consecutive/slug/category/info
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-consecutive-id-slug-category-info"
                  to="/optional-params/consecutive/{-$id}/{-$slug}/$category/info"
                  params={{ id: 'id', slug: 'slug', category: 'category' }}
                >
                  /optionals/consecutive/id1/slug/category/info
                </Link>
              </li>
            </ul>
          </div>
          <hr />
        </li>
        <li>
          <div>Required path in between optional and path params</div>
          <div className="ml-5">
            <ul>
              <li>
                <Link
                  data-testid="l-to-withRequiredInBetween-category"
                  to="/optional-params/withRequiredInBetween/{-$id}/$category/path/{-$slug}"
                  params={{
                    id: undefined,
                    slug: undefined,
                    category: 'category',
                  }}
                >
                  /optionals/withRequiredInBetween/category/path
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withRequiredInBetween-id-category"
                  to="/optional-params/withRequiredInBetween/{-$id}/$category/path/{-$slug}"
                  params={{ id: 'id', slug: undefined, category: 'category' }}
                >
                  /optionals/withRequiredInBetween/id/category/path
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withRequiredInBetween-category-slug"
                  to="/optional-params/withRequiredInBetween/{-$id}/$category/path/{-$slug}"
                  params={{ id: undefined, slug: 'slug', category: 'category' }}
                >
                  /optionals/withRequiredInBetween/category/path/slug
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withRequiredInBetween-id-category-slug"
                  to="/optional-params/withRequiredInBetween/{-$id}/$category/path/{-$slug}"
                  params={{ id: 'id', slug: 'slug', category: 'category' }}
                >
                  /optionals/withRequiredInBetween/id/category/path/slug
                </Link>
              </li>
            </ul>
          </div>
          <hr />
        </li>
        <li>
          <div>Required Param in between optional path params</div>
          <div className="ml-5">
            <ul>
              <li>
                <Link
                  data-testid="l-to-withRequiredParam-category"
                  to="/optional-params/withRequiredParam/{-$id}/$category/{-$slug}/info"
                  params={{
                    id: undefined,
                    slug: undefined,
                    category: 'category',
                  }}
                >
                  /optionals/withRequiredParam/category/info
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withRequiredParam-id-category"
                  to="/optional-params/withRequiredParam/{-$id}/$category/{-$slug}/info"
                  params={{ id: 'id', slug: undefined, category: 'category' }}
                >
                  /optionals/withRequiredParam/id1/category/info
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withRequiredParam-category-slug"
                  to="/optional-params/withRequiredParam/{-$id}/$category/{-$slug}/info"
                  params={{ id: undefined, slug: 'slug', category: 'category' }}
                >
                  /optionals/withRequiredParam/category/slug/info
                </Link>{' '}
              </li>
              <li>
                <Link
                  data-testid="l-to-withRequiredParam-id-category-slug"
                  to="/optional-params/withRequiredParam/{-$id}/$category/{-$slug}/info"
                  params={{ id: 'id', slug: 'slug', category: 'category' }}
                >
                  /optionals/withRequiredParam/id1/category/slug/info
                </Link>
              </li>
            </ul>
          </div>
        </li>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
