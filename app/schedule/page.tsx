'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Schedule {
  id: string
  week_label: string
  week_start: string
  week_number: number
  is_uploaded: boolean
}

export default function SchedulePage() {
  const [user, setUser] = useState<any>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) {
      router.push('/')
      return
    }
    setUser(JSON.parse(stored))
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .order('week_start', { ascending: true })
    setSchedules(data || [])
    setLoading(false)
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600">⏱ 가스타임</h1>
          <button
            onClick={() => { localStorage.removeItem('user'); router.push('/') }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            로그아웃
          </button>
        </div>

        <p className="text-gray-700 mb-6">👋 {user.name}님, 주차를 선택해주세요</p>

        {loading ? (
          <p className="text-gray-400 text-center">불러오는 중...</p>
        ) : schedules.length === 0 ? (
          <p className="text-gray-400 text-center">등록된 시간표가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <button
                key={s.id}
                onClick={() => s.is_uploaded && router.push(`/schedule/${s.id}`)}
                className={`w-full p-4 rounded-xl text-left flex justify-between items-center shadow-sm border ${
                  s.is_uploaded
                    ? 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md transition'
                    : 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60'
                }`}
              >
                <span className="font-medium text-gray-800">{s.week_label}</span>
                {s.is_uploaded ? (
                  <span className="text-blue-500 text-sm">보기 →</span>
                ) : (
                  <span className="text-gray-400 text-sm">🔒 준비 중</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}