// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createSlotRoute({
  path: '/settings',
  loader: async () => {
    const settings = await fetchSettings()
    return { settings }
  },
  component: SettingsModal,
})

function SettingsModal() {
  const { settings } = Route.useLoaderData()
  const [hasChanges, setHasChanges] = useState(false)
  const navigate = Route.useNavigate()

  const handleClose = () => {
    if (hasChanges) {
      // Open the nested confirm slot - fully qualified path
      // Results in URL: ?@modal=/settings&@modal@confirm=/discard
      navigate({ to: '/@modal/@confirm/discard' })
    } else {
      // Close modal - need slots object for null
      navigate({ slots: { modal: null } })
    }
  }

  return (
    <div className="settings-modal">
      <h2>Settings</h2>

      <form onChange={() => setHasChanges(true)}>
        <label>
          Theme
          <select name="theme" defaultValue={settings.theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            name="notifications"
            defaultChecked={settings.notifications}
          />
          Enable notifications
        </label>
      </form>

      <div className="actions">
        <button type="button" onClick={handleClose}>
          Cancel
        </button>
        <button type="submit">Save</button>

        {/* Direct link to delete confirmation - fully qualified nested slot path */}
        <Link to="/@modal/@confirm/delete" className="danger">
          Delete Account
        </Link>
      </div>
    </div>
  )
}

async function fetchSettings() {
  return { theme: 'light', notifications: true }
}
