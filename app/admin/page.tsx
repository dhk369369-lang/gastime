'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    if (!parsed.is_admin) { router.push('/schedule'); return }
    setUser(parsed)
  }, [])

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600">⏱ 관리자</h1>
          <button
            onClick={() => { localStorage.removeItem('user'); router.push('/') }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            로그아웃
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push('/admin/schedule')}
            className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-md transition"
          >
            <div className="font-medium text-gray-800">📅 시간표 관리</div>
            <div className="text-sm text-gray-500 mt-1">엑셀 업로드 및 수정</div>
          </button>

          <button
            onClick={() => router.push('/admin/instructors')}
            className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-md transition"
          >
            <div className="font-medium text-gray-800">👥 강사 관리</div>
            <div className="text-sm text-gray-500 mt-1">강사 계정 추가/삭제</div>
          </button>

          <button
            onClick={() => router.push('/admin/requests')}
            className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-md transition"
          >
            <div className="font-medium text-gray-800">🔄 교환/대리강의 승인</div>
            <div className="text-sm text-gray-500 mt-1">요청 승인 및 이력 조회</div>
          </button>

          <button
            onClick={() => router.push('/admin/notices')}
            className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-md transition"
          >
            <div className="font-medium text-gray-800">📢 공지 관리</div>
            <div className="text-sm text-gray-500 mt-1">공지 발송 및 이력 조회</div>
          </button>

          <button
            onClick={() => router.push('/schedule')}
            className="w-full bg-blue-50 border border-blue-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-md transition"
          >
            <div className="font-medium text-blue-700">📋 강사 화면으로</div>
            <div className="text-sm text-blue-500 mt-1">시간표 조회 화면</div>
          </button>
        </div>
      </div>
    </div>
  )
}