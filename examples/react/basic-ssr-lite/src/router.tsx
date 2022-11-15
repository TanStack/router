import { createReactRouter } from '@tanstack/react-router'
import { routeConfig } from './routeConfig'

// Set up a ReactRouter instance

export const router = createReactRouter({
  routeConfig,
  // defaultPreload: 'intent',
})
