import * as React from 'react'
import { View, Text, StyleSheet, StatusBar, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from '@tanstack/react-native-router'

interface ScreenHeaderProps {
  title: string
  showBack?: boolean
  rightElement?: React.ReactNode
}

export function ScreenHeader({
  title,
  showBack = false,
  rightElement,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back()
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <View style={styles.left}>
          {showBack && (
            <Pressable onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.right}>{rightElement}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#6366f1',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  left: {
    flex: 1,
    alignItems: 'flex-start',
  },
  right: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    flex: 2,
    fontSize: 17,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    fontSize: 16,
    color: 'white',
  },
})
