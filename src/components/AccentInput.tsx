/**
 * A text field for Spanish answers on any keyboard.
 *
 * Typing a vowel then an apostrophe gives the accented vowel (a' → á), n~
 * gives ñ and u: gives ü. <AccentKeys> adds tap targets for phones; they type
 * into whichever AccentInput last had focus, so one row serves a whole table.
 */
import { forwardRef, useImperativeHandle, useRef, type CSSProperties, type KeyboardEvent } from 'react'

const ACUTE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' }

export const applyShortcuts = (v: string) =>
  v
    .replace(/([aeiouAEIOU])'/g, (_, c: string) => ACUTE[c])
    .replace(/n~/g, 'ñ')
    .replace(/N~/g, 'Ñ')
    .replace(/u:/g, 'ü')
    .replace(/U:/g, 'Ü')

/** The field accent keys type into. */
let active: { insert: (ch: string) => void } | null = null

interface Props {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  readOnly?: boolean
  autoFocus?: boolean
  placeholder?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

export const AccentInput = forwardRef<HTMLInputElement, Props>(function AccentInput(
  { value, onChange, onEnter, readOnly, autoFocus, placeholder, className, style, ariaLabel },
  ref
) {
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => input.current!)

  /** Apply shortcuts, keeping the caret where it was relative to the text after it. */
  const update = (raw: string, caret: number) => {
    const next = applyShortcuts(raw)
    const after = raw.length - caret
    onChange(next)
    requestAnimationFrame(() => {
      const el = input.current
      if (el && document.activeElement === el) el.setSelectionRange(next.length - after, next.length - after)
    })
  }

  const insert = (ch: string) => {
    const el = input.current
    if (!el || readOnly) return
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    update(value.slice(0, start) + ch + value.slice(end), start + ch.length)
  }

  return (
    <input
      ref={input}
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={ariaLabel}
      lang="es"
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      onFocus={() => { active = { insert } }}
      onChange={(e) => update(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        }
      }}
      className={className}
      style={style}
    />
  )
})

export function AccentKeys() {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Accented letters">
      {['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü'].map((ch) => (
        <button
          key={ch}
          type="button"
          // Keep focus in the field being typed into.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => active?.insert(ch)}
          className="h-8 w-8 rounded text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--ink)', fontFamily: 'var(--font-reading)' }}
        >
          {ch}
        </button>
      ))}
    </div>
  )
}
