import { BookOpen, ChevronDown, DoorOpen, LockKeyhole, Map, Sparkles, X, Zap } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo, Shell } from '../components/UI'
import { track } from '../lib/api'
import { useEffect, useState } from 'react'

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
    navigate(`/join/${roomCode}`)
  }

  return (
    <Shell wide>
      <section className="hero">
        <div className="hero__copy">
          <span className="eyebrow">
            <Sparkles size={15} /> 계획 없는 오늘을 위한 작은 모험
          </span>
          <Logo />
          <h1>
            목적지는 비밀.
            <br />
            <em>설렘만 챙겨요.</em>
          </h1>
          <p>
            친구들의 아이디어를 몰래 모으거나, OMYS에게 오늘의 장소를 맡겨 보세요. 도착할 때까지
            정답은 봉인됩니다.
          </p>
          <div className="hero__actions">
            <Link
              className="button button--primary"
              to="/create?mode=friends"
              onClick={() => track('mode_selected', undefined, { mode: 'friends' })}
            >
              친구들과 시작하기
            </Link>
            <Link
              className="button button--primary"
              to="/create?mode=omys"
              onClick={() => track('mode_selected', undefined, { mode: 'omys' })}
            >
              OMYS가 골라주기
            </Link>
          </div>
          <button className="landing-join-trigger" type="button" onClick={() => setJoinOpen(true)}>
            <DoorOpen size={17} /> 이미 방이 있나요? <strong>방 코드로 입장하기</strong>
          </button>
        </div>
        <div className="mystery-visual" aria-hidden="true">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="sealed-card">
            <span className="sealed-card__pin">
              <Map size={30} />
            </span>
            <small>오늘의 미스터리 스팟</small>
            <strong>?</strong>
            <div className="sealed-card__line" />
            <div className="sealed-card__seal">
              <LockKeyhole size={17} />
            </div>
          </div>
          <span className="floating-chip floating-chip--one">도착하면 공개</span>
          <span className="floating-chip floating-chip--two">두근두근 82%</span>
        </div>
      </section>
      <section className="activity-teaser">
        <span className="activity-teaser__icon">
          <Zap />
        </span>
        <div>
          <strong>⚡ 할 거 없을 때</strong>
          <p>
            친구들과 만났는데 할 게 없나요?
            <br />
            지금 필요한 느낌을 선택하면 OMYS가 바로 할 일을 정해 드려요.
          </p>
        </div>
        <Link
          className="button button--secondary"
          to="/activities"
          onClick={() => track('activity_tab_opened')}
        >
          활동 뽑기
        </Link>
      </section>
      <details className="usage-guide">
        <summary>
          <span className="usage-guide__icon">
            <BookOpen size={20} />
          </span>
          <span>
            <strong>사용법</strong>
            <small>OMYS를 즐기는 방법을 확인해 보세요</small>
          </span>
          <ChevronDown className="usage-guide__chevron" size={20} />
        </summary>
        <div className="usage-guide__content">
          <p>
            <strong>OMYS(오늘의 미스터리 스팟)</strong>는 친구나 연인과의 외출 장소를 랜덤으로 정해
            주는 서비스입니다.
          </p>

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
              <li>조건을 설정하고 미스터리 스팟을 누르세요
                <ul>
                  <li>응답이 늦어지면 검색 조건을 조금 더 완화하세요</li>
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
      </details>
      <p className="landing-foot">회원가입 없이 · 링크 하나로 · 바로 출발</p>
      {joinOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setJoinOpen(false)
          }}
        >
          <section
            className="room-code-modal"
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
            <p>친구에게 받은 코드를 입력해 주세요.</p>
            <form onSubmit={joinRoom}>
              <label htmlFor="landing-room-code">방 코드</label>
              <input
                id="landing-room-code"
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
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
                className="button button--primary"
                type="submit"
                disabled={roomCode.length !== 6}
              >
                입장하기
              </button>
            </form>
          </section>
        </div>
      )}
    </Shell>
  )
}
