import { createFileRoute, settings, team } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/billing:/')({
  component: Billing,
})

function Billing() {
  return (
    <div>
      <h2>Billing</h2>
      <dl className="facts">
        <dt>Plan</dt>
        <dd>Team, billed monthly</dd>
        <dt>Seats</dt>
        <dd>2</dd>
      </dl>
      {/* Billing uses the team without mounting it: the organization comes
          from the current location, below the same route as the team. */}
      <div className="actions">
        <team.Link to="/members/$memberId" params={{ memberId: 'ada' }}>
          Billing contact
        </team.Link>
        {/* The settings are installed for organizations and for people:
            billing links to the installation of its own organization. */}
        <settings.Link to="/profile">Organization profile</settings.Link>
      </div>
    </div>
  )
}
