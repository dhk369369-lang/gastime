'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Request {
  id: string
  type: string
  status: string
  admin_approved: boolean | null
  created_at: string
  requester: { name: string } | null
  target: { name: string } | null
  lesson: { date: string; period: number; subject: string } | null
  target_lesson: { date: string; period: number; subject: string } | null
}

export default function AdminRequestsPage() {
  const [user, setUser] = useState<any>(null)
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending_admin' | 'all'>('pending_admin')
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    if (!parsed.is_admin) { router.push('/schedule'); return }
    setUser(parsed)
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('requests')
      .select(`
        id, type, status, admin_approved, created_at,
        requester:requester_id(name),
        target:target_id(name),
        lesson:lesson_id(date, period, subject),
        target_lesson:target_lesson_id(date, period, subject)
      `)
      .order('created_at', { ascending: false })
    setRequests((data as any) || [])
    setLoading(false)
  }

  // 관리자 최종 승인: admin_approved: true
  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from('requests')
      .update({ admin_approved: true })
      .eq('id', id)
    if (error) alert('승인 실패: ' + error.message)
    else fetchRequests()
  }

  // 관리자 거절: status: rejected
  const handleReject = async (id: string) => {
    const { error } = await supabase
      .from('requests')
      .update({ status: 'rejected', admin_approved: null })
      .eq('id', id)
    if (error) alert('거절 실패: ' + error.message)
    else fetchRequests()
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const statusLabel = (r: Request) => {
    if (r.status === 'accepted' && r.admin_approved === false) return '관리자 승인 대기'
    if (r.status === 'accepted' && r.admin_approved === true) return '최종 승인됨'
    const map: Record<string, string> = {
      pending: '강사 수락 대기',
      rejected: '거절됨',
      expired: '만료됨',
      cancelled: '취소됨',
    }
    return map[r.status] || r.status
  }

  const statusColor = (r: Request) => {
    if (r.status === 'accepted' && r.admin_approved === false) return 'bg-orange-100 text-orange-700'
    if (r.status === 'accepted' && r.admin_approved === true) return 'bg-green-100 text-green-700'
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      rejected: 'bg-red-100 text-red-700',
      expired: 'bg-gray-100 text-gray-500',
      cancelled: 'bg-gray-100 text-gray-500',
    }
    return map[r.status] || 'bg-gray-100 text-gray-500'
  }

  // 탭 필터링
  const filteredRequests = tab === 'pending_admin'
    ? requests.filter(r => r.status === 'accepted' && r.admin_approved === false)
    : requests

  const pendingCount = requests.filter(r => r.status === 'accepted' && r.admin_approved === false).length

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <button onClick={() => router.push('/admin')} className="text-blue-500 text-sm mr-4">← 뒤로</button>
          <h1 className="text-xl font-bold text-gray-800">🔄 교환/대리강의 승인</h1>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('pending_admin')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'pending_admin' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            승인 대기 ({pendingCount})
          </button>
          <button
            onClick={() => setTab('all')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            전체 내역
          </button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400">불러오는 중...</p>
        ) : filteredRequests.length === 0 ? (
          <p className="text-center text-gray-400 mt-8">
            {tab === 'pending_admin' ? '승인 대기 중인 요청이 없습니다.' : '요청이 없습니다.'}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((r) => (
              <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-gray-800">
                    {r.type === 'exchange' ? '🔄 교환' : '🙋 대리강의'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(r)}`}>
                    {statusLabel(r)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-1">
                  <span className="font-medium">{(r.requester as any)?.name}</span> →{' '}
                  <span className="font-medium">{(r.target as any)?.name}</span>
                </div>
                {r.lesson && (
                  <div className="text-xs text-gray-400 mb-1">
                    요청 교시: {formatDate((r.lesson as any).date)} {(r.lesson as any).period}교시 {(r.lesson as any).subject}
                  </div>
                )}
                {r.target_lesson && (
                  <div className="text-xs text-gray-400 mb-2">
                    교환 교시: {formatDate((r.target_lesson as any).date)} {(r.target_lesson as any).period}교시 {(r.target_lesson as any).subject}
                  </div>
                )}
                <div className="text-xs text-gray-400 mb-3">{formatDate(r.created_at)} 요청</div>

                {/* 관리자 승인 대기 상태만 승인/거절 버튼 표시 */}
                {r.status === 'accepted' && r.admin_approved === false && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(r.id)}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
                    >
                      최종 승인
                    </button>
                    <button
                      onClick={() => handleReject(r.id)}
                      className="flex-1 bg-red-50 text-red-600 border border-red-200 rounded-lg py-2 text-sm font-medium hover:bg-red-100"
                    >
                      거절
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
