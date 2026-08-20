import { SPEEDS } from '@/lib/useAudioSync'

export function Player({
  src,
  bind,
  playing,
  toggle,
  speed,
  setSpeed,
  progress,
}: {
  src: string
  bind: React.ComponentProps<'audio'> & { ref: React.RefObject<HTMLAudioElement | null> }
  playing: boolean
  toggle: () => void
  speed: number
  setSpeed: (n: number) => void
  progress: number
}) {
  return (
    <div
      className="sticky bottom-0 mt-8 flex items-center gap-3 rounded-t-xl px-4 py-3"
      style={{ background: 'var(--surface)', borderTop: '1px solid var(--edge)' }}
    >
      <audio src={src} preload="metadata" {...bind} />

      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg"
        style={{ background: 'var(--accent)', color: 'var(--paper)' }}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="h-1 flex-1 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
        <div className="h-full rounded" style={{ width: `${progress * 100}%`, background: 'var(--accent)' }} />
      </div>

      <div className="flex shrink-0 gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className="rounded px-2 py-1 text-[11px]"
            style={
              speed === s
                ? { background: 'var(--accent)', color: 'var(--paper)' }
                : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }
            }
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
