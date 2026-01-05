import * as React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { createRoute, Link } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'
import { ScreenHeader } from '../components/ScreenHeader'

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomeScreen,
})

function HomeScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title="TanStack Router" />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.description}>
          This is a TanStack Router example running on React Native with native
          screen navigation.
        </Text>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>Features</Text>
          <Text style={styles.feature}>• Type-safe routing</Text>
          <Text style={styles.feature}>• Native screen transitions</Text>
          <Text style={styles.feature}>• Search params and path params</Text>
          <Text style={styles.feature}>• Data loading with loaders</Text>
          <Text style={styles.feature}>• Android back button support</Text>
        </View>

        <View style={styles.nav}>
          <Text style={styles.navTitle}>Navigate to:</Text>
          <Link to="/about" style={styles.navLink}>
            <Text style={styles.navLinkText}>About →</Text>
          </Link>
          <Link to="/posts" style={styles.navLink}>
            <Text style={styles.navLinkText}>Posts →</Text>
          </Link>
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
  features: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  feature: {
    fontSize: 15,
    color: '#4b5563',
    lineHeight: 28,
  },
  nav: {
    gap: 12,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  navLink: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  navLinkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
