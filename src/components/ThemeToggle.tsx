import { theme, useTheme, type Theme } from '@/lib/theme'

const LABEL: Record<Theme, string> = {
  auto: 'Theme: follows your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

function Icon({ mode }: { mode: Theme }) {
  const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  if (mode === 'light') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
      </svg>
    )
  }
  if (mode === 'dark') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2Z" />
      </svg>
    )
  }
  // auto: half-filled circle, the usual shorthand for "follow the system"
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ThemeToggle() {
  const mode = useTheme()
  return (
    <button
      onClick={() => theme.cycle()}
      title={LABEL[mode]}
      aria-label={LABEL[mode]}
      className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
      style={{ color: 'var(--ink-soft)', border: '1px solid var(--edge)' }}
    >
      <Icon mode={mode} />
    </button>
  )
}
