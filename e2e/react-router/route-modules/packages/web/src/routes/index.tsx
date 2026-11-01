import { createFileRoute, useMatch } from '@tanstack/react-router'
import {
  account,
  billing,
  orgSettings,
  personSettings,
  products,
  storefront,
  team,
} from '../routeScope.gen'

export const Route = createFileRoute('/')({
  component: Home,
})

// A key plan of the workspace: every module's room where the workspace mounts
// it, nested like the routes.
function Home() {
  const productMatch = useMatch({
    from: '@route-modules/products:/$productId',
    shouldThrow: false,
  })
  return (
    <>
      <h1>Acme workspace</h1>
      <p className="lead">
        Each region of this workspace is a route module, drawn as a room: its
        tag names the package and where the workspace mounts it.
      </p>
      <div className="plan">
        <div className="room" data-route-module="@route-modules/storefront">
          <p className="room-tag">
            @route-modules/storefront <code>/shop</code>
          </p>
          <p>
            <storefront.Link to="/cart">Cart</storefront.Link>
          </p>
          <div className="room" data-route-module="@route-modules/products">
            <p className="room-tag">
              @route-modules/products <code>/shop/products</code>
            </p>
            <p>
              <products.Link
                to="/$productId"
                params={{ productId: 'home-pick' }}
              >
                Pick of the day
              </products.Link>
              <span>{productMatch?.loaderData?.name}</span>
            </p>
          </div>
        </div>
        <div className="room" data-route-module="@route-modules/account">
          <p className="room-tag">
            @route-modules/account <code>/account</code>
          </p>
          <p>
            <account.Link to="/">Your account</account.Link>
          </p>
        </div>
        {/* The organization route is the workspace's own: both modules below
            it get `orgId` from the URL. */}
        <div className="plot">
          <p className="room-tag">
            Host route <code>/orgs/$orgId</code>
          </p>
          <div className="plot-rooms">
            <div className="room" data-route-module="@route-modules/team">
              <p className="room-tag">
                @route-modules/team <code>/team</code>
              </p>
              <p>
                {/* The team is mounted below `/orgs/$orgId`: links into it pass `orgId`. */}
                <team.Link to="/" params={{ orgId: 'acme' }}>
                  Acme team
                </team.Link>
              </p>
            </div>
            <div className="room" data-route-module="@route-modules/billing">
              <p className="room-tag">
                @route-modules/billing <code>/billing</code>
              </p>
              <p>
                <billing.Link to="/" params={{ orgId: 'globex' }}>
                  Globex billing
                </billing.Link>
              </p>
            </div>
            <div className="room" data-route-module="@route-modules/settings">
              <p className="room-tag">
                @route-modules/settings#orgSettings <code>/settings</code>
              </p>
              <p>
                <orgSettings.Link to="/" params={{ orgId: 'globex' }}>
                  Globex settings
                </orgSettings.Link>
              </p>
            </div>
          </div>
        </div>
        {/* The settings are installed a second time, per person. */}
        <div className="plot">
          <p className="room-tag">
            Host route <code>/people/$personId</code>
          </p>
          <div className="plot-rooms">
            <div className="room" data-route-module="@route-modules/settings">
              <p className="room-tag">
                @route-modules/settings#personSettings <code>/settings</code>
              </p>
              <p>
                <personSettings.Link to="/profile" params={{ personId: 'ada' }}>
                  Ada&apos;s profile
                </personSettings.Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
