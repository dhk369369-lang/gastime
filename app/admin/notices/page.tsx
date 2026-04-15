'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Notice {
  id: string
  title: string
  content: string
  created_at: string
  author: { name: string } | null
}

export default function AdminNoticesPage() {
  const [user, setUser] = useState<any>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    if (!parsed.is_admin) { router.push('/schedule'); return }
    setUser(parsed)
    fetchNotices()
  }, [])

  const fetchNotices = async () => {
    const { data } = await supabase
      .from('notices')
      .select('id, title, content, created_at, author:author_id(name)')
      .order('created_at', { ascending: false })
    setNotices((data as any) || [])
    setLoading(false)
  }

  const handleSend = async () => {
    if (!title || !content) return alert('제목과 내용을 입력해주세요.')
    setSending(true)
    const { error } = await supabase
      .from('notices')
      .insert({ title, content, author_id: user.id })
    if (error) alert('발송 실패: ' + error.message)
    else {
      setTitle('')
      setContent('')
      fetchNotices()
    }
    setSending(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 공지를 삭제할까요?')) return
    const { error } = await supabase.from('notices').delete().eq('id', id)
    if (error) alert('삭제 실패: ' + error.message)
    else fetchNotices()
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <button onClick={() => router.push('/admin')} className="text-blue-500 text-sm mr-4">← 뒤로</button>
          <h1 className="text-xl font-bold text-gray-800">📢 공지 관리</h1>
        </div>

        {/* 공지 작성 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="font-medium text-gray-700 mb-3">공지 발송</h2>
          <div className="space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? '발송 중...' : '발송'}
            </button>
          </div>
        </div>

        {/* 공지 목록 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="font-medium text-gray-700 p-4 border-b">공지 이력</h2>
          {loading ? (
            <p className="text-center text-gray-400 p-4">불러오는 중...</p>
          ) : notices.length === 0 ? (
            <p className="text-center text-gray-400 p-4">발송된 공지가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notices.map((n) => (
                <li key={n.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{n.title}</div>
                      <div className="text-sm text-gray-500 mt-1">{n.content}</div>
                      <div className="text-xs text-gray-400 mt-1">{formatDate(n.created_at)} · {(n.author as any)?.name}</div>
                    </div>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="text-red-400 hover:text-red-600 text-sm ml-4"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}