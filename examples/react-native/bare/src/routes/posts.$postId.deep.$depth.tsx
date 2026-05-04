import * as React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Link,
  createFileRoute,
  useCanGoBack,
  useNativeStackDebugSnapshot,
  useRouter,
  useRouterState,
} from '@tanstack/react-native-router'
import type { NativeHeaderContext } from '@tanstack/react-native-router'

type NativeMinStackState = 'paused' | 'active'
type NativeStackState = 'active' | 'paused' | 'detached'

type StackDebugEntry = {
  historyIndex: number
  locationKey: string
  pathname: string
  depthLabel: string
  entryMinStackState?: NativeMinStackState
  resolvedStackState: NativeStackState
}

const DEFAULT_PAUSED_DEPTH = 3
const DEFAULT_DETACHED_DEPTH = 4

export const Route = createFileRoute('/posts/$postId/deep/$depth')({
  native: {
    animation: 'slide_from_right',
    title: ({ params }: NativeHeaderContext) => `Depth ${params.depth}`,
  },
  component: StackDepthScreen,
})

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }

  return Math.floor(value)
}

function resolveDepthPolicy(router: ReturnType<typeof useRouter>) {
  const nativeOptions = (
    router.options as {
      native?: { pausedDepth?: number; detachedDepth?: number }
    }
  ).native
  const pausedDepth =
    toNonNegativeInt(nativeOptions?.pausedDepth) ?? DEFAULT_PAUSED_DEPTH
  const detachedDepth =
    toNonNegativeInt(nativeOptions?.detachedDepth) ?? DEFAULT_DETACHED_DEPTH

  return {
    pausedDepth,
    detachedDepth: Math.max(detachedDepth, pausedDepth + 1),
  }
}

function applyDebugStackStates(
  stack: Array<Omit<StackDebugEntry, 'resolvedStackState'>>,
  detachedDepth: number,
): Array<StackDebugEntry> {
  if (!stack.length) return []

  const lastIndex = stack.length - 1
  const next = stack.map((entry, index) => {
    const depth = lastIndex - index
    let resolvedStackState: NativeStackState =
      depth === 0 ? 'active' : depth >= detachedDepth ? 'detached' : 'paused'

    if (entry.entryMinStackState === 'active') {
      resolvedStackState = 'active'
    } else if (
      entry.entryMinStackState === 'paused' &&
      resolvedStackState === 'detached'
    ) {
      resolvedStackState = 'paused'
    }

    return {
      ...entry,
      resolvedStackState,
    }
  })

  next[lastIndex] = {
    ...next[lastIndex]!,
    resolvedStackState: 'active',
  }

  return next
}

function useNativeStackDebug() {
  const router = useRouter()
  const depthPolicy = React.useMemo(() => resolveDepthPolicy(router), [router])
  const nativeStackSnapshot = useNativeStackDebugSnapshot()

  const stack = React.useMemo(() => {
    return nativeStackSnapshot.map((entry) => {
      const entryPathname = entry.pathname
      const depthMatch = entryPathname.match(/\/deep\/([^/]+)/)

      return {
        historyIndex: entry.historyIndex,
        locationKey: entry.locationKey,
        pathname: entryPathname,
        depthLabel: depthMatch?.[1] ?? '-',
        entryMinStackState: entry.entryMinStackState,
      }
    })
  }, [nativeStackSnapshot])

  const resolvedStack = React.useMemo(
    () => applyDebugStackStates(stack, depthPolicy.detachedDepth),
    [depthPolicy.detachedDepth, stack],
  )

  return {
    depthPolicy,
    resolvedStack,
  }
}

function StackDepthScreen() {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { depthPolicy, resolvedStack } = useNativeStackDebug()
  const locationNativeMinStackState = useRouterState({
    select: (s) => (s.location.state as any).__TSR_nativeMinStackState,
  })
  const { postId, depth: depthParam } = Route.useParams()
  const depth = Math.max(1, Number(depthParam) || 1)
  const nextDepth = depth + 1

  const [sideEffectCount, setSideEffectCount] = React.useState(0)
  const mountId = React.useRef(Math.random().toString(36).slice(2, 8)).current

  React.useEffect(() => {
    const id = setInterval(() => setSideEffectCount((count) => count + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const back = React.useCallback(
    (opts?: any) => {
      ;(router as any).back(opts)
    },
    [router],
  )

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Link
          to="/posts/$postId/deep/$depth"
          params={{ postId, depth: String(nextDepth) }}
          stackBehavior="push"
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Link push depth {nextDepth} →</Text>
        </Link>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entry diagnostics</Text>
          <Text style={styles.cardRow}>Post ID: {postId}</Text>
          <Text style={styles.cardRow}>Depth: {depth}</Text>
          <Text style={styles.cardRow}>Mount ID: {mountId}</Text>
          <Text style={styles.cardRow}>
            Side-effect count (1s interval): {sideEffectCount}
          </Text>
          <Text style={styles.cardRow}>
            Entry minStackState: {String(locationNativeMinStackState ?? 'none')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lifecycle policy</Text>
          <Text style={styles.cardRow}>
            router pausedDepth: {depthPolicy.pausedDepth}
          </Text>
          <Text style={styles.cardRow}>
            router detachedDepth: {depthPolicy.detachedDepth}
          </Text>
          <Text style={styles.cardRow}>route defaultMinStackState: none</Text>
          <Text style={styles.cardRow}>this route minStackState: none</Text>
          <Text style={styles.cardRow}>
            result: follows fallback depth policy
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Native stack debugger</Text>
          <Text style={styles.cardRow}>Top entry is shown first</Text>
          {resolvedStack
            .slice()
            .reverse()
            .map((entry, index) => (
              <Text key={entry.locationKey} style={styles.stackRow}>
                {index === 0 ? '->' : '  '} i={entry.historyIndex} depth=
                {entry.depthLabel || '-'} state={entry.resolvedStackState} min=
                {entry.entryMinStackState ?? 'none'} path={entry.pathname}
              </Text>
            ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>minStackState playground</Text>

          <Pressable
            style={styles.action}
            onPress={() => {
              router.navigate({
                to: '/posts/$postId/deep/$depth',
                params: { postId, depth: String(nextDepth) },
                stackBehavior: 'push',
              } as any)
            }}
          >
            <Text style={styles.actionText}>push(next) default metadata</Text>
          </Pressable>

          <Pressable
            style={styles.action}
            onPress={() => {
              router.navigate({
                to: '/posts/$postId/deep/$depth',
                params: { postId, depth: String(nextDepth) },
                stackBehavior: 'push',
                native: { minStackState: 'paused' },
              } as any)
            }}
          >
            <Text style={styles.actionText}>
              push(next) + native.min=paused
            </Text>
          </Pressable>

          <Pressable
            style={styles.action}
            onPress={() => {
              router.navigate({
                to: '/posts/$postId/deep/$depth',
                params: { postId, depth: String(nextDepth) },
                stackBehavior: 'push',
                native: { minStackState: 'active' },
              } as any)
            }}
          >
            <Text style={styles.actionText}>
              push(next) + native.min=active
            </Text>
          </Pressable>

          <Pressable
            style={styles.action}
            onPress={() => {
              router.navigate({
                to: '/posts/$postId/deep/$depth',
                params: { postId, depth: '1' },
                stackBehavior: 'reuse',
                native: { minStackState: 'active' },
              } as any)
            }}
          >
            <Text style={styles.actionText}>reuse(depth=1) + force active</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>back() API playground</Text>
          <Text style={styles.cardRow}>canGoBack: {String(canGoBack)}</Text>

          <Pressable style={styles.action} onPress={() => back()}>
            <Text style={styles.actionText}>back()</Text>
          </Pressable>

          <Pressable style={styles.action} onPress={() => back({ steps: 2 })}>
            <Text style={styles.actionText}>back({'{ steps: 2 }'})</Text>
          </Pressable>

          <Pressable
            style={styles.action}
            onPress={() => back({ to: `/posts/${postId}/deep` })}
          >
            <Text style={styles.actionText}>
              back({"{ to: '/posts/:id/deep' }"})
            </Text>
          </Pressable>

          <Pressable style={styles.action} onPress={() => back({ to: 'root' })}>
            <Text style={styles.actionText}>back({"{ to: 'root' }"})</Text>
          </Pressable>

          <Pressable
            style={styles.action}
            onPress={() => back({ to: '/about', ifMissing: 'push' })}
          >
            <Text style={styles.actionText}>
              back({"{ to: '/about', ifMissing: 'push' }"})
            </Text>
          </Pressable>
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
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  action: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86efac',
    backgroundColor: '#ecfdf5',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
  },
  stackRow: {
    fontSize: 13,
    color: '#1f2937',
  },
})
