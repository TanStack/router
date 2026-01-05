// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link, useSlot } from '@tanstack/react-router'

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
  const modal = useSlot('modal')

  const handleClose = () => {
    if (hasChanges) {
      // Open the nested confirm slot instead of closing directly
      // This navigates to @modal@confirm=/discard in the URL
      modal.navigate({
        slots: {
          confirm: { to: '/discard' },
        },
      })
    } else {
      modal.close()
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

        {/* Direct link to delete confirmation */}
        <Link slot="confirm" to="/delete" className="danger">
          Delete Account
        </Link>
      </div>
    </div>
  )
}

async function fetchSettings() {
  return { theme: 'light', notifications: true }
}
