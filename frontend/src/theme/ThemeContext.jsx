import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const THEME_KEY = 'ft_theme'

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'vivid' : 'dark'
}

export function ThemeProvider({ children }) {
  const [selectedTheme, setSelectedTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark'
    } catch {
      return 'dark'
    }
  })

  const [systemTheme, setSystemTheme] = useState(getSystemTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const listener = (e) => setSystemTheme(e.matches ? 'vivid' : 'dark')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const currentTheme = selectedTheme === 'auto' ? systemTheme : selectedTheme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme)
    document.body.setAttribute('data-theme', currentTheme)
    try {
      localStorage.setItem(THEME_KEY, selectedTheme)
    } catch {}
  }, [currentTheme, selectedTheme])

  const toggleTheme = () => {
    setSelectedTheme((prev) => (prev === 'dark' ? 'vivid' : 'dark'))
  }

  const setTheme = (theme) => {
    setSelectedTheme(theme)
  }

  return (
    <ThemeContext.Provider
      value={{
        theme: currentTheme,
        selectedTheme,
        isVivid: currentTheme === 'vivid',
        isDark: currentTheme === 'dark',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}
