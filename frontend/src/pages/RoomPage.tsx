import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Clipboard,
  Crown,
  Eye,
  LockKeyhole,
  Navigation,
  PartyPopper,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getToken, resetLocalSession, track, type Room } from '../lib/api'
import { Button, EmptyState, Notice, Shell, Skeleton } from '../components/UI'
import { PlaceSearch } from '../components/PlaceSearch'
import { Conditions } from '../components/Conditions'
import { MysteryNavigation } from '../components/MysteryNavigation'
import { ResultCard } from '../components/ResultCard'
import { shareToKakaoTalk } from '../lib/kakao'

export default function RoomPage() {
  const { code = '' } = useParams()
  const token = getToken(code)
  const navigate = useNavigate()
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [copied, setCopied] = useState(false)
  const refresh = useCallback(async () => {
    if (!token) {
      navigate(`/join/${code}`, { replace: true })
      return
    }
    try {
      setRoom(await api<Room>(`/api/rooms/${code}`, {}, token))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '방을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [code, token, navigate])
  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 2500)
    return () => clearInterval(id)
  }, [refresh])
  const action = async (path: string, body?: object) => {
    setBusy(path)
    setError('')
    try {
      await api(
        `/api/rooms/${code}/${path}`,
        { method: 'POST', body: body ? JSON.stringify(body) : undefined },
        token,
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청을 처리하지 못했어요.')
    } finally {
      setBusy('')
    }
  }
  const draw = async () => {
    setDrawing(true)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await action('draw')
    setDrawing(false)
  }
  const goHome = () => {
    resetLocalSession()
    navigate('/', { replace: true })
  }
  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${location.origin}/join/${code}`)
    setCopied(true)
    track('invite_link_copied')
    setTimeout(() => setCopied(false), 1800)
  }
  const shareInvite = async () => {
    const text = `${room?.title ?? '오늘의 비밀 외출'}에 초대할게요! 같이 장소 골라요.`
    const url = `${location.origin}/join/${code}`
    try {
      await shareToKakaoTalk(text, url)
      track('invite_link_copied')
      return
    } catch {
      // 카카오 JS 키 미설정 등 — 다음 방법으로 폴백.
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: room?.title || 'OMYS 초대', text, url })
        track('invite_link_copied')
      } catch {
        // 사용자가 공유 시트를 취소한 경우 등 — 조용히 무시.
      }
      return
    }
    await copyInvite()
  }
  if (loading)
    return (
      <Shell>
        <Skeleton />
      </Shell>
    )
  if (!room)
    return (
      <Shell>
        <EmptyState
          title="방에 들어갈 수 없어요"
          body={error || '초대 링크를 다시 확인해 주세요.'}
          action={<Button onClick={() => navigate('/')}>홈으로 가기</Button>}
        />
      </Shell>
    )
  if (room.status === 'revealed' && room.selected_place)
    return (
      <Shell home onHome={goHome}>
        <ResultCard room={room} />
      </Shell>
    )
  if (room.status === 'navigating' && (room.mode === 'omys' || room.hide_until_arrival))
    return (
      <Shell back>
        <MysteryNavigation
          code={code}
          token={token}
          isHost={room.is_host}
          hideUntilArrival={room.hide_until_arrival}
          onReveal={refresh}
        />
      </Shell>
    )
  if (drawing)
    return (
      <Shell>
        <div className="draw-screen">
          <div className="draw-orb">
            <span>?</span>
            <i />
            <i />
            <i />
          </div>
          <span className="eyebrow">
            <Sparkles size={15} /> 후보를 섞는 중
          </span>
          <h1>
            오늘의 운명이
            <br />
            정해지고 있어요
          </h1>
          <p>장소 정보를 마지막으로 확인합니다.</p>
        </div>
      </Shell>
    )
  const allReady =
    room.participants.length >= 2 && room.participants.every((item) => item.submission_completed)
  const me = room.participants.find((item) => item.id === room.participant_id)
  const manualReveal = () => {
    if (confirm('위치 확인 없이 모든 참가자에게 장소를 공개할까요?'))
      void action('reveal', { manual_confirm: true })
  }
  const goToStepOne = () => navigate(`/create?mode=${room.mode}`)
  return (
    <Shell
      title={room.status === 'waiting' ? '대기실' : room.status === 'drawn' ? '오늘의 가이드' : '이동 중…'}
      home={room.status === 'waiting' || room.status === 'drawn'}
      onHome={goHome}
      back={room.status === 'waiting'}
      backLabel="STEP 1로 돌아가기"
      onBack={goToStepOne}
    >
      <div className="room-header">
        <div>
          <span className="step-label">
            {room.mode === 'friends' ? 'FRIENDS MODE' : 'OMYS MODE'}
          </span>
          <h1>{room.title}</h1>
          <p>{room.departure_location}에서 출발</p>
        </div>
        <span className="room-code">{room.invite_code}</span>
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {room.mode === 'omys' && room.status === 'waiting' && (
        <Conditions code={code} token={token} onSelected={refresh} />
      )}
      {room.mode === 'friends' && room.status === 'waiting' && (
        <div className="stack">
          <section className="invite-card">
            <span className="invite-card__icon">
              <Users />
            </span>
            <div>
              <small>친구 초대 링크</small>
              <strong>
                {location.origin.replace(/^https?:\/\//, '')}/join/{code}
              </strong>
            </div>
            <div className="invite-card__actions">
              <Button
                variant="secondary"
                className="invite-card__icon-button"
                aria-label={copied ? '복사됨' : '초대 링크 복사'}
                onClick={copyInvite}
              >
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
              </Button>
              <Button
                variant="secondary"
                className="invite-card__icon-button"
                aria-label="초대 링크 공유"
                onClick={() => void shareInvite()}
              >
                <Share2 size={18} />
              </Button>
            </div>
          </section>
          <section className="participants-card">
            <div className="section-row">
              <div>
                <h2 className="section-title">모험가 현황</h2>
                <p className="section-copy">
                  {room.participants.filter((x) => x.submission_completed).length}/
                  {room.participants.length}명 준비 완료
                </p>
              </div>
              <span className="live-dot">LIVE</span>
            </div>
            <div className="participant-list">
              {room.participants.map((item) => (
                <div key={item.id}>
                  <span className="avatar">{item.nickname.slice(0, 1)}</span>
                  <span>
                    <b>
                      {item.nickname} {item.is_host && <Crown size={14} />}
                    </b>
                    <small>
                      {item.submission_completed ? '비밀 후보 제출 완료' : '후보 고르는 중…'}
                    </small>
                  </span>
                  <i className={item.submission_completed ? 'ready ready--done' : 'ready'}>
                    {item.submission_completed ? <Check size={14} /> : '…'}
                  </i>
                </div>
              ))}
            </div>
          </section>
          {!me?.submission_completed ? (
            <>
              <PlaceSearch
                code={code}
                token={token}
                submitted={room.own_candidates}
                departureLocation={room.departure_location}
                departureLatitude={room.departure_latitude}
                departureLongitude={room.departure_longitude}
                onSubmitted={refresh}
              />
              {room.own_candidates.length > 0 && (
                <div className="sticky-action">
                  <Button
                    onClick={() => action('submission/complete')}
                    loading={busy === 'submission/complete'}
                  >
                    <ShieldCheck size={19} /> {room.own_candidates.length}개 후보 제출 완료
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Notice tone="success">
              <LockKeyhole size={18} /> 내 후보 {room.own_candidates.length}개가 비밀리에
              봉인됐어요.
            </Notice>
          )}
          {room.is_host && (
            <section className="host-action">
              <Button disabled={!allReady} loading={busy === 'draw'} onClick={draw}>
                <PartyPopper size={19} /> 미스터리 추첨 시작
              </Button>
              {!allReady && <small>두 명 이상이 모두 제출하면 시작할 수 있어요.</small>}
            </section>
          )}
        </div>
      )}
      {room.status === 'drawn' && (
        <section className="locked-result">
          <div className="locked-result__seal">
            <LockKeyhole />
          </div>
          <span className="eyebrow">
            <Sparkles size={15} /> 결과가 서버에 봉인됐어요
          </span>
          <h1>{room.you_are_guide ? '당신이 오늘의 가이드!' : '목적지는 아직 비밀입니다'}</h1>
          {room.you_are_guide && room.selected_place ? (
            <div className="guide-card">
              <span>
                <Eye />
              </span>
              <small>나에게만 보이는 당첨 장소</small>
              <h2>{room.selected_place.name}</h2>
              <p>{room.selected_place.address}</p>
              {room.selected_place.place_url && (
                <a href={room.selected_place.place_url} target="_blank" rel="noreferrer">
                  길찾기 열기 <Navigation size={16} />
                </a>
              )}
            </div>
          ) : (
            <p>
              {room.mode === 'friends' && room.hide_until_arrival ? (
                <>
                  당첨 장소는 모든 친구에게 숨겨져 있어요.
                  <br />
                  출발하면 비밀 내비가 길을 알려드려요!
                </>
              ) : (
                <>
                  당첨 장소를 낸 친구만 목적지를 확인했어요.
                  <br />
                  가이드를 잘 따라가 주세요!
                </>
              )}
            </p>
          )}
          <div className="locked-actions">
            {room.mode === 'omys' && room.is_host && !room.hide_until_arrival && (
              <Button onClick={() => action('reveal', {})} loading={busy === 'reveal'}>
                <Eye size={18} /> 장소 공개하기
              </Button>
            )}
            {room.is_host && (
              <Button onClick={() => action('start')} loading={busy === 'start'}>
                <Navigation size={19} /> 출발하기
              </Button>
            )}
            {room.can_redraw && (
              <Button
                variant="ghost"
                onClick={() =>
                  confirm('다시 뽑기는 한 번만 가능하며 이전 장소는 제외됩니다. 계속할까요?') &&
                  action('redraw')
                }
                loading={busy === 'redraw'}
              >
                <RefreshCw size={18} /> 한 번 다시 뽑기
              </Button>
            )}
          </div>
        </section>
      )}
      {room.status === 'navigating' && room.mode === 'friends' && !room.hide_until_arrival && (
        <section className="follow-guide">
          <span className="follow-guide__icon">
            <Navigation />
          </span>
          <span className="eyebrow">친구 가이드 모드</span>
          <h1>
            {room.you_are_guide ? '모두를 비밀 스팟으로 안내해 주세요' : '가이드를 따라가세요'}
          </h1>
          <p>
            {room.you_are_guide && room.selected_place
              ? room.selected_place.name
              : '목적지 정보는 가이드에게만 보여요.'}
          </p>
          {room.you_are_guide && room.selected_place?.place_url && (
            <a
              className="button button--secondary"
              href={room.selected_place.place_url}
              target="_blank"
              rel="noreferrer"
            >
              가이드 길찾기 열기
            </a>
          )}
          {room.is_host && (
            <Button onClick={manualReveal}>
              <Eye size={18} /> 도착해서 함께 공개하기
            </Button>
          )}
        </section>
      )}
    </Shell>
  )
}
