import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { AltCssContent } from './AltCssContent'

export const getAltCssServerComponent = createServerFn({ method: 'GET' })
  .inputValidator((data: { heading?: string }) => data)
  .handler(async ({ data }) => {
    return renderServerComponent(<AltCssContent data={data} />)
  })
