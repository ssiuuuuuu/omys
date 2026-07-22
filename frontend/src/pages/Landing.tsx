import { DoorOpen, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../lib/api'

export default function Landing() {
  const navigate = useNavigate()
  const [joinOpen, setJoinOpen] = useState(false)
  const [roomCode, setRoomCode] = useState('')

  useEffect(() => {
    track('landing_view')
  }, [])

  useEffect(() => {
    if (!joinOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setJoinOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [joinOpen])

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
          방 생성
        </button>
        <button
          className="mobile-cta mobile-cta--secondary"
          type="button"
          onClick={() => setJoinOpen(true)}
        >
          방 입장
        </button>
        <button
          className="mobile-cta mobile-cta--activity"
          type="button"
          onClick={() => {
            track('activity_tab_opened')
            navigate('/activities')
          }}
        >
          <Zap size={18} /> 활동 뽑기
        </button>
      </section>

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
