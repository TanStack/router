// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createFileRoute, Link } from '@tanstack/react-router'

// Slots are NOT declared here - they're discovered from mail.@*.tsx files
// after composition. Route.Outlet gains type-safe slot prop automatically.
export const Route = createFileRoute('/mail')({
  component: MailLayout,
})

function MailLayout() {
  return (
    <div className="mail-app">
      {/* Sidebar with folders - using fully qualified paths */}
      <nav className="mail-sidebar">
        <h1>Mail</h1>
        <Link to="/mail/@list/inbox">Inbox</Link>
        <Link to="/mail/@list/sent">Sent</Link>
        <Link to="/mail/@list/drafts">Drafts</Link>
      </nav>

      {/* Message list pane */}
      <div className="mail-list-pane">
        <Route.Outlet slot="list" />
      </div>

      {/* Preview pane */}
      <div className="mail-preview-pane">
        <Route.Outlet slot="preview" />
      </div>
    </div>
  )
}
