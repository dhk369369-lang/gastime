'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Instructor {
  id: string
  name: string
  employee_id: string
  is_admin: boolean
  display_order: number
}

export default function InstructorsPage() {
  const [user, setUser] = useState<any>(null)
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adding, setAdding] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    if (!parsed.is_admin) { router.push('/schedule'); return }
    setUser(parsed)
    fetchInstructors()
  }, [])

  const fetchInstructors = async () => {
    const { data } = await supabase
      .from('instructors')
      .select('*')
      .order('display_order', { ascending: true })
    setInstructors(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!name || !employeeId) return alert('이름과 사번을 입력해주세요.')
    setAdding(true)
    const { error } = await supabase
      .from('instructors')
      .insert({ name, employee_id: employeeId, is_admin: isAdmin, display_order: instructors.length + 1 })
    if (error) {
      alert('추가 실패: ' + error.message)
    } else {
      setName('')
      setEmployeeId('')
      setIsAdmin(false)
      fetchInstructors()
    }
    setAdding(false)
  }

  const handleDelete = async (id: string, instructorName: string) => {
    if (!confirm(`${instructorName} 강사를 삭제할까요?`)) return
    const { error } = await supabase.from('instructors').delete().eq('id', id)
    if (error) alert('삭제 실패: ' + error.message)
    else fetchInstructors()
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <button onClick={() => router.push('/admin')} className="text-blue-500 text-sm mr-4">← 뒤로</button>
          <h1 className="text-xl font-bold text-gray-800">👥 강사 관리</h1>
        </div>

        {/* 강사 추가 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="font-medium text-gray-700 mb-3">강사 추가</h2>
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="사번"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
              관리자 권한
            </label>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>

        {/* 강사 목록 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="font-medium text-gray-700 p-4 border-b">강사 목록 ({instructors.length}명)</h2>
          {loading ? (
            <p className="text-center text-gray-400 p-4">불러오는 중...</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {instructors.map((inst) => (
                <li key={inst.id} className="flex justify-between items-center p-4">
                  <div>
                    <span className="font-medium text-gray-800">{inst.name}</span>
                    {inst.is_admin && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">관리자</span>}
                    <div className="text-xs text-gray-400">사번: {inst.employee_id}</div>
                  </div>
                  <button
                    onClick={() => handleDelete(inst.id, inst.name)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}