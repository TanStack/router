import * as React from 'react'
import { View, StyleSheet } from 'react-native'
import { createRootRoute, Outlet } from '@tanstack/react-native-router'

export const Route = createRootRoute({
  component: RootComponent,
})

// Root just provides context and renders the current screen
// No shared chrome here - each screen handles its own header
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
