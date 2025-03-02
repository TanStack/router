import * as Solid from 'solid-js'

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
  children?: Solid.JSX.Element
}

const ThemeContext = Solid.createContext(defaultTheme)

export function ThemeProvider({ children, theme, ...rest }: ProviderProps) {
  return <ThemeContext.Provider value={theme} {...rest}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return Solid.useContext(ThemeContext)
}
