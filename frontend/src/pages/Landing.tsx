import { LockKeyhole, Map, PartyPopper, Sparkles, Users, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo, Shell } from '../components/UI'
import { track } from '../lib/api'
import { useEffect } from 'react'

export default function Landing() {
  useEffect(() => {
    track('landing_view')
  }, [])
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
      <section className="features">
        <article>
          <span>
            <Users />
          </span>
          <h3>친구들의 비밀 후보</h3>
          <p>누가 무엇을 냈는지는 추첨 전까지 아무도 몰라요.</p>
        </article>
        <article>
          <span>
            <LockKeyhole />
          </span>
          <h3>새로고침해도 잠금</h3>
          <p>선정 결과는 서버에 단단히 봉인해 그대로 유지해요.</p>
        </article>
        <article>
          <span>
            <PartyPopper />
          </span>
          <h3>도착 순간 공개</h3>
          <p>100m 안에 들어오면 오늘의 스팟을 함께 열어요.</p>
        </article>
      </section>
      <p className="landing-foot">회원가입 없이 · 링크 하나로 · 바로 출발</p>
    </Shell>
  )
}
