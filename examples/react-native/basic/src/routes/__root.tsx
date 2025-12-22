import * as React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createRootRoute, Outlet, Link } from '@tanstack/react-native-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TanStack Router</Text>
        <Text style={styles.subtitle}>React Native Example</Text>
      </View>
      <View style={styles.nav}>
        <Link to="/" style={styles.navLink} activeProps={{ style: styles.activeLink }}>
          <Text style={styles.navText}>Home</Text>
        </Link>
        <Link to="/about" style={styles.navLink} activeProps={{ style: styles.activeLink }}>
          <Text style={styles.navText}>About</Text>
        </Link>
        <Link to="/posts" style={styles.navLink} activeProps={{ style: styles.activeLink }}>
          <Text style={styles.navText}>Posts</Text>
        </Link>
      </View>
      <View style={styles.content}>
        <Outlet />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#6366f1',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  nav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  navLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  activeLink: {
    backgroundColor: '#6366f1',
  },
  navText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  content: {
    flex: 1,
  },
})
