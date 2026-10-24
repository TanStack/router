import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { GlobalCssCard } from './GlobalCssCard'

export const getGlobalCssCardServerComponent = createServerFn({
  method: 'GET',
}).handler(async () => renderServerComponent(<GlobalCssCard />))
