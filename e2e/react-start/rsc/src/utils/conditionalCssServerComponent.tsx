import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ConditionalOrangePanel } from './ConditionalOrangePanel'
import { ConditionalVioletPanel } from './ConditionalVioletPanel'

export const getConditionalCssServerComponent = createServerFn({
  method: 'GET',
})
  .inputValidator((data: { branch?: 'orange' | 'violet' }) => data)
  .handler(async ({ data }) => {
    const branch = data.branch === 'violet' ? 'violet' : 'orange'

    return renderServerComponent(
      <>
        {import.meta.viteRsc.loadCss()}
        {branch === 'violet' ? (
          <ConditionalVioletPanel />
        ) : (
          <ConditionalOrangePanel />
        )}
      </>,
    )
  })
