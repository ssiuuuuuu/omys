import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, MapPin } from 'lucide-react'
import { loadKakaoMaps, type KakaoLocation } from '../lib/kakao'
import { Button } from './UI'

export function DepartureLocationPreview({
  location,
  confirmed,
  onConfirm,
}: {
  location: KakaoLocation
  confirmed: boolean
  onConfirm: () => void
}) {
  const mapElement = useRef<HTMLDivElement>(null)
  const [mapFailed, setMapFailed] = useState(false)

  useEffect(() => {
    let active = true
    setMapFailed(false)
    const pendingMaps = loadKakaoMaps()
    if (!pendingMaps) {
      setMapFailed(true)
      return () => {
        active = false
      }
    }

    pendingMaps
      .then((maps) => {
        if (!active || !mapElement.current) return
        const center = new maps.LatLng(location.latitude, location.longitude)
        const map = new maps.Map(mapElement.current, { center, level: 3 })
        new maps.Marker({ position: center, map })
        map.relayout()
        map.setCenter(center)
      })
      .catch(() => {
        if (active) setMapFailed(true)
      })

    return () => {
      active = false
    }
  }, [location.latitude, location.longitude])

  const mapUrl = `https://map.kakao.com/link/map/${encodeURIComponent(location.label)},${location.latitude},${location.longitude}`

  return (
    <section className="departure-preview" aria-label="출발 위치 확인">
      <div className="departure-preview__map-wrap">
        <div ref={mapElement} className="departure-preview__map" aria-label="출발 위치 지도" />
        {mapFailed && (
          <div className="departure-preview__fallback">
            <MapPin size={31} />
            <span>선택한 위치</span>
          </div>
        )}
      </div>
      <div className="departure-preview__body">
        <span className="departure-preview__eyebrow">
          <MapPin size={14} /> 출발 위치
        </span>
        <strong>{location.label}</strong>
        <p>{location.address}</p>
        <small>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </small>
        <a href={mapUrl} target="_blank" rel="noreferrer">
          카카오맵에서 크게 보기 <ExternalLink size={13} />
        </a>
      </div>
      {confirmed ? (
        <div className="departure-preview__confirmed">
          <CheckCircle2 size={18} /> 출발 위치로 확정했어요
        </div>
      ) : (
        <Button type="button" onClick={onConfirm}>
          <CheckCircle2 size={18} /> 이곳이 맞아요
        </Button>
      )}
    </section>
  )
}
