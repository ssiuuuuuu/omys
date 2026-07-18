import { useState } from 'react'
import { Crosshair, EyeOff, LockKeyhole, MapPin, Search, Users } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, saveToken } from '../lib/api'
import { describeKakaoCoordinates, searchKakaoLocation, type KakaoLocation } from '../lib/kakao'
import { DepartureLocationPreview } from '../components/DepartureLocationPreview'
import { Button, Field, Notice, Shell } from '../components/UI'

export default function CreateRoom() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mode = params.get('mode') === 'omys' ? 'omys' : 'friends'
  const [form, setForm] = useState({
    title: mode === 'friends' ? '우리의 미스터리 외출' : '오늘의 즉흥 외출',
    nickname: '',
    location: '서울시청',
    lat: 37.5665,
    lng: 126.978,
    redraw: true,
    hideUntilArrival: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)
  const [findingLocation, setFindingLocation] = useState(false)
  const [locationPreview, setLocationPreview] = useState<KakaoLocation | null>(null)
  const [locationConfirmed, setLocationConfirmed] = useState(false)

  const previewDefaultLocation = () => {
    if (locationPreview || form.location !== '서울시청') return
    setLocationPreview({
      label: '서울시청',
      address: '서울 중구 세종대로 110',
      latitude: form.lat,
      longitude: form.lng,
    })
    setLocationConfirmed(false)
  }

  const findLocation = async () => {
    const query = form.location.trim()
    if (!query) {
      setError('출발 위치를 입력해 주세요.')
      return
    }
    setFindingLocation(true)
    setError('')
    try {
      const found = await searchKakaoLocation(query)
      if (!found) {
        setError('입력한 출발 위치를 찾지 못했어요. 장소명이나 주소를 더 자세히 적어주세요.')
        return
      }
      setForm((prev) => ({ ...prev, location: found.label }))
      setLocationPreview(found)
      setLocationConfirmed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '출발 위치를 찾지 못했어요.')
    } finally {
      setFindingLocation(false)
    }
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setError('이 브라우저에서는 현재 위치를 사용할 수 없어요. 장소명이나 주소를 입력해 주세요.')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const found = await describeKakaoCoordinates(pos.coords.latitude, pos.coords.longitude)
          setForm((prev) => ({ ...prev, location: found.label }))
          setLocationPreview(found)
          setLocationConfirmed(false)
        } catch {
          const fallback = {
            label: '현재 위치',
            address: '현재 위치',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }
          setForm((prev) => ({ ...prev, location: fallback.label }))
          setLocationPreview(fallback)
          setLocationConfirmed(false)
        } finally {
          setLocating(false)
        }
      },
      () => {
        setError('위치 권한을 사용할 수 없어요. 장소명이나 주소를 직접 입력해 주세요.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const confirmLocation = () => {
    if (!locationPreview) return
    setForm((prev) => ({
      ...prev,
      location: locationPreview.label,
      lat: locationPreview.latitude,
      lng: locationPreview.longitude,
    }))
    setLocationConfirmed(true)
    setError('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!locationConfirmed || !locationPreview) {
      setError('출발 위치를 지도에서 확인한 뒤 “이곳이 맞아요”를 눌러 주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await api<{ invite_code: string; participant_token: string }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          mode,
          host_nickname: form.nickname,
          departure: { label: form.location, latitude: form.lat, longitude: form.lng },
          redraw_allowed: form.redraw,
          hide_until_arrival: form.hideUntilArrival,
        }),
      })
      saveToken(result.invite_code, result.participant_token)
      navigate(`/room/${result.invite_code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '방을 만들지 못했어요.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Shell back>
      <div className="step-label">STEP 1 · 방 만들기</div>
      <h1 className="page-title">
        {mode === 'friends' ? '친구들과 어디로 가볼까요?' : '조건만 알려주면 나머지는 비밀!'}
      </h1>
      <p className="page-subtitle">출발 위치는 가까운 장소와 이동 시간을 찾는 데만 사용해요.</p>
      <form className="stack" onSubmit={submit}>
        <Field label="방 이름">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={60}
            required
          />
        </Field>
        <Field label="내 닉네임">
          <input
            value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            placeholder="예: 모험가 수지"
            maxLength={20}
            required
          />
        </Field>
        <div className="field">
          <label className="field__label" htmlFor="departure-location">
            출발 위치
          </label>
          <div className="input-with-icon">
            <MapPin size={19} />
            <input
              id="departure-location"
              value={form.location}
              onFocus={previewDefaultLocation}
              onChange={(e) => {
                setForm({ ...form, location: e.target.value })
                setLocationPreview(null)
                setLocationConfirmed(false)
                setError('')
              }}
              maxLength={160}
              required
            />
          </div>
          <div className="location-actions">
            <button
              type="button"
              className="location-button"
              onClick={findLocation}
              disabled={findingLocation || locating}
            >
              <Search size={16} /> {findingLocation ? '위치 찾는 중…' : '입력한 위치 찾기'}
            </button>
            <button
              type="button"
              className="location-button"
              onClick={locate}
              disabled={locating || findingLocation}
            >
              <Crosshair size={16} /> {locating ? '현재 위치 찾는 중…' : '현재 위치 사용'}
            </button>
          </div>
          <small>장소명이나 주소를 찾은 다음 지도에서 출발 위치를 확인해 주세요.</small>
        </div>
        {locationPreview && (
          <DepartureLocationPreview
            location={locationPreview}
            confirmed={locationConfirmed}
            onConfirm={confirmLocation}
          />
        )}
        {mode === 'friends' && (
          <label className="toggle-card">
            <span className="toggle-card__icon">
              <LockKeyhole />
            </span>
            <span>
              <b>출발 전 다시 뽑기 1회</b>
              <small>방장만 사용할 수 있어요</small>
            </span>
            <input
              type="checkbox"
              checked={form.redraw}
              onChange={(e) => setForm({ ...form, redraw: e.target.checked })}
            />
          </label>
        )}
        {mode === 'omys' && (
          <label className="toggle-card">
            <span className="toggle-card__icon">
              <EyeOff />
            </span>
            <span>
              <b>도착할 때까지 장소 숨기기</b>
              <small>도착한 뒤에도 공개 버튼을 눌러야 장소가 보여요</small>
            </span>
            <input
              type="checkbox"
              checked={form.hideUntilArrival}
              onChange={(e) => setForm({ ...form, hideUntilArrival: e.target.checked })}
            />
          </label>
        )}
        {error && <Notice tone="warning">{error}</Notice>}
        <Button type="submit" loading={loading} disabled={!locationConfirmed}>
          {mode === 'friends' ? (
            <>
              <Users size={19} /> 초대 방 만들기
            </>
          ) : (
            <>조건 선택하러 가기</>
          )}
        </Button>
      </form>
    </Shell>
  )
}
