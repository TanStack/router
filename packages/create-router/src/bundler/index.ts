import { apply as applyVite } from './vite'
import { apply as applyRspack } from './rspack'
import { apply as applyWebpack } from './webpack'
import type { Bundler } from '../constants'
import type { ApplyParams } from '../types'

export function apply(bundler: Bundler, params: ApplyParams) {
  switch (bundler) {
    case 'vite':
      return applyVite(params)
    case 'rspack':
      return applyRspack(params)
    case 'webpack':
      return applyWebpack(params)
  }
}
