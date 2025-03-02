import React from 'react'

export const defaultTheme = {
  background: '#222222',
  backgroundAlt: '#292929',
  foreground: 'white',
  gray: '#444',
  grayAlt: '#444',
  inputBackgroundColor: '#fff',
  inputTextColor: '#000',
  success: '#80cb00',
  danger: '#ff0085',
  active: '#0099ff',
  warning: '#ffb200',
} as const

export type Theme = typeof defaultTheme
interface ProviderProps {
  theme: Theme
  children?: React.ReactNode
}

const ThemeContext = React.createContext(defaultTheme)

export function ThemeProvider({ theme, ...rest }: ProviderProps) {
  return <ThemeContext.Provider value={theme} {...rest} />
}

export function useTheme() {
  return React.useContext(ThemeContext)
}
