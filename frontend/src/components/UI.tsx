import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { AlertCircle, ArrowLeft, House, LoaderCircle, MapPin, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`}>
      <span className="logo__mark">
        <MapPin size={21} />
        <b>?</b>
      </span>
      <span>OMYS</span>
    </div>
  )
}

export function Shell({
  children,
  back,
  backLabel = '뒤로',
  onBack,
  home,
  onHome,
  wide = false,
  title,
}: PropsWithChildren<{
  back?: boolean
  backLabel?: string
  onBack?: () => void
  home?: boolean
  onHome?: () => void
  wide?: boolean
  title?: string
}>) {
  const navigate = useNavigate()
  const hasNavigation = back || home
  return (
    <div className={wide ? 'app-shell app-shell--wide' : 'app-shell app-shell--mobile'}>
      <header className="topbar">
        <div className="topbar__start">
          {hasNavigation && (
            <div className="topbar__actions">
              {back && (
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => (onBack ? onBack() : navigate(-1))}
                  aria-label={backLabel}
                  title={backLabel}
                >
                  <ArrowLeft />
                </button>
              )}
              {home && (
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => (onHome ? onHome() : navigate('/', { replace: true }))}
                  aria-label="홈으로"
                  title="홈으로"
                >
                  <House />
                </button>
              )}
            </div>
          )}
          <Logo compact />
        </div>
        <span className="topbar__tag">{title ?? '오늘은 어디로?'}</span>
      </header>
      <main className={wide ? 'page page--wide' : 'page'}>{children}</main>
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`button button--${variant} ${props.className ?? ''}`}
    >
      {loading ? <LoaderCircle className="spin" size={19} /> : null}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export type SegmentedOption<T extends string> = {
  value: T
  label: string
}

export function SegmentedTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented-tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'segmented-tabs__item active' : 'segmented-tabs__item'}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({
  children,
  tone = 'info',
}: PropsWithChildren<{ tone?: 'info' | 'warning' | 'success' }>) {
  return (
    <div className={`notice notice--${tone}`}>
      {tone === 'info' ? <Sparkles size={18} /> : <AlertCircle size={18} />}
      <span>{children}</span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <section className="empty-state">
      <div className="empty-state__icon">{icon ?? <AlertCircle />}</div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  )
}

export function Skeleton() {
  return (
    <div className="loading-screen">
      <span className="mystery-orb">?</span>
      <p>비밀 봉투를 확인하고 있어요…</p>
    </div>
  )
}
