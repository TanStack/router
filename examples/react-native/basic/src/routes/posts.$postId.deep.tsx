import * as React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { createRoute } from '@tanstack/react-native-router'
import { Route as RootRoute } from './__root'
import { ScreenHeader } from '../components/ScreenHeader'

type Comment = {
  id: number
  name: string
  email: string
  body: string
}

async function fetchComments(postId: string): Promise<Comment[]> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${postId}/comments`,
  )
  return response.json()
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: 'posts/$postId/deep',
  nativeOptions: {
    presentation: 'push',
    gestureEnabled: true,
    animation: 'slide_from_right',
  },
  component: CommentsScreen,
  loader: async ({ params }) => {
    const comments = await fetchComments(params.postId)
    return { comments }
  },
  pendingComponent: () => (
    <View style={styles.loadingContainer}>
      <ScreenHeader title="Comments" showBack />
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading comments...</Text>
      </View>
    </View>
  ),
})

function CommentsScreen() {
  const { comments } = Route.useLoaderData()
  const { postId } = Route.useParams()

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Comments (${comments.length})`} showBack />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Post #{postId} Comments</Text>
          <Text style={styles.headerSubtitle}>
            This is a deeply nested route: /posts/$postId/deep
          </Text>
        </View>

        {comments.map((comment: Comment) => (
          <View key={comment.id} style={styles.commentCard}>
            <Text style={styles.commentName}>{comment.name}</Text>
            <Text style={styles.commentEmail}>{comment.email}</Text>
            <Text style={styles.commentBody}>{comment.body}</Text>
          </View>
        ))}
      </ScrollView>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  header: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#15803d',
    marginTop: 4,
  },
  commentCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  commentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  commentEmail: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  commentBody: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
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
