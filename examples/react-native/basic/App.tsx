import 'react-native-url-polyfill/auto'
import * as React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NativeRouterProvider } from '@tanstack/react-native-router'
import { router } from './src/router'

export default function App() {
  return (
    <SafeAreaProvider>
      <NativeRouterProvider router={router} />
    </SafeAreaProvider>
  )
}
