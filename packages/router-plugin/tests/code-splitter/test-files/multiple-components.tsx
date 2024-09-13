import { createFileRoute } from '@tanstack/react-router'
import { importedComponent, importedLoader } from '../shared/imported'

export const Route = createFileRoute('/')({
  component: importedComponent,
  pendingComponent: () => <div>Loading...</div>,
  loader: importedLoader,
})
