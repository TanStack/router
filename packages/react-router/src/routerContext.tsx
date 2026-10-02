'use client'

import * as React from 'react'
import type { RouterPresentationSource } from '@tanstack/router-core'

export type RouterContextValue = RouterPresentationSource

export const routerContext = React.createContext<RouterContextValue>(null!)
