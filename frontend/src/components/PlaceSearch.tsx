import { useState } from 'react'
import { Check, MapPin, Search, Store } from 'lucide-react'
import { api, formatDistance, type Place } from '../lib/api'
import { searchKakaoPlaces } from '../lib/kakao'
import { Button, Notice } from './UI'

const CATEGORY_ACTIVITIES = {
  '게임·실내 놀거리': [
    '방탈출',
    '보드게임카페',
    'PC방',
    '오락실',
    '만화카페',
    'VR 체험장',
    '스크린야구',
    '스크린골프',
    '실내 양궁',
    '실내 사격',
    '포켓볼',
    '다트',
    '코인노래방',
    '일반 노래방',
    '홀덤펍',
    '실내 낚시카페',
    '레이저태그',
    '실내 서바이벌',
    '퍼즐카페',
    '추리게임카페',
  ],
  '운동·액티비티': [
    '볼링',
    '실내 클라이밍',
    '롤러스케이트',
    '아이스스케이트',
    '배드민턴',
    '탁구',
    '테니스',
    '풋살',
    '농구',
    '수영',
    '러닝',
    '자전거 타기',
    '등산',
    '트램펄린',
    '카트 체험',
    '승마',
    '짚라인',
    '카약',
    '서핑',
    '패러글라이딩',
  ],
  '관광·산책': [
    '한강공원',
    '일반 공원',
    '호수공원',
    '수목원',
    '식물원',
    '둘레길',
    '하천 산책로',
    '해변',
    '전망대',
    '야경 명소',
    '궁궐',
    '한옥마을',
    '성곽길',
    '역사 유적지',
    '전통시장',
    '벽화마을',
    '특색 있는 거리',
    '캠퍼스 산책',
    '드라이브 코스',
    '유람선·한강 크루즈',
  ],
  '쇼핑·구경': [
    '대형 쇼핑몰',
    '백화점',
    '아울렛',
    '복합문화공간',
    '소품숍',
    '편집숍',
    '빈티지숍',
    '독립서점',
    '대형 서점',
    '레코드숍',
    '캐릭터숍',
    '팝업스토어',
    '플리마켓',
    '전통시장',
    '지하상가',
    '가구·인테리어숍',
    '식물가게',
    '문구점',
    '전자제품 매장',
    '대형마트 구경',
  ],
  '데이트코스·이색 체험': [
    '도자기 만들기',
    '향수 만들기',
    '반지 만들기',
    '가죽공예',
    '터프팅',
    '베이킹 클래스',
    '쿠킹 클래스',
    '드로잉 클래스',
    '플라워 클래스',
    '캔들 만들기',
    '퍼스널 컬러 진단',
    '셀프 사진관',
    '교복 대여 체험',
    '한복 대여 체험',
    '찜질방',
    '아쿠아리움',
    '동물카페',
    '천문대·별 관측',
    '놀이공원',
  ],
} as const

type Category = keyof typeof CATEGORY_ACTIVITIES

export function PlaceSearch({
  code,
  token,
  submitted,
  departureLocation,
  departureLatitude,
  departureLongitude,
  onSubmitted,
}: {
  code: string
  token: string
  submitted: Place[]
  departureLocation: string
  departureLatitude: number
  departureLongitude: number
  onSubmitted: () => void
}) {
  const [customActivity, setCustomActivity] = useState('')
  const [category, setCategory] = useState<Category>('게임·실내 놀거리')
  const [activity, setActivity] = useState('')
  const [searchedActivity, setSearchedActivity] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState('')

  const search = async (searchQuery: string, chosenCategory = category) => {
    setLoading(true)
    setError('')
    try {
      const kakaoPlaces = await searchKakaoPlaces(
        searchQuery,
        departureLatitude,
        departureLongitude,
      )
      if (kakaoPlaces) {
        setResults(kakaoPlaces)
        return
      }
      const data = await api<{ places: Place[] }>(
        `/api/rooms/${code}/places/search?q=${encodeURIComponent(searchQuery)}&category=${encodeURIComponent(chosenCategory)}`,
        {},
        token,
      )
      setResults(data.places)
    } catch (err) {
      setError(err instanceof Error ? err.message : '장소를 찾지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  const chooseCategory = (chosenCategory: Category) => {
    setCategory(chosenCategory)
    setActivity('')
    setCustomActivity('')
    setSearchedActivity('')
    setResults([])
    setError('')
  }

  const chooseActivity = (chosenActivity: string) => {
    setActivity(chosenActivity)
    setCustomActivity('')
    setSearchedActivity('')
    setResults([])
    setError('')
  }

  const add = async (place: Place) => {
    setAdding(place.external_place_id)
    setError('')
    try {
      await api(
        `/api/rooms/${code}/candidates`,
        { method: 'POST', body: JSON.stringify({ place }) },
        token,
      )
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : '장소를 담지 못했어요.')
    } finally {
      setAdding('')
    }
  }

  return (
    <section className="stack">
      <div className="place-search-origin">
        <span>
          <MapPin size={18} /> 출발 위치
        </span>
        <strong>{departureLocation}</strong>
        <small>아래 장소는 이 위치에서 가까운 순서로 찾아요.</small>
      </div>
      <div>
        <h2 className="section-title">하고 싶은 종목 고르기</h2>
        <p className="section-copy">추천 종목을 고르거나, 하고 싶은 종목을 직접 적어주세요.</p>
      </div>

      <div className="chips" role="list" aria-label="장소 카테고리">
        {(Object.keys(CATEGORY_ACTIVITIES) as Category[]).map((item) => (
          <button
            type="button"
            key={item}
            className={item === category ? 'chip chip--active' : 'chip'}
            onClick={() => chooseCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="activity-picker">
        <strong>{category}</strong>
        <div className="activity-grid" role="list" aria-label={`${category} 종목`}>
          {CATEGORY_ACTIVITIES[category].map((item) => (
            <button
              type="button"
              key={item}
              className={
                item === activity ? 'activity-chip activity-chip--active' : 'activity-chip'
              }
              onClick={() => chooseActivity(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="search-divider">
        <span>또는 종목 직접 입력</span>
      </div>
      <form
        className="activity-search-form"
        onSubmit={(event) => {
          event.preventDefault()
          const chosenActivity = customActivity.trim() || activity
          if (!chosenActivity) return
          setSearchedActivity(chosenActivity)
          void search(chosenActivity)
        }}
      >
        <div className="search-box">
          <Search size={19} />
          <input
            value={customActivity}
            onChange={(event) => {
              setCustomActivity(event.target.value)
              setActivity('')
              setSearchedActivity('')
              setResults([])
              setError('')
            }}
            placeholder="예: 찜질방, 스크린골프"
            aria-label="하고 싶은 종목 직접 입력"
            maxLength={80}
          />
        </div>
        <Button type="submit" loading={loading} disabled={!activity && !customActivity.trim()}>
          <Search size={18} /> 주변 장소 확인
        </Button>
      </form>

      {error && <Notice tone="warning">{error}</Notice>}

      {(searchedActivity || results.length > 0 || loading) && (
        <div className="place-results-heading">
          <strong>{searchedActivity} 주변 장소</strong>
          <span>{departureLocation}에서 가까운 순</span>
        </div>
      )}
      <div className="place-list">
        {loading
          ? [1, 2, 3].map((item) => <div className="place-card place-card--loading" key={item} />)
          : results.map((place) => {
              const exists = submitted.some(
                (item) => item.external_place_id === place.external_place_id,
              )
              return (
                <article className="place-card" key={place.external_place_id}>
                  <span className="place-card__icon">
                    <MapPin />
                  </span>
                  <div className="place-card__body">
                    <h3>{place.name}</h3>
                    <p>
                      {place.category} · {formatDistance(place.distance_meters)}
                    </p>
                    <span
                      className={
                        place.open_now || place.is_public_outdoor ? 'status status--open' : 'status'
                      }
                    >
                      <Store size={13} />
                      {place.open_now || place.is_public_outdoor
                        ? '영업 확인'
                        : '영업 정보 확인 필요'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant={exists ? 'ghost' : 'secondary'}
                    disabled={exists}
                    loading={adding === place.external_place_id}
                    onClick={() => add(place)}
                  >
                    {exists ? <Check size={18} /> : '담기'}
                  </Button>
                </article>
              )
            })}
      </div>
    </section>
  )
}
