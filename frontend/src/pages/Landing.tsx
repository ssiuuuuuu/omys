import { CircleHelp, DoorOpen, TreePalm, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetActivitySession, track } from '../lib/api'

export default function Landing() {
  const navigate = useNavigate()
  const [joinOpen, setJoinOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [roomCode, setRoomCode] = useState('')

  useEffect(() => {
    track('landing_view')
  }, [])

  useEffect(() => {
    if (!joinOpen && !helpOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setJoinOpen(false)
        setHelpOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [helpOpen, joinOpen])

  const joinRoom = (event: React.FormEvent) => {
    event.preventDefault()
    if (roomCode.length !== 6) return
    track('room_code_entered')
    navigate('/join/' + roomCode)
  }

  return (
    <main className="mobile-home">
      <div className="mobile-home__shade" />
      <div className="mobile-home__brand">OMYS</div>
      <button
        className="mobile-help-trigger"
        type="button"
        aria-label="사용법 열기"
        title="사용법"
        onClick={() => setHelpOpen(true)}
      >
        <CircleHelp />
      </button>
      <section className="mobile-home__content">
        <span className="mobile-home__pill">계획 없는 오늘을 위한 작은 모험</span>
        <h1>
          목적지는 비밀.
          <br />
          설렘만 챙겨요.
        </h1>
        <p>오늘의 장소는 도착할 때까지 비밀이에요.</p>
        <button
          className="mobile-cta mobile-cta--primary"
          type="button"
          onClick={() => {
            track('create_started')
            navigate('/create')
          }}
        >
          <TreePalm size={19} /> 방 생성
        </button>
        <button
          className="mobile-cta mobile-cta--activity"
          type="button"
          onClick={() => {
            resetActivitySession()
            track('activity_tab_opened')
            navigate('/activities')
          }}
        >
          <Zap size={18} /> 활동 뽑기
        </button>
        <button className="landing-join-trigger" type="button" onClick={() => setJoinOpen(true)}>
          <DoorOpen size={16} /> <span>이미 방이 있나요?</span>
          <strong>방 코드로 입장하기</strong>
        </button>
      </section>

      {helpOpen && (
        <div
          className="modal-backdrop mobile-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setHelpOpen(false)
          }}
        >
          <section
            className="room-code-modal mobile-room-code-modal usage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="usage-modal-title"
          >
            <button
              className="room-code-modal__close"
              type="button"
              aria-label="사용법 닫기"
              onClick={() => setHelpOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="room-code-modal__icon">
              <CircleHelp />
            </span>
            <h2 id="usage-modal-title">OMYS 사용법</h2>
            <p>
              <strong>OMYS(오늘의 미스터리 스팟)</strong>는 친구나 연인과의 외출 장소를 랜덤으로
              정해 주는 서비스입니다.
            </p>

            <div className="usage-modal__content">
              <section>
                <h3>친구들과 시작하기</h3>
                <ol>
                  <li>출발 위치를 설정해요.</li>
                  <li>초대방 링크를 공유해 친구를 추가해요.</li>
                  <li>하고 싶은 종목에서 고르거나 직접 입력한 뒤 주변 장소를 확인해요.</li>
                  <li>모두 준비되면 장소를 추첨해요.</li>
                </ol>
              </section>

              <section>
                <h3>OMYS가 골라주기</h3>
                <ol>
                  <li>출발 위치를 설정해요.</li>
                  <li>
                    장소 숨기기를 설정해요.
                    <ul>
                      <li>켜면 미스터리 스팟에 도착할 때까지 장소가 보이지 않아요.</li>
                      <li>끄면 출발 전에 미스터리 스팟을 확인할 수 있어요.</li>
                    </ul>
                  </li>
                  <li>
                    조건을 설정하고 미스터리 스팟을 누르세요.
                    <ul>
                      <li>응답이 늦어지면 시간 설정을 조금 더 완화해 주세요.</li>
                    </ul>
                  </li>
                </ol>
              </section>

              <section>
                <h3>할 거 없을 때</h3>
                <ul>
                  <li>활동 뽑기에서 원하는 분위기 탭을 선택하고 바로 시작해요.</li>
                </ul>
              </section>
            </div>
          </section>
        </div>
      )}

      {joinOpen && (
        <div
          className="modal-backdrop mobile-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setJoinOpen(false)
          }}
        >
          <section
            className="room-code-modal mobile-room-code-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-code-modal-title"
          >
            <button
              className="room-code-modal__close"
              type="button"
              aria-label="닫기"
              onClick={() => setJoinOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="room-code-modal__icon">
              <DoorOpen />
            </span>
            <h2 id="room-code-modal-title">방 코드로 입장하기</h2>
            <p>친구에게 받은 6자리 코드를 입력해 주세요.</p>
            <form onSubmit={joinRoom}>
              <label htmlFor="landing-room-code">방 코드</label>
              <input
                id="landing-room-code"
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  )
                }
                placeholder="ABC123"
                maxLength={6}
                pattern="[A-Z0-9]{6}"
                aria-describedby="landing-room-code-hint"
                required
              />
              <small id="landing-room-code-hint">영문·숫자 6자리</small>
              <button
                className="mobile-cta mobile-cta--primary"
                type="submit"
                disabled={roomCode.length !== 6}
              >
                입장하기
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
