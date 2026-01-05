import * as React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { createRoute } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'
import { ScreenHeader } from '../components/ScreenHeader'

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: 'about',
  component: AboutScreen,
})

function AboutScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title="About" showBack />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <Text style={styles.title}>About</Text>
        <Text style={styles.description}>
          TanStack Router for React Native provides the same powerful routing
          capabilities you love from the web, adapted for mobile.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Features</Text>
          <Text style={styles.featureText}>
            • Native stack navigation with react-native-screens
          </Text>
          <Text style={styles.featureText}>
            • Full TypeScript support with type-safe routes
          </Text>
          <Text style={styles.featureText}>
            • Search params and path params
          </Text>
          <Text style={styles.featureText}>• Data loading with loaders</Text>
          <Text style={styles.featureText}>• Android back button handling</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 24,
    marginBottom: 24,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  featureText: {
    fontSize: 15,
    color: '#4b5563',
    lineHeight: 28,
  },
})
