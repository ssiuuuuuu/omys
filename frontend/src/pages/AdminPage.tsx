import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  BarChart3,
  DoorOpen,
  Eye,
  KeyRound,
  Link2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Share2,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { Button, Notice, Shell } from '../components/UI'
import { ApiError, getAdminStats, type AdminStats } from '../lib/api'

type StatsRange = AdminStats['period']['range']

const ADMIN_KEY_STORAGE = 'omys:admin-key'
const RANGES: { value: StatsRange; label: string }[] = [
  { value: '6h', label: '6시간' },
  { value: '12h', label: '12시간' },
  { value: '24h', label: '24시간' },
  { value: '3d', label: '3일' },
]

function number(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '')
  const [keyInput, setKeyInput] = useState(adminKey)
  const [range, setRange] = useState<StatsRange>('6h')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (key: string, selectedRange: StatsRange) => {
    if (!key) return
    setLoading(true)
    setError('')
    try {
      setStats(await getAdminStats(key, selectedRange))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE)
        setAdminKey('')
        setStats(null)
        setError('관리자 키가 올바르지 않습니다.')
      } else {
        setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (adminKey) void load(adminKey, range)
  }, [adminKey, load, range])

  const unlock = (event: FormEvent) => {
    event.preventDefault()
    const key = keyInput.trim()
    if (!key) return
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key)
    setAdminKey(key)
  }

  const lock = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE)
    setAdminKey('')
    setKeyInput('')
    setStats(null)
    setError('')
  }

  const maxChartValue = useMemo(
    () =>
      Math.max(
        1,
        ...(stats?.period.series.flatMap((point) => [point.visitors, point.rooms_created]) ?? []),
      ),
    [stats],
  )

  if (!adminKey || !stats) {
    return (
      <Shell>
        <section className="admin-login">
          <span className="admin-login__icon">
            <LockKeyhole />
          </span>
          <p className="step-label">PRIVATE DASHBOARD</p>
          <h1 className="page-title">운영 현황 확인</h1>
          <p className="page-subtitle">배포 환경의 ADMIN_API_KEY를 입력해 주세요.</p>
          {error && <Notice tone="warning">{error}</Notice>}
          <form onSubmit={unlock}>
            <label className="field">
              <span className="field__label">관리자 키</span>
              <span className="admin-key-input">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </span>
            </label>
            <Button type="submit" loading={loading} disabled={!keyInput.trim()}>
              통계 열기
            </Button>
          </form>
        </section>
      </Shell>
    )
  }

  const totals = stats.period.totals
  const metrics = [
    {
      label: '방문자',
      value: totals.visitors,
      detail: `조회 ${number(totals.pageviews)}회`,
      icon: Users,
    },
    {
      label: '생성된 방',
      value: totals.rooms_created,
      detail: `2명 이상 ${number(totals.rooms_with_2_plus)}개`,
      icon: DoorOpen,
    },
    {
      label: '활동 뽑기 방문',
      value: totals.activity_visitors,
      detail: `조회 ${number(totals.activity_pageviews)}회`,
      icon: Zap,
    },
    {
      label: '선정 완료',
      value: totals.draw_completed,
      detail: `전환 ${totals.conversion.room_to_draw_percent}%`,
      icon: Sparkles,
    },
    {
      label: '목적지 공개',
      value: totals.revealed,
      detail: `전환 ${totals.conversion.draw_to_reveal_percent}%`,
      icon: Eye,
    },
    { label: '결과 공유', value: totals.shares, detail: '공유 버튼 기준', icon: Share2 },
  ]

  return (
    <Shell wide>
      <div className="admin-page">
        <header className="admin-heading">
          <div>
            <p className="step-label">OMYS ANALYTICS</p>
            <h1>운영 대시보드</h1>
            <p>한국 시간 기준 · {stats.period.label}</p>
          </div>
          <div className="admin-heading__actions">
            <button
              type="button"
              className="admin-icon-button"
              onClick={() => void load(adminKey, range)}
              aria-label="새로고침"
              disabled={loading}
            >
              <RefreshCw className={loading ? 'spin' : ''} />
            </button>
            <button type="button" className="admin-icon-button" onClick={lock} aria-label="잠그기">
              <LogOut />
            </button>
          </div>
        </header>

        {error && <Notice tone="warning">{error}</Notice>}

        <nav className="admin-ranges" aria-label="통계 기간">
          {RANGES.map((item) => (
            <button
              type="button"
              key={item.value}
              className={range === item.value ? 'active' : ''}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="admin-metrics" aria-label={`${stats.period.label} 요약`}>
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article key={label}>
              <span>
                <Icon size={19} />
              </span>
              <small>{label}</small>
              <strong>{number(value)}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </section>

        <section className="admin-panel">
          <div className="admin-panel__heading">
            <div>
              <Link2 />
              <div>
                <h2>유입 경로</h2>
                <p>UTM 링크 기준 방문 및 주요 행동</p>
              </div>
            </div>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>유입</th>
                  <th>캠페인</th>
                  <th>위치</th>
                  <th>방문자</th>
                  <th>조회</th>
                  <th>방 만들기 시작</th>
                  <th>활동 시작</th>
                  <th>시작 전환율</th>
                </tr>
              </thead>
              <tbody>
                {(stats.period.traffic_sources ?? []).map((source) => (
                  <tr key={`${source.source}:${source.campaign}:${source.content}`}>
                    <th>{source.source === 'direct' ? '직접 유입' : source.source}</th>
                    <td>{source.campaign}</td>
                    <td>{source.content}</td>
                    <td>{number(source.visitors)}</td>
                    <td>{number(source.pageviews)}</td>
                    <td>{number(source.create_starts)}</td>
                    <td>{number(source.activity_starts)}</td>
                    <td>{source.conversion_percent}%</td>
                  </tr>
                ))}
                {(stats.period.traffic_sources ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8}>선택한 기간의 유입 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__heading">
            <div>
              <BarChart3 />
              <div>
                <h2>시간대별 흐름</h2>
                <p>{stats.period.bucket_hours}시간 단위 집계</p>
              </div>
            </div>
            <div className="admin-legend">
              <i />
              <span>방문자</span>
              <i />
              <span>방 생성</span>
            </div>
          </div>
          <div className="admin-chart-scroll">
            <div className="admin-chart">
              {stats.period.series.map((point) => (
                <div className="admin-chart__item" key={point.start}>
                  <div className="admin-chart__bars">
                    <span
                      className="admin-chart__bar admin-chart__bar--visitors"
                      style={{ height: `${(point.visitors / maxChartValue) * 100}%` }}
                      title={`방문자 ${point.visitors}명`}
                    />
                    <span
                      className="admin-chart__bar admin-chart__bar--rooms"
                      style={{ height: `${(point.rooms_created / maxChartValue) * 100}%` }}
                      title={`방 생성 ${point.rooms_created}개`}
                    />
                  </div>
                  <small>{point.label}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__heading">
            <div>
              <Eye />
              <div>
                <h2>구간별 상세</h2>
                <p>각 시간대의 정확한 수치</p>
              </div>
            </div>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>방문자</th>
                  <th>조회</th>
                  <th>활동 방문</th>
                  <th>활동 조회</th>
                  <th>방 생성</th>
                  <th>2명+</th>
                  <th>선정</th>
                  <th>공개</th>
                  <th>공유</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.period.series].reverse().map((point) => (
                  <tr key={point.start}>
                    <th>{point.label}</th>
                    <td>{number(point.visitors)}</td>
                    <td>{number(point.pageviews)}</td>
                    <td>{number(point.activity_visitors)}</td>
                    <td>{number(point.activity_pageviews)}</td>
                    <td>{number(point.rooms_created)}</td>
                    <td>{number(point.rooms_with_2_plus)}</td>
                    <td>{number(point.draw_completed)}</td>
                    <td>{number(point.revealed)}</td>
                    <td>{number(point.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="admin-all-time">
          <strong>전체 누적</strong>
          <span>방문자 {number(stats.visitors)}</span>
          <span>조회 {number(stats.pageviews)}</span>
          <span>활동 방문 {number(stats.activity_visitors)}</span>
          <span>활동 조회 {number(stats.activity_pageviews)}</span>
          <span>방 {number(stats.rooms_created)}</span>
          <span>선정 {number(stats.draw_completed)}</span>
          <span>공개 {number(stats.revealed)}</span>
        </footer>
      </div>
    </Shell>
  )
}
