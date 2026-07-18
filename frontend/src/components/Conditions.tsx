import { useState } from 'react'
import { Bike, Car, Footprints, Sparkles, TrainFront } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Field, Notice } from './UI'

const categories = [
  '게임·실내 놀거리',
  '운동·액티비티',
  '관광·산책',
  '쇼핑·구경',
  '데이트코스·이색 체험',
]
export function Conditions({
  code,
  token,
  onSelected,
}: {
  code: string
  token: string
  onSelected: () => void
}) {
  const [form, setForm] = useState({
    transport_mode: 'walk',
    max_travel_minutes: 30,
    budget_per_person: 30000,
    party_size: 2,
    preferred_categories: [] as string[],
    indoor_outdoor: 'any',
    excluded: '',
    includes_food: true,
    total_available_minutes: 180,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toggle = (item: string) =>
    setForm((prev) => ({
      ...prev,
      preferred_categories: prev.preferred_categories.includes(item)
        ? prev.preferred_categories.filter((x) => x !== item)
        : [...prev.preferred_categories, item],
    }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api(
        `/api/rooms/${code}/conditions`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            excluded_activities: form.excluded
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
          }),
        },
        token,
      )
      onSelected()
    } catch (err) {
      setError(err instanceof Error ? err.message : '조건에 맞는 장소를 찾지 못했어요.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="condition-heading">
        <span>
          <Sparkles />
        </span>
        <div>
          <h1 className="page-title">오늘의 기분을 알려주세요</h1>
          <p className="page-subtitle">위치와 이동 시간만 정해도 시작할 수 있어요.</p>
        </div>
      </div>
      <Field label="이동 수단">
        <div className="segmented">
          {[
            ['walk', '도보', Footprints],
            ['transit', '대중교통', TrainFront],
            ['car', '자동차', Car],
          ].map(([value, label, Icon]) => {
            const C = Icon as typeof Bike
            return (
              <button
                type="button"
                key={value as string}
                className={form.transport_mode === value ? 'active' : ''}
                onClick={() => setForm({ ...form, transport_mode: value as string })}
              >
                <C size={19} />
                {label as string}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label={`최대 이동 시간 · ${form.max_travel_minutes}분`}>
        <input
          type="range"
          min="10"
          max="90"
          step="5"
          value={form.max_travel_minutes}
          onChange={(e) => setForm({ ...form, max_travel_minutes: Number(e.target.value) })}
        />
        <div className="range-labels">
          <span>10분</span>
          <span>90분</span>
        </div>
      </Field>
      <div className="two-columns">
        <Field label="1인 예산">
          <select
            value={form.budget_per_person}
            onChange={(e) => setForm({ ...form, budget_per_person: Number(e.target.value) })}
          >
            <option value="15000">1.5만원 이하</option>
            <option value="30000">3만원 이하</option>
            <option value="60000">6만원 이하</option>
            <option value="100000">상관없어요</option>
          </select>
        </Field>
        <Field label="참가 인원">
          <input
            type="number"
            min="1"
            max="20"
            value={form.party_size}
            onChange={(e) => setForm({ ...form, party_size: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="오늘 끌리는 것" hint="여러 개 선택할 수 있어요">
        <div className="choice-grid">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={form.preferred_categories.includes(item) ? 'choice active' : 'choice'}
              onClick={() => toggle(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </Field>
      <Field label="공간 선호">
        <div className="segmented segmented--text">
          {[
            ['any', '상관없음'],
            ['indoor', '실내'],
            ['outdoor', '야외'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={form.indoor_outdoor === value ? 'active' : ''}
              onClick={() => setForm({ ...form, indoor_outdoor: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="피하고 싶은 활동" hint="쉼표로 구분해 주세요">
        <input
          value={form.excluded}
          onChange={(e) => setForm({ ...form, excluded: e.target.value })}
          placeholder="예: 매운 음식, 높은 곳"
          maxLength={120}
        />
      </Field>
      {error && <Notice tone="warning">{error}</Notice>}
      <Button type="submit" loading={loading}>
        <Sparkles size={19} /> 비밀 스팟 뽑기
      </Button>
    </form>
  )
}
