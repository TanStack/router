// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createFileRoute } from '@tanstack/react-router'

// Slots are NOT declared here - they're discovered from mail.@*.tsx files
// after composition. Route.Outlet gains type-safe slot prop automatically.
export const Route = createFileRoute('/mail')({
  component: MailLayout,
})

function MailLayout() {
  return (
    <div className="mail-app">
      {/* Sidebar with folders */}
      <nav className="mail-sidebar">
        <h1>Mail</h1>
        {/* These navigate the @list slot */}
        <Route.Link slots={{ list: { to: '/inbox' } }}>Inbox</Route.Link>
        <Route.Link slots={{ list: { to: '/sent' } }}>Sent</Route.Link>
        <Route.Link slots={{ list: { to: '/drafts' } }}>Drafts</Route.Link>
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
