// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, useSlot } from '@tanstack/react-router'

// Settings modal - shown when @modal=/settings
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
  const modal = useSlot('modal')

  const handleSave = async (formData: FormData) => {
    await saveSettings(formData)
    modal.close()
  }

  return (
    <div className="settings-modal">
      <h2>Settings</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSave(new FormData(e.currentTarget))
        }}
      >
        <label>
          Theme
          <select name="theme" defaultValue={settings.theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
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

        <div className="actions">
          <button type="button" onClick={modal.close}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  )
}

// Placeholder functions
async function fetchSettings() {
  return { theme: 'system', notifications: true }
}
async function saveSettings(data: FormData) {
  console.log('Saving settings', Object.fromEntries(data))
}
