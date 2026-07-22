import { useEffect, useRef, useState } from 'react'
import { Compass, Crosshair, LockKeyhole, MapPin, Navigation, Timer } from 'lucide-react'
import { api } from '../lib/api'
import {
  loadKakaoMaps,
  type KakaoLatLngBounds,
  type KakaoMap,
  type KakaoMaps,
  type KakaoMarker,
  type KakaoPolyline,
} from '../lib/kakao'
import { Button, Notice } from './UI'

type Coordinate = {
  latitude: number
  longitude: number
}

type Nav = {
  remaining_meters: number
  eta_minutes: number
  progress_percent: number
  direction: string
  reveal_available: boolean
  accuracy_meters?: number
  route_path: Coordinate[]
  consumed_index: number
  destination?: Coordinate
  message: string
}

type Segment = {
  start: Coordinate
  end: Coordinate
}

type MetricViewport = {
  level: number
  width: number
  height: number
}

const VIEWPORT_METERS = 300
const DESTINATION_SHOW_METERS = 100
const DESTINATION_HIDE_METERS = 150

function destinationPoint(
  origin: Coordinate,
  bearingDegrees: number,
  distance: number,
): Coordinate {
  const earthRadius = 6_371_000
  const angularDistance = distance / earthRadius
  const bearing = (bearingDegrees * Math.PI) / 180
  const latitude = (origin.latitude * Math.PI) / 180
  const longitude = (origin.longitude * Math.PI) / 180
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const targetLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
    )
  return {
    latitude: (targetLatitude * 180) / Math.PI,
    longitude: (targetLongitude * 180) / Math.PI,
  }
}

function clipSegment(segment: Segment, bounds: KakaoLatLngBounds): Segment | null {
  const southWest = bounds.getSouthWest()
  const northEast = bounds.getNorthEast()
  const minX = southWest.getLng()
  const maxX = northEast.getLng()
  const minY = southWest.getLat()
  const maxY = northEast.getLat()
  const dx = segment.end.longitude - segment.start.longitude
  const dy = segment.end.latitude - segment.start.latitude
  const p = [-dx, dx, -dy, dy]
  const q = [
    segment.start.longitude - minX,
    maxX - segment.start.longitude,
    segment.start.latitude - minY,
    maxY - segment.start.latitude,
  ]
  let minimum = 0
  let maximum = 1

  for (let index = 0; index < p.length; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return null
      continue
    }
    const ratio = q[index] / p[index]
    if (p[index] < 0) minimum = Math.max(minimum, ratio)
    else maximum = Math.min(maximum, ratio)
    if (minimum > maximum) return null
  }

  return {
    start: {
      latitude: segment.start.latitude + minimum * dy,
      longitude: segment.start.longitude + minimum * dx,
    },
    end: {
      latitude: segment.start.latitude + maximum * dy,
      longitude: segment.start.longitude + maximum * dx,
    },
  }
}

export function clipRouteToBounds(
  route: Coordinate[],
  bounds: KakaoLatLngBounds,
  maps: Pick<KakaoMaps, 'LatLng'>,
): Coordinate[] {
  const visible: Coordinate[] = []
  const append = (point: Coordinate) => {
    const previous = visible.at(-1)
    if (
      !previous ||
      previous.latitude !== point.latitude ||
      previous.longitude !== point.longitude
    ) {
      visible.push(point)
    }
  }

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index]
    const end = route[index + 1]
    const startPosition = new maps.LatLng(start.latitude, start.longitude)
    const endPosition = new maps.LatLng(end.latitude, end.longitude)
    const startInside = bounds.contain(startPosition)
    const endInside = bounds.contain(endPosition)

    if (startInside && endInside) {
      append(start)
      append(end)
      continue
    }

    const clipped = clipSegment({ start, end }, bounds)
    if (clipped) {
      append(clipped.start)
      append(clipped.end)
    }
  }
  return visible
}

export function shouldShowDestination(
  wasVisible: boolean,
  remainingMeters: number,
  hideUntilArrival: boolean,
): boolean {
  if (!hideUntilArrival) return true
  return wasVisible
    ? remainingMeters < DESTINATION_HIDE_METERS
    : remainingMeters <= DESTINATION_SHOW_METERS
}

export function selectMetricViewport(
  candidates: MetricViewport[],
  maxWidth: number,
  maxHeight: number,
): MetricViewport {
  const fallback = candidates.at(-1)
  if (!fallback) throw new Error('지도 뷰포트 후보가 필요합니다.')
  return (
    candidates.find((candidate) => candidate.width <= maxWidth && candidate.height <= maxHeight) ??
    fallback
  )
}

function measureMetricViewport(
  map: KakaoMap,
  maps: KakaoMaps,
  center: Coordinate,
): Omit<MetricViewport, 'level'> {
  const centerPosition = new maps.LatLng(center.latitude, center.longitude)
  const east = destinationPoint(center, 90, VIEWPORT_METERS)
  const north = destinationPoint(center, 0, VIEWPORT_METERS)
  const projection = map.getProjection()
  const centerPoint = projection.pointFromCoords(centerPosition)
  const eastPoint = projection.pointFromCoords(new maps.LatLng(east.latitude, east.longitude))
  const northPoint = projection.pointFromCoords(new maps.LatLng(north.latitude, north.longitude))
  return {
    width: Math.max(1, Math.abs(eastPoint.x - centerPoint.x)),
    height: Math.max(1, Math.abs(northPoint.y - centerPoint.y)),
  }
}

function resizeToMetricViewport(
  frame: HTMLDivElement,
  map: KakaoMap,
  maps: KakaoMaps,
  center: Coordinate,
  adaptLevel: boolean,
) {
  const centerPosition = new maps.LatLng(center.latitude, center.longitude)
  const pageWidth = document.documentElement.clientWidth || window.innerWidth
  const parentWidth = frame.parentElement?.clientWidth || pageWidth
  const viewportHeight = window.visualViewport?.height || window.innerHeight
  const maxWidth = Math.max(160, Math.min(pageWidth, parentWidth) - 8)
  const maxHeight = Math.max(160, Math.min(maxWidth, viewportHeight * 0.48))
  let viewport: MetricViewport

  if (adaptLevel) {
    const candidates: MetricViewport[] = []
    for (let level = 1; level <= 14; level += 1) {
      map.setLevel(level)
      candidates.push({ level, ...measureMetricViewport(map, maps, center) })
      const candidate = candidates.at(-1)
      if (candidate && candidate.width <= maxWidth && candidate.height <= maxHeight) break
    }
    viewport = selectMetricViewport(candidates, maxWidth, maxHeight)
    map.setLevel(viewport.level)
  } else {
    viewport = { level: map.getLevel(), ...measureMetricViewport(map, maps, center) }
  }

  frame.style.width = `${viewport.width}px`
  frame.style.height = `${viewport.height}px`
  map.relayout()
  map.setCenter(centerPosition)
}

function renderVisibleRoute(
  map: KakaoMap,
  maps: KakaoMaps,
  route: Coordinate[],
  routeShadow: KakaoPolyline,
  routeLine: KakaoPolyline,
) {
  const clipped = clipRouteToBounds(route, map.getBounds(), maps)
  const path = clipped.map((point) => new maps.LatLng(point.latitude, point.longitude))
  routeShadow.setPath(path)
  routeLine.setPath(path)
}

export function MysteryNavigation({
  code,
  token,
  hideUntilArrival,
  onReveal,
}: {
  code: string
  token: string
  hideUntilArrival: boolean
  onReveal: () => void
}) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapFrame = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const mapsRef = useRef<KakaoMaps | null>(null)
  const currentMarkerRef = useRef<KakaoMarker | null>(null)
  const destinationMarkerRef = useRef<KakaoMarker | null>(null)
  const routeLineRef = useRef<KakaoPolyline | null>(null)
  const routeShadowRef = useRef<KakaoPolyline | null>(null)
  const routeRef = useRef<Coordinate[]>([])
  const currentCoordinateRef = useRef<Coordinate | null>(null)
  const consumedIndexRef = useRef(0)
  const destinationRef = useRef<Coordinate | null>(null)
  const destinationVisibleRef = useRef(false)
  const disposeMapRef = useRef<(() => void) | null>(null)
  const [mapsSdk, setMapsSdk] = useState<KakaoMaps | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [nav, setNav] = useState<Nav | null>(null)
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [geoError, setGeoError] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [adminKey, setAdminKey] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('이 브라우저에서는 위치 정보를 사용할 수 없어요.')
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
    let active = true
    const pendingMaps = loadKakaoMaps()
    if (!pendingMaps) {
      setMapFailed(true)
      return () => {
        active = false
      }
    }
    pendingMaps
      .then((maps) => {
        if (active) setMapsSdk(maps)
      })
      .catch((error: unknown) => {
        if (!active) return
        setMapFailed(true)
        setGeoError(error instanceof Error ? error.message : '카카오맵을 불러오지 못했어요.')
      })
    return () => {
      active = false
      disposeMapRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!position) return
    let active = true
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
      .then((nextNav) => {
        if (!active) return
        routeRef.current = nextNav.route_path
        if (nextNav.destination) destinationRef.current = nextNav.destination
        consumedIndexRef.current = Math.max(consumedIndexRef.current, nextNav.consumed_index)
        setNav(nextNav)
        setGeoError('')
      })
      .catch((error: unknown) => {
        if (active)
          setGeoError(error instanceof Error ? error.message : '경로를 갱신하지 못했어요.')
      })
    return () => {
      active = false
    }
  }, [position, code, token])

  useEffect(() => {
    if (!mapsSdk || !position || !mapElement.current || !mapFrame.current) return
    const coordinate = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }
    currentCoordinateRef.current = coordinate
    const center = new mapsSdk.LatLng(coordinate.latitude, coordinate.longitude)

    if (!mapRef.current) {
      const map = new mapsSdk.Map(mapElement.current, { center, level: 2 })
      const currentMarker = new mapsSdk.Marker({ position: center, map })
      const destinationMarker = new mapsSdk.Marker({ position: center, map })
      const routeShadow = new mapsSdk.Polyline({
        path: [],
        map,
        strokeWeight: 12,
        strokeColor: '#ffffff',
        strokeOpacity: 0.9,
        strokeStyle: 'solid',
        zIndex: 2,
      })
      const routeLine = new mapsSdk.Polyline({
        path: [],
        map,
        strokeWeight: 6,
        strokeColor: '#00b896',
        strokeOpacity: 1,
        strokeStyle: 'solid',
        zIndex: 3,
      })
      destinationMarker.setVisible(false)
      map.setZoomable(false)
      map.setDraggable(false)
      mapRef.current = map
      mapsRef.current = mapsSdk
      currentMarkerRef.current = currentMarker
      destinationMarkerRef.current = destinationMarker
      routeShadowRef.current = routeShadow
      routeLineRef.current = routeLine

      const redraw = () => {
        renderVisibleRoute(map, mapsSdk, routeRef.current, routeShadow, routeLine)
      }
      const resize = () => {
        const currentCoordinate = currentCoordinateRef.current
        if (!mapFrame.current || !currentCoordinate) return
        resizeToMetricViewport(mapFrame.current, map, mapsSdk, currentCoordinate, true)
        redraw()
      }
      mapsSdk.event.addListener(map, 'idle', redraw)
      window.addEventListener('resize', resize)
      window.addEventListener('orientationchange', resize)
      window.visualViewport?.addEventListener('resize', resize)
      disposeMapRef.current = () => {
        mapsSdk.event.removeListener(map, 'idle', redraw)
        window.removeEventListener('resize', resize)
        window.removeEventListener('orientationchange', resize)
        window.visualViewport?.removeEventListener('resize', resize)
        currentMarker.setMap(null)
        destinationMarker.setMap(null)
        routeShadow.setMap(null)
        routeLine.setMap(null)
        mapRef.current = null
        mapsRef.current = null
      }
      resizeToMetricViewport(mapFrame.current, map, mapsSdk, coordinate, true)
      setMapReady(true)
      redraw()
      return
    }

    currentMarkerRef.current?.setPosition(center)
    resizeToMetricViewport(mapFrame.current, mapRef.current, mapsSdk, coordinate, false)
  }, [mapsSdk, position])

  useEffect(() => {
    const map = mapRef.current
    const maps = mapsRef.current
    const routeShadow = routeShadowRef.current
    const routeLine = routeLineRef.current
    if (map && maps && routeShadow && routeLine) {
      renderVisibleRoute(map, maps, routeRef.current, routeShadow, routeLine)
    }

    const marker = destinationMarkerRef.current
    const destination = destinationRef.current
    if (!marker || !maps || !nav || !destination) return
    marker.setPosition(new maps.LatLng(destination.latitude, destination.longitude))
    const visible = shouldShowDestination(
      destinationVisibleRef.current,
      nav.remaining_meters,
      hideUntilArrival,
    )
    destinationVisibleRef.current = visible
    marker.setVisible(visible)
  }, [nav, hideUntilArrival, mapReady])

  const reveal = async (testAdminKey?: string) => {
    setRevealing(true)
    try {
      await api(
        `/api/rooms/${code}/reveal`,
        {
          method: 'POST',
          body: JSON.stringify(
            testAdminKey
              ? { admin_key: testAdminKey }
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
    } catch (error) {
      setGeoError(error instanceof Error ? error.message : '목적지를 공개하지 못했어요.')
    } finally {
      setRevealing(false)
    }
  }

  return (
    <section className="navigation-screen">
      <div ref={mapFrame} className="mystery-map">
        <div
          ref={mapElement}
          className="mystery-map__canvas"
          aria-label="현재 위치 주변 300미터 지도"
        />
        {!mapReady && <div className="map-grid" />}
        {mapFailed && (
          <div className="mystery-map__fallback">
            <MapPin size={28} /> 지도를 불러오지 못했어요
          </div>
        )}
        <div className="map-secret">
          <LockKeyhole size={15} /> 목적지는 가까워질 때까지 비밀
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
                : '-'}
            </strong>
            <small>남은 거리</small>
          </div>
          <div>
            <Timer />
            <strong>{nav ? `${nav.eta_minutes}분` : '-'}</strong>
            <small>예상 시간</small>
          </div>
          <div>
            <Crosshair />
            <strong>{nav ? `${nav.progress_percent}%` : '-'}</strong>
            <small>진행률</small>
          </div>
        </div>
        {geoError && <Notice tone="warning">{geoError}</Notice>}
        <Button
          onClick={() => reveal()}
          loading={revealing}
          disabled={hideUntilArrival && !nav?.reveal_available}
        >
          <Navigation size={18} /> {hideUntilArrival ? '미스터리 스팟 공개하기' : '장소 공개하기'}
        </Button>
        {hideUntilArrival && !nav?.reveal_available && (
          <small className="center-copy">목적지 100m 안에 도착하면 열려요</small>
        )}
        <details className="test-admin-reveal">
          <summary>테스트용 목적지 확인</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void reveal(adminKey.trim())
            }}
          >
            <label htmlFor="navigation-admin-key">관리자 키</label>
            <input
              id="navigation-admin-key"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="키 입력"
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!adminKey.trim()}
              loading={revealing}
            >
              목적지 보기
            </Button>
            <small>테스트가 끝나면 임시 키를 제거해 주세요.</small>
          </form>
        </details>
      </div>
    </section>
  )
}
