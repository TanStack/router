import * as React from 'react'
import { StyleSheet, View } from 'react-native'
import { Outlet, createRootRoute } from '@tanstack/react-native-router'

export const Route = createRootRoute({
  native: {
    presentation: 'push',
    gestureEnabled: true,
    headerTintColor: '#ffffff',
    headerStyle: {
      backgroundColor: '#10b981',
    },
  },
  component: RootComponent,
})

// Root provides shared native defaults inherited by descendants.
function RootComponent() {
  return (
    <View style={styles.container}>
      <Outlet />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
})
