import * as React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { createRoute, Link } from '@tanstack/react-native-router'
import type { NativeStackStateResolverContext } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'
import { ScreenHeader } from '../components/ScreenHeader'

const maxDepth = 8

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: 'posts/$postId/deep/$depth',
  native: {
    presentation: 'push',
    gestureEnabled: true,
    animation: 'slide_from_right',
    stackState: ({ depth }: NativeStackStateResolverContext) => {
      if (depth <= 2) return 'paused'
      return 'detached'
    },
  },
  component: StackDepthScreen,
})

function StackDepthScreen() {
  const { postId, depth: depthParam } = Route.useParams()
  const depth = Math.max(1, Number(depthParam) || 1)
  const nextDepth = Math.min(maxDepth, depth + 1)

  const [ticks, setTicks] = React.useState(0)
  const mountId = React.useRef(Math.random().toString(36).slice(2, 8)).current

  React.useEffect(() => {
    const id = setInterval(() => setTicks((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Depth ${depth}`} showBack />

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entry diagnostics</Text>
          <Text style={styles.cardRow}>Post ID: {postId}</Text>
          <Text style={styles.cardRow}>Depth: {depth}</Text>
          <Text style={styles.cardRow}>Mount ID: {mountId}</Text>
          <Text style={styles.cardRow}>Tick Counter: {ticks}s</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lifecycle policy</Text>
          <Text style={styles.cardRow}>top: active</Text>
          <Text style={styles.cardRow}>depth 1-2 behind top: paused</Text>
          <Text style={styles.cardRow}>depth 3+ behind top: detached</Text>
        </View>

        {depth < maxDepth ? (
          <Link
            to="/posts/$postId/deep/$depth"
            params={{ postId, depth: String(nextDepth) }}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Push to depth {nextDepth} →</Text>
          </Link>
        ) : (
          <Text style={styles.maxText}>Max depth reached ({maxDepth}).</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    gap: 14,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardRow: {
    fontSize: 15,
    color: '#374151',
  },
  cta: {
    marginTop: 2,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  maxText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
})
