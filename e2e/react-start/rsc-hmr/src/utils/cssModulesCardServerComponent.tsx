import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { CssModulesCard } from './CssModulesCard'

export const getCssModulesCardServerComponent = createServerFn({
  method: 'GET',
}).handler(async () => renderServerComponent(<CssModulesCard />))
