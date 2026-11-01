import { createFileRoute } from '@tanstack/react-router'
import { orgSettings, personSettings } from '../routeScope.gen'

export const Route = createFileRoute('/')({
  component: Home,
})

// A key plan of the store: every module's room where the store mounts it,
// nested like the routes.
function Home() {
  return (
    <>
      <h1>Home</h1>
      <p className="lead">
        The Acme storefront, rendered on the server. Each region is a route
        module, drawn as a room: its tag names the package and where the store
        mounts it.
      </p>
      <div className="plan">
        <div className="room" data-route-module="@start-route-modules/catalog">
          <p className="room-tag">
            @start-route-modules/catalog <code>/shop</code>
          </p>
          <p>
            Prices for the signed-in shopper, refreshed through a server
            function.
          </p>
        </div>
        <div className="room" data-route-module="@start-route-modules/notes">
          <p className="room-tag">
            @start-route-modules/notes <code>/notes</code>
          </p>
          <p>A router-only module; the store serializes its data.</p>
        </div>
        {/* The organization route is the store's own: the team below it gets
            `orgId` from the URL. */}
        <div className="plot">
          <p className="room-tag">
            Host route <code>/orgs/$orgId</code>
          </p>
          <div className="plot-rooms">
            <div className="room" data-route-module="@start-route-modules/team">
              <p className="room-tag">
                @start-route-modules/team <code>/team</code>
              </p>
              <p>
                Members of the organization in the URL, loaded on the server.
              </p>
            </div>
            <div
              className="room"
              data-route-module="@start-route-modules/settings"
            >
              <p className="room-tag">
                @start-route-modules/settings#orgSettings <code>/settings</code>
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
            <div
              className="room"
              data-route-module="@start-route-modules/settings"
            >
              <p className="room-tag">
                @start-route-modules/settings#personSettings{' '}
                <code>/settings</code>
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
