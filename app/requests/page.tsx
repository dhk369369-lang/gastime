'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Request {
  id: string
  type: string
  status: string
  created_at: string
  requester: { name: string } | null
  target: { name: string } | null
  lesson: { date: string; period: number; subject: string } | null
  target_lesson: { date: string; period: number; subject: string } | null
}

export default function RequestsPage() {
  const [user, setUser] = useState<any>(null)
  const [sentRequests, setSentRequests] = useState<Request[]>([])
  const [receivedRequests, setReceivedRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'sent' | 'received'>('sent')
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    setUser(parsed)
    fetchRequests(parsed.id)
  }, [])

  const fetchRequests = async (userId: string) => {
    const { data: sent } = await supabase
      .from('requests')
      .select(`
        id, type, status, created_at,
        requester:requester_id(name),
        target:target_id(name),
        lesson:lesson_id(date, period, subject),
        target_lesson:target_lesson_id(date, period, subject)
      `)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false })

    const { data: received } = await supabase
      .from('requests')
      .select(`
        id, type, status, created_at,
        requester:requester_id(name),
        target:target_id(name),
        lesson:lesson_id(date, period, subject),
        target_lesson:target_lesson_id(date, period, subject)
      `)
      .eq('target_id', userId)
      .order('created_at', { ascending: false })

    setSentRequests((sent as any) || [])
    setReceivedRequests((received as any) || [])
    setLoading(false)
  }

  const handleCancel = async (id: string) => {
    if (!confirm('요청을 취소할까요?')) return
    const { error } = await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) alert('취소 실패: ' + error.message)
    else fetchRequests(user.id)
  }

  const handleAccept = async (id: string) => {
    const { error } = await supabase
      .from('requests')
      .update({ status: 'accepted' })
      .eq('id', id)
    if (error) alert('수락 실패: ' + error.message)
    else fetchRequests(user.id)
  }

  const handleReject = async (id: string) => {
    const { error } = await supabase
      .from('requests')
      .update({ status: 'rejected' })
      .eq('id', id)
    if (error) alert('거절 실패: ' + error.message)
    else fetchRequests(user.id)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: '대기 중',
      accepted: '수락됨',
      rejected: '거절됨',
      expired: '만료됨',
      cancelled: '취소됨',
    }
    return map[status] || status
  }

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      accepted: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      expired: 'bg-gray-100 text-gray-500',
      cancelled: 'bg-gray-100 text-gray-500',
    }
    return map[status] || 'bg-gray-100 text-gray-500'
  }

  const currentRequests = tab === 'sent' ? sentRequests : receivedRequests

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <button onClick={() => router.push('/schedule')} className="text-blue-500 text-sm mr-4">← 뒤로</button>
          <h1 className="text-xl font-bold text-gray-800">🔄 교환/대리강의</h1>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('sent')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'sent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            보낸 요청 ({sentRequests.length})
          </button>
          <button
            onClick={() => setTab('received')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'received' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            받은 요청 ({receivedRequests.length})
          </button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400">불러오는 중...</p>
        ) : currentRequests.length === 0 ? (
          <p className="text-center text-gray-400 mt-8">요청이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {currentRequests.map((r) => (
              <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-gray-800">
                    {r.type === 'exchange' ? '🔄 교환' : '🙋 대리강의'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(r.status)}`}>
                    {statusLabel(r.status)}
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

                {tab === 'sent' && r.status === 'pending' && (
                  <button
                    onClick={() => handleCancel(r.id)}
                    className="w-full bg-gray-100 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-200"
                  >
                    취소
                  </button>
                )}
                {tab === 'received' && r.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(r.id)}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
                    >
                      수락
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