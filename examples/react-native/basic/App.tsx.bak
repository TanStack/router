import 'react-native-gesture-handler'
import { enableScreens } from 'react-native-screens'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NativeRouterProvider } from '@tanstack/react-native-router'
import { router } from './src/router'

// Enable native screens
enableScreens()

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NativeRouterProvider router={router} />
    </SafeAreaProvider>
  )
}
