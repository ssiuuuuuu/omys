import { useEffect, useState } from 'react'
import { Compass, Crosshair, LockKeyhole, MapPin, Navigation, Timer } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Notice } from './UI'

type Nav = {
  remaining_meters: number
  eta_minutes: number
  progress_percent: number
  direction: string
  reveal_available: boolean
  accuracy_meters?: number
  message: string
}
export function MysteryNavigation({
  code,
  token,
  isHost,
  hideUntilArrival,
  onReveal,
}: {
  code: string
  token: string
  isHost: boolean
  hideUntilArrival: boolean
  onReveal: () => void
}) {
  const [nav, setNav] = useState<Nav | null>(null)
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [geoError, setGeoError] = useState('')
  const [revealing, setRevealing] = useState(false)
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('이 브라우저에서는 위치를 사용할 수 없어요.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      setPosition,
      () => setGeoError('위치 권한이 없거나 GPS 신호가 불안정해요.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  useEffect(() => {
    if (!position) return
    void api<Nav>(
      `/api/rooms/${code}/navigation`,
      {
        method: 'POST',
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      },
      token,
    )
      .then(setNav)
      .catch((err) => setGeoError(err.message))
  }, [position, code, token])
  const reveal = async (manual = false) => {
    setRevealing(true)
    try {
      await api(
        `/api/rooms/${code}/reveal`,
        {
          method: 'POST',
          body: JSON.stringify(
            manual
              ? { manual_confirm: true }
              : {
                  latitude: position?.coords.latitude,
                  longitude: position?.coords.longitude,
                  accuracy: position?.coords.accuracy,
                },
          ),
        },
        token,
      )
      onReveal()
    } catch (err) {
      setGeoError(err instanceof Error ? err.message : '공개하지 못했어요.')
    } finally {
      setRevealing(false)
    }
  }
  return (
    <section className="navigation-screen">
      <div className="mystery-map">
        <div className="map-grid" />
        <svg viewBox="0 0 320 300" aria-hidden="true">
          <path
            className="route-shadow"
            d="M48 265 C58 220, 120 232, 120 186 S205 165, 200 110 S270 96, 272 42"
          />
          <path
            className="route-path"
            d="M48 265 C58 220, 120 232, 120 186 S205 165, 200 110 S270 96, 272 42"
          />
        </svg>
        <span className="current-dot">
          <Navigation size={17} />
        </span>
        <span className="hidden-zone">
          <LockKeyhole size={22} />
        </span>
        <div className="map-secret">
          <LockKeyhole size={15} /> 목적지는 지도에서도 비밀
        </div>
      </div>
      <div className="nav-card">
        <div className="nav-card__eyebrow">
          <Compass size={17} /> {nav?.direction ?? '현재 위치를 찾고 있어요'}
        </div>
        <h1>
          목적지는 아직
          <br />
          <em>비밀입니다</em>
        </h1>
        <div className="progress">
          <span style={{ width: `${nav?.progress_percent ?? 4}%` }} />
        </div>
        <div className="nav-metrics">
          <div>
            <MapPin />
            <strong>
              {nav
                ? nav.remaining_meters < 1000
                  ? `${nav.remaining_meters}m`
                  : `${(nav.remaining_meters / 1000).toFixed(1)}km`
                : '—'}
            </strong>
            <small>남은 거리</small>
          </div>
          <div>
            <Timer />
            <strong>{nav ? `${nav.eta_minutes}분` : '—'}</strong>
            <small>예상 시간</small>
          </div>
          <div>
            <Crosshair />
            <strong>{nav ? `${nav.progress_percent}%` : '—'}</strong>
            <small>진행률</small>
          </div>
        </div>
        {geoError && <Notice tone="warning">{geoError}</Notice>}
        <Button
          onClick={() => reveal(false)}
          loading={revealing}
          disabled={hideUntilArrival && !nav?.reveal_available}
        >
          {hideUntilArrival ? '미스터리 스팟 공개하기' : '장소 공개하기'}
        </Button>
        {hideUntilArrival && !nav?.reveal_available && (
          <small className="center-copy">목적지 100m 안에 도착하면 열려요.</small>
        )}
        {isHost && geoError && (
          <button className="text-button" onClick={() => reveal(true)}>
            위치 없이 수동 공개하기
          </button>
        )}
      </div>
    </section>
  )
}
