'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true) // 자동 로그인 체크 중
  const router = useRouter()

  useEffect(() => {
    // 앱 시작 시 저장된 로그인 정보 확인
    const stored = localStorage.getItem('user')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed?.id) {
          router.replace('/schedule')
          return
        }
      } catch {
        localStorage.removeItem('user')
      }
    }
    setChecking(false)
  }, [])

  const handleLogin = async () => {
    if (!name || !employeeId) {
      setError('이름과 사번을 모두 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('instructors')
      .select('*')
      .eq('name', name)
      .eq('employee_id', employeeId)
      .single()

    if (error || !data) {
      setError('이름 또는 사번이 올바르지 않습니다.')
      setLoading(false)
      return
    }

    localStorage.setItem('user', JSON.stringify(data))
    router.push('/schedule')
    setLoading(false)
  }

  // 자동 로그인 체크 중엔 빈 화면
  if (checking) return null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">⏱ 가스타임</h1>
          <p className="text-gray-500 mt-2 text-sm">가스안전교육원 강사 시간표</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="홍길동"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사번</label>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="사번 입력"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  )
}
