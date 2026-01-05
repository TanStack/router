// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/mail')({
  slots: {
    list: true, // auto-wired from mail.@list.tsx
    preview: true, // auto-wired from mail.@preview.tsx
  },
  component: MailLayout,
})

function MailLayout() {
  return (
    <div className="mail-app">
      {/* Sidebar with folders */}
      <nav className="mail-sidebar">
        <h1>Mail</h1>
        {/* These navigate the @list slot */}
        <Link slot="list" to="/inbox">
          Inbox
        </Link>
        <Link slot="list" to="/sent">
          Sent
        </Link>
        <Link slot="list" to="/drafts">
          Drafts
        </Link>
      </nav>

      {/* Message list pane */}
      <div className="mail-list-pane">
        <Route.SlotOutlet name="list" />
      </div>

      {/* Preview pane */}
      <div className="mail-preview-pane">
        <Route.SlotOutlet name="preview" />
      </div>
    </div>
  )
}
