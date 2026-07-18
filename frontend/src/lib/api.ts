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
  opening_verified_at?: string | null
  started_at?: string | null
  revealed_at?: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

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

export function getAnonymousSessionId() {
  const key = 'omys:anonymous-session'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
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
      metadata,
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
