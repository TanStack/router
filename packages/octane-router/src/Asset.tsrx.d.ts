import type { ComponentBody } from 'octane'
import type { RouterManagedTag } from '@tanstack/router-core'

export type AssetProps = RouterManagedTag & {
  assetKey: string
  target: 'head' | 'body'
}

export declare const Asset: ComponentBody<AssetProps>
