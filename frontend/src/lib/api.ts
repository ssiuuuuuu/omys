export type Place = {
  external_place_id: string
  name: string
  category: string
  address: string
  latitude: number
  longitude: number
  price_level?: number | null
  business_status?: string | null
  open_now?: boolean | null
  next_close_time?: string | null
  is_public_outdoor?: boolean
  place_url?: string | null
  phone?: string | null
  distance_meters?: number
  verified_at?: string
}

export type Room = {
  invite_code: string
  title: string
  mode: 'friends' | 'omys'
  status: 'waiting' | 'drawn' | 'navigating' | 'revealed'
  departure_location: string
  departure_latitude: number
  departure_longitude: number
  redraw_allowed: boolean
  hide_until_arrival: boolean
  redraw_count: number
  can_redraw: boolean
  is_host: boolean
  participant_id: string
  selection_locked: boolean
  you_are_guide: boolean
  participants: { id: string; nickname: string; is_host: boolean; submission_completed: boolean }[]
  own_candidates: Place[]
  selected_place: Place | null
  selected_by_nickname?: string | null
  opening_verified_at?: string | null
  started_at?: string | null
  revealed_at?: string | null
}

export type AdminMetricSummary = {
  visitors: number
  pageviews: number
  activity_visitors: number
  activity_pageviews: number
  rooms_created: number
  rooms_with_2_plus: number
  draw_completed: number
  revealed: number
  shares: number
  conversion: {
    room_to_draw_percent: number
    draw_to_reveal_percent: number
  }
}

export type AdminStatsPoint = Omit<AdminMetricSummary, 'conversion'> & {
  start: string
  end: string
  label: string
}

export type AdminTrafficSource = {
  source: string
  campaign: string
  content: string
  visitors: number
  pageviews: number
  create_starts: number
  activity_starts: number
  conversion_percent: number
}

export type AdminStats = AdminMetricSummary & {
  period: {
    range: '6h' | '12h' | '24h' | '3d'
    label: string
    timezone: 'Asia/Seoul'
    bucket_hours: number
    start: string
    end: string
    totals: AdminMetricSummary
    series: AdminStatsPoint[]
    traffic_sources: AdminTrafficSource[]
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const STORAGE_PREFIX = 'omys:'
const ATTRIBUTION_STORAGE_KEY = 'omys:traffic-attribution'
export const ACTIVITY_SESSION_STORAGE_KEY = 'omys:activity-session'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function tokenKey(code: string) {
  return `omys:participant:${code.toUpperCase()}`
}
export function getToken(code: string) {
  return localStorage.getItem(tokenKey(code)) ?? ''
}
export function saveToken(code: string, token: string) {
  localStorage.setItem(tokenKey(code), token)
}

export function resetLocalSession() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key)
  }
}

export function resetActivitySession() {
  localStorage.removeItem(ACTIVITY_SESSION_STORAGE_KEY)
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('X-Participant-Token', token)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: '요청을 처리하지 못했습니다.' }))
    throw new ApiError(response.status, body.detail ?? '요청을 처리하지 못했습니다.')
  }
  return response.json()
}

export function getAdminStats(adminKey: string, range: AdminStats['period']['range']) {
  return api<AdminStats>(`/api/admin/stats?range=${range}`, {
    headers: { 'X-Admin-Key': adminKey },
  })
}

export function getAnonymousSessionId() {
  const key = 'omys:anonymous-session'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
}

type TrafficAttribution = Record<string, string>

function readStoredAttribution(): TrafficAttribution {
  try {
    return JSON.parse(sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getTrafficAttribution(): TrafficAttribution {
  const params = new URLSearchParams(window.location.search)
  const taggedAttribution: TrafficAttribution = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = params.get(key)?.trim()
    if (value) taggedAttribution[key] = value.slice(0, 100)
  }

  if (Object.keys(taggedAttribution).length > 0) {
    taggedAttribution.landing_path = window.location.pathname.slice(0, 200)
    try {
      if (document.referrer) {
        taggedAttribution.referrer_host = new URL(document.referrer).hostname.slice(0, 100)
      }
    } catch {
      // Ignore malformed referrers supplied by the browser.
    }
    sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(taggedAttribution))
    return taggedAttribution
  }

  const stored = readStoredAttribution()
  if (Object.keys(stored).length > 0) return stored

  const directAttribution: TrafficAttribution = {
    utm_source: 'direct',
    landing_path: window.location.pathname.slice(0, 200),
  }
  try {
    if (document.referrer) {
      const referrerHost = new URL(document.referrer).hostname.slice(0, 100)
      if (referrerHost && referrerHost !== window.location.hostname) {
        directAttribution.utm_source = referrerHost
        directAttribution.referrer_host = referrerHost
      }
    }
  } catch {
    // Ignore malformed referrers supplied by the browser.
  }
  sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(directAttribution))
  return directAttribution
}

export function track(
  event_name: string,
  room_id?: string,
  metadata: Record<string, unknown> = {},
) {
  void api('/api/analytics', {
    method: 'POST',
    body: JSON.stringify({
      anonymous_session_id: getAnonymousSessionId(),
      room_id,
      event_name,
      metadata: { ...getTrafficAttribution(), ...metadata },
    }),
  }).catch(() => undefined)
}

export function formatDistance(value?: number) {
  if (value == null) return '거리 계산 중'
  return value < 1000
    ? `약 ${Math.max(10, Math.round(value / 10) * 10)}m`
    : `약 ${(value / 1000).toFixed(1)}km`
}

export function formatVerified(value?: string | null) {
  if (!value) return '영업 정보 확인 중'
  return `영업 여부 확인 완료 · ${new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))} 기준`
}
