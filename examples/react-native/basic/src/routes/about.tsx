import * as React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { createRoute } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/about',
  component: AboutComponent,
})

function AboutComponent() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>About</Text>
      <Text style={styles.description}>
        TanStack Router for React Native provides the same powerful routing
        capabilities you love from the web, adapted for mobile.
      </Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Features</Text>
        <Text style={styles.infoText}>
          • Native stack navigation with react-native-screens
        </Text>
        <Text style={styles.infoText}>
          • Full TypeScript support with type-safe routes
        </Text>
        <Text style={styles.infoText}>
          • Search params and path params
        </Text>
        <Text style={styles.infoText}>
          • Data loading with loaders
        </Text>
        <Text style={styles.infoText}>
          • Android back button handling
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
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
    marginBottom: 24,
    lineHeight: 24,
  },
  infoBox: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
    lineHeight: 20,
  },
})
