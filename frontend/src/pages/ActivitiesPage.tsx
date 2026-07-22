import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clock3, Copy, RotateCcw, Share2, Sparkles, Zap } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError, getAnonymousSessionId, track } from '../lib/api'
import { Button, Notice, Shell, Skeleton } from '../components/UI'

type Mood = 'light' | 'funny' | 'dopamine'
type Result = 'success' | 'failure' | 'abandoned'

type Activity = {
  id: string
  mood: Mood
  title: string
  description: string
  duration_seconds: number | null
  is_active: boolean
}

type ActivitySession = {
  id: string
  anonymous_session_id: string
  session_token: string | null
  selected_mood: Mood | null
  current_activity_id: string | null
  previously_drawn_activity_ids: string[]
  status: 'choosing' | 'drawn' | 'started' | 'completed' | 'abandoned'
  started_at: string | null
  completed_at: string | null
  result: Result | null
  party_size: number | null
  activity: Activity | null
  list_reset?: boolean
}

const MOODS: Record<Mood, { emoji: string; label: string; description: string }> = {
  light: { emoji: '🙂', label: '가볍게', description: '편하게 이야기하고 놀기' },
  funny: { emoji: '😂', label: '웃기게', description: '사진과 흑역사 남기기' },
  dopamine: { emoji: '⚡', label: '도파민', description: '랜덤, 경쟁, 제한 시간' },
}

const STORAGE_KEY = 'omys:activity-session'

type ActivityCredentials = {
  id: string
  token: string
}

function loadCredentials(): ActivityCredentials | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as Partial<ActivityCredentials>
    if (typeof parsed.id === 'string' && typeof parsed.token === 'string') {
      return { id: parsed.id, token: parsed.token }
    }
  } catch {
    // The previous version stored only a session id, which cannot pass token validation.
  }
  localStorage.removeItem(STORAGE_KEY)
  return null
}

function sessionHeaders(token: string) {
  return { 'X-Session-Token': token }
}

function resultLabel(result: Result | null) {
  if (result === 'success') return '성공! 🎉'
  if (result === 'failure') return '실패했지만 도전 완료! 🙌'
  return '여기까지 도전했어요'
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function ActivitiesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [session, setSession] = useState<ActivitySession | null>(null)
  const [sessionToken, setSessionToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [choosingMood, setChoosingMood] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [partySize, setPartySize] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    track('activity_page_view')
  }, [])

  const saveSession = useCallback(
    (value: ActivitySession, token: string) => {
      setSession({ ...value, session_token: null })
      setSessionToken(token)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: value.id, token }))
      const currentId = searchParams.get('session')
      if (currentId !== value.id) navigate(`/activities?session=${value.id}`, { replace: true })
    },
    [navigate, searchParams],
  )

  useEffect(() => {
    const restore = async () => {
      const stored = loadCredentials()
      const requestedId = searchParams.get('session')
      const credentials = !requestedId || requestedId === stored?.id ? stored : null
      if (credentials) {
        try {
          const restored = await api<ActivitySession>(`/api/activity-sessions/${credentials.id}`, {
            headers: sessionHeaders(credentials.token),
          })
          saveSession(restored, credentials.token)
          setLoading(false)
          return
        } catch (err) {
          if (!(err instanceof ApiError) || ![401, 404].includes(err.status)) {
            setError(err instanceof Error ? err.message : '활동을 불러오지 못했어요.')
            setLoading(false)
            return
          }
          localStorage.removeItem(STORAGE_KEY)
        }
      }
      try {
        const created = await api<ActivitySession>('/api/activity-sessions', {
          method: 'POST',
          body: JSON.stringify({ anonymous_session_id: getAnonymousSessionId() }),
        })
        if (!created.session_token) throw new Error('활동 세션 토큰을 받지 못했어요.')
        saveSession(created, created.session_token)
      } catch (err) {
        setError(err instanceof Error ? err.message : '활동 세션을 만들지 못했어요.')
      } finally {
        setLoading(false)
      }
    }
    void restore()
  }, [saveSession, searchParams])

  useEffect(() => {
    if (
      session?.status !== 'started' ||
      !session.started_at ||
      !session.activity?.duration_seconds
    ) {
      setRemaining(null)
      return
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(session.started_at!).getTime()) / 1000)
      setRemaining(Math.max(0, session.activity!.duration_seconds! - elapsed))
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [session])

  const request = async (action: string, body?: object) => {
    if (!session || !sessionToken) return
    setBusy(action)
    setError('')
    try {
      const next = await api<ActivitySession>(`/api/activity-sessions/${session.id}/${action}`, {
        method: 'POST',
        headers: sessionHeaders(sessionToken),
        body: body ? JSON.stringify(body) : undefined,
      })
      saveSession(next, sessionToken)
      setChoosingMood(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청을 처리하지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  const draw = (mood: Mood) => void request('draw', { mood })
  const shareText = useMemo(() => {
    if (!session?.activity || !session.selected_mood) return ''
    const mood = MOODS[session.selected_mood]
    const people = partySize ? `\n${partySize}명이 함께했습니다.` : ''
    return `오늘의 OMYS ${mood.label} 활동 ${mood.emoji}\n${session.activity.title}에 도전했습니다.\n결과는 ${resultLabel(session.result)}${people}\n우리보다 더 잘할 수 있나요?`
  }, [partySize, session])

  const shareUrl = `${location.origin}/activities`
  const share = async () => {
    if (!session?.activity) return
    track('activity_shared', undefined, {
      mood: session.selected_mood,
      activity_id: session.activity.id,
      method: 'web_share',
    })
    if (navigator.share) {
      await navigator.share({ title: 'OMYS 미스터리 활동', text: shareText, url: shareUrl })
      return
    }
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
    setCopied(true)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
    setCopied(true)
    track('activity_shared', undefined, {
      mood: session?.selected_mood,
      activity_id: session?.activity?.id,
      method: 'copy',
    })
  }

  if (loading)
    return (
      <Shell back title="미스터리 활동">
        <Skeleton />
      </Shell>
    )

  const showMoodPicker = !session?.activity || choosingMood
  const mood = session?.selected_mood ? MOODS[session.selected_mood] : null

  return (
    <Shell back title="미스터리 활동">
      <div className="activity-page">
        {error && <Notice tone="warning">{error}</Notice>}

        {showMoodPicker ? (
          <section className="activity-mood-screen">
            <span className="activity-page__icon">
              <Zap />
            </span>
            <p className="step-label">MYSTERY ACTIVITY</p>
            <h1 className="page-title">지금 어떤 느낌이 필요한가요?</h1>
            <p className="page-subtitle">위치나 준비물 없이, 지금 바로 할 일을 뽑아 드려요.</p>
            <div className="mood-grid">
              {(Object.keys(MOODS) as Mood[]).map((key) => (
                <button type="button" key={key} onClick={() => draw(key)} disabled={!!busy}>
                  <span>{MOODS[key].emoji}</span>
                  <strong>{MOODS[key].label}</strong>
                  <small>{MOODS[key].description}</small>
                </button>
              ))}
            </div>
          </section>
        ) : session?.activity ? (
          <section className="activity-result-screen">
            <span className="activity-page__icon">{mood?.emoji}</span>
            <p className="step-label">오늘의 {mood?.label} 활동</p>
            <article className="activity-card">
              <h1>{session.activity.title}</h1>
              <p>{session.activity.description}</p>
              {session.activity.duration_seconds && (
                <span className="activity-duration">
                  <Clock3 size={16} /> {Math.ceil(session.activity.duration_seconds / 60)}분 활동
                </span>
              )}
              {session.status === 'started' && remaining != null && (
                <div
                  className={
                    remaining === 0 ? 'activity-timer activity-timer--done' : 'activity-timer'
                  }
                >
                  <small>{remaining === 0 ? '시간 끝!' : '남은 시간'}</small>
                  <strong>{formatTime(remaining)}</strong>
                </div>
              )}
            </article>

            <Notice>
              불편하거나 위험하다고 느껴지면 언제든 건너뛰세요. 서로 동의한 범위에서만 진행해요.
            </Notice>

            {session.status === 'drawn' && (
              <div className="activity-actions">
                <Button onClick={() => void request('start')} loading={busy === 'start'}>
                  활동 시작
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void request('skip')}
                  loading={busy === 'skip'}
                >
                  <RotateCcw size={17} /> 다른 활동
                </Button>
              </div>
            )}

            {session.status === 'started' && (
              <div className="activity-complete-actions">
                <Button onClick={() => void request('complete', { result: 'success' })}>
                  성공했어요
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void request('complete', { result: 'failure' })}
                >
                  실패했어요
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void request('complete', { result: 'abandoned' })}
                >
                  그만할래요
                </Button>
              </div>
            )}

            {(session.status === 'completed' || session.status === 'abandoned') && (
              <div className="activity-share-wrap">
                <article className="activity-share-card">
                  <div>
                    <Sparkles size={18} /> OMYS
                  </div>
                  <span>
                    {mood?.emoji} {mood?.label}
                  </span>
                  <h2>{session.activity.title}</h2>
                  <strong>{resultLabel(session.result)}</strong>
                  <label>
                    함께한 인원{' '}
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={partySize}
                      onChange={(event) => setPartySize(event.target.value)}
                      placeholder="선택"
                    />
                  </label>
                  <p>우리보다 더 잘할 수 있나요?</p>
                </article>
                <div className="share-actions">
                  <Button onClick={() => void share()}>
                    <Share2 size={17} /> 공유
                  </Button>
                  <Button variant="ghost" onClick={() => void copy()}>
                    {copied ? <Check size={17} /> : <Copy size={17} />}{' '}
                    {copied ? '복사됨' : '링크 복사'}
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void request('skip')}
                  loading={busy === 'skip'}
                >
                  다른 활동 뽑기
                </Button>
              </div>
            )}

            <button
              className="text-button activity-change-mood"
              type="button"
              onClick={() => setChoosingMood(true)}
            >
              느낌 다시 고르기
            </button>
          </section>
        ) : null}
      </div>
    </Shell>
  )
}
