import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'

export const getSeparateFileContent = createServerFn({
  method: 'GET',
}).handler(async () => {
  return renderServerComponent(
    <p data-testid="separate-file-server-content">server-rendered content</p>,
  )
})
