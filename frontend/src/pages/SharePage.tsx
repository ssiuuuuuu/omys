import { useEffect, useState } from 'react'
import { LockKeyhole, MapPin, Sparkles, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api, type Place } from '../lib/api'
import { EmptyState, Logo, Shell, Skeleton } from '../components/UI'

type Share = {
  title: string
  mode: string
  status: string
  participant_count: number
  place: Place | null
}
export default function SharePage() {
  const { code = '' } = useParams()
  const [data, setData] = useState<Share | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    void api<Share>(`/api/share/${code}`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [code])
  if (error)
    return (
      <Shell>
        <EmptyState title="공유 결과를 찾지 못했어요" body={error} />
      </Shell>
    )
  if (!data)
    return (
      <Shell>
        <Skeleton />
      </Shell>
    )
  return (
    <Shell>
      <section className="share-page">
        <Logo />
        <span className="eyebrow">
          <Sparkles size={15} /> 오늘의 미스터리 기록
        </span>
        <h1>
          {data.participant_count}명이 함께
          <br />
          OMYS에 도전했어요
        </h1>
        {data.place ? (
          <div className="shared-place">
            <span>
              <MapPin />
            </span>
            <small>공개된 미스터리 스팟</small>
            <h2>{data.place.name}</h2>
            <p>{data.place.address}</p>
          </div>
        ) : (
          <div className="shared-place shared-place--locked">
            <span>
              <LockKeyhole />
            </span>
            <small>아직 이동 중</small>
            <h2>목적지는 비밀입니다</h2>
            <p>우리가 어디로 가는 중인지 맞혀 보세요!</p>
          </div>
        )}
        <div className="share-stats">
          <Users />
          <span>{data.participant_count}명의 모험가</span>
          <i /> <span>{data.mode === 'friends' ? '친구 추천' : 'OMYS 추천'}</span>
        </div>
        <Link to="/" className="button button--primary">
          나도 미스터리 외출 시작하기
        </Link>
      </section>
    </Shell>
  )
}
