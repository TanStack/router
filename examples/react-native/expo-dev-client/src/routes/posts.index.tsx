import * as React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Link, createFileRoute } from '@tanstack/react-native-router'
// Importing this file makes the Metro Start compiler rewrite its
// createServerFn().handler() bodies into RPC stubs.
import { listPosts as listPostsRpc } from '../server-fns/posts'

type Post = {
  id: number
  title: string
  body: string
}

async function fetchPosts(): Promise<Array<Post>> {
  if (process.env.TSR_SERVER_FN_BASE) {
    const result = await listPostsRpc()
    return result as unknown as Array<Post>
  }
  const response = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_limit=10',
  )
  return response.json()
}

export const Route = createFileRoute('/posts/')({
  native: {
    title: 'Posts',
    headerLargeTitle: true,
  },
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  component: PostsScreen,
  loader: async () => {
    const posts = await fetchPosts()
    return { posts }
  },
  pendingComponent: () => (
    <View style={styles.loadingContainer}>
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading posts...</Text>
      </View>
    </View>
  ),
})

function PostsScreen() {
  const { posts } = Route.useLoaderData()
  const search = Route.useSearch() as { q?: string }
  const q = search.q ?? ''
  const navigate = Route.useNavigate()

  const filteredPosts = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return posts

    return posts.filter((post: Post) =>
      post.title.toLowerCase().includes(query),
    )
  }, [posts, q])

  const setSearchQuery = React.useCallback(
    (nextQuery: string) => {
      navigate({
        search: (prev: { q?: string }) => ({
          ...prev,
          q: nextQuery.trim() ? nextQuery : undefined,
        }),
        replace: true,
      })
    },
    [navigate],
  )

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <View style={styles.searchWrap}>
            <TextInput
              value={q}
              onChangeText={setSearchQuery}
              placeholder="Search post titles"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={styles.searchInput}
            />
            {!!q && (
              <Pressable
                style={styles.clearButton}
                onPress={() => setSearchQuery('')}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No matching posts</Text>
            <Text style={styles.emptySubtitle}>
              Try a different title keyword.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link
            to="/posts/$postId"
            params={{ postId: item.id.toString() }}
            style={styles.postCard}
          >
            <Text style={styles.postTitle}>{item.title}</Text>
            <Text style={styles.postBody} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.postArrow}>→</Text>
          </Link>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  searchWrap: {
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111827',
  },
  clearButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  postCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  postTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  postBody: {
    display: 'none',
  },
  postArrow: {
    fontSize: 18,
    color: '#9ca3af',
    marginLeft: 8,
  },
  emptyState: {
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6b7280',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
})
