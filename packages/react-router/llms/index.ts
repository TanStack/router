import api from './rules/api.js'
import guide from './rules/guide.js'
import routing from './rules/routing.js'
import setupAndArchitecture from './rules/setup-and-architecture.js'

import type { PackageRuleItem } from 'vibe-rules'

const rules: Array<PackageRuleItem> = [
  {
    name: 'tanstack-router-api',
    description: 'TanStack Router: API',
    rule: api,
    alwaysApply: false,
    globs: ['src/**/*.ts', 'src/**/*.tsx'],
  },
  {
    name: 'tanstack-router-guide',
    description: 'TanStack Router: Guide',
    rule: guide,
    alwaysApply: false,
    globs: ['src/**/*.ts', 'src/**/*.tsx'],
  },
  {
    name: 'tanstack-router-routing',
    description: 'TanStack Router: Routing',
    rule: routing,
    alwaysApply: false,
    globs: ['src/**/*.ts', 'src/**/*.tsx'],
  },
  {
    name: 'tanstack-router-setup-and-architecture',
    description: 'TanStack Router: Setup and Architecture',
    rule: setupAndArchitecture,
    alwaysApply: false,
    globs: [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'src/**/*.ts',
      'src/**/*.tsx',
    ],
  },
]

export default rules
