import { useEffect, useState } from 'react'
import { DoorOpen, LockKeyhole, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getToken, saveToken, track } from '../lib/api'
import { Button, Field, Notice, Shell } from '../components/UI'

export default function JoinRoom() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (getToken(code)) navigate(`/room/${code}`, { replace: true })
  }, [code, navigate])
  const join = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api<{ participant_token: string }>(`/api/rooms/${code}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname }),
      })
      saveToken(code, result.participant_token)
      track('participant_joined')
      navigate(`/room/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '입장할 수 없어요.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Shell title="초대장 확인">
      <section className="join-hero">
        <span className="invite-envelope">
          <DoorOpen />
        </span>
        <span className="eyebrow">
          <Sparkles size={15} /> 비밀 초대장이 도착했어요
        </span>
        <h1>
          오늘 어디로 갈지는
          <br />
          아직 아무도 몰라요
        </h1>
        <p>
          닉네임만 정하면 바로 참가할 수 있어요.
          <br />
          회원가입은 필요 없습니다.
        </p>
      </section>
      <form className="stack card" onSubmit={join}>
        <div className="code-badge">초대 코드 · {code.toUpperCase()}</div>
        <Field label="내 닉네임">
          <input
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="친구들이 알아볼 이름"
            maxLength={20}
            required
          />
        </Field>
        {error && <Notice tone="warning">{error}</Notice>}
        <Button type="submit" loading={loading}>
          미스터리 방 입장하기
        </Button>
        <small className="privacy-copy">
          <LockKeyhole size={14} /> 닉네임과 제출한 장소 외에는 저장하지 않아요.
        </small>
      </form>
    </Shell>
  )
}
