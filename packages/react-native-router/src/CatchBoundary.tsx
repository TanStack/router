import * as React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import type { ErrorInfo } from 'react'
import type { ErrorRouteComponent } from './route'

export interface ErrorComponentProps {
  error: Error
  reset: () => void
  info?: { componentStack: string }
}

/**
 * Default error component for React Native
 */
export function ErrorComponent({ error }: ErrorComponentProps) {
  const [show, setShow] = React.useState(__DEV__)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Something went wrong!</Text>
        <Pressable style={styles.button} onPress={() => setShow((d) => !d)}>
          <Text style={styles.buttonText}>
            {show ? 'Hide Error' : 'Show Error'}
          </Text>
        </Pressable>
      </View>
      {show && (
        <View style={styles.errorBox}>
          <Text style={styles.message}>{error.message}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  button: {
    borderWidth: 1,
    borderColor: '#6b7280',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  errorBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 4,
    padding: 8,
    maxWidth: '100%',
  },
  message: {
    fontSize: 12,
    color: '#dc2626',
  },
})

export function CatchBoundary(props: {
  getResetKey: () => number | string
  children: React.ReactNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
}) {
  const errorComponent = props.errorComponent ?? ErrorComponent

  return (
    <CatchBoundaryImpl
      getResetKey={props.getResetKey}
      onCatch={props.onCatch}
      children={({ error, reset }) => {
        if (error) {
          return React.createElement(errorComponent, {
            error,
            reset,
          })
        }

        return props.children
      }}
    />
  )
}

class CatchBoundaryImpl extends React.Component<{
  getResetKey: () => number | string
  children: (props: {
    error: Error | null
    reset: () => void
  }) => React.ReactNode
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
}> {
  state = { error: null } as { error: Error | null; resetKey: string }
  static getDerivedStateFromProps(props: any) {
    return { resetKey: props.getResetKey() }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  reset() {
    this.setState({ error: null })
  }
  componentDidUpdate(
    prevProps: Readonly<{
      getResetKey: () => string
      children: (props: { error: any; reset: () => void }) => any
      onCatch?: ((error: any, info: any) => void) | undefined
    }>,
    prevState: any,
  ): void {
    if (prevState.error && prevState.resetKey !== this.state.resetKey) {
      this.reset()
    }
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onCatch) {
      this.props.onCatch(error, errorInfo)
    }
  }
  render() {
    // If the resetKey has changed, don't render the error
    return this.props.children({
      error:
        this.state.resetKey !== this.props.getResetKey()
          ? null
          : this.state.error,
      reset: () => {
        this.reset()
      },
    })
  }
}
