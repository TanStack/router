import * as React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { createRoute } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Home!</Text>
      <Text style={styles.description}>
        This is a TanStack Router example running on React Native.
      </Text>
      <View style={styles.featureList}>
        <Text style={styles.feature}>Type-safe routing</Text>
        <Text style={styles.feature}>Native screen transitions</Text>
        <Text style={styles.feature}>Search params support</Text>
        <Text style={styles.feature}>Data loading with loaders</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  featureList: {
    gap: 8,
  },
  feature: {
    fontSize: 14,
    color: '#374151',
    paddingLeft: 16,
  },
})
