'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { use } from 'react'

interface Instructor {
  id: string
  name: string
}

interface Lesson {
  id: string
  date: string
  period: number
  subject: string
  subject_type: string
  classroom: string
  course_name: string
  row_order: number
  instructor1: Instructor | null
  instructor2: Instructor | null
}

interface CourseRow {
  classroom: string
  course_name: string
  row_order: number
}

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const PERIOD_LABELS: Record<number, string> = {
  1: '1교시', 2: '2교시', 3: '3교시',
  4: '4-1교시', 5: '4-2교시',
  6: '5교시', 7: '6교시', 8: '7교시', 9: '8교시'
}

const TYPE_COLORS: Record<string, string> = {
  star: 'bg-blue-100 text-blue-800',
  theory: 'bg-green-100 text-green-800',
  lunch: 'bg-gray-100 text-gray-500',
  empty: 'bg-white text-gray-200',
}

export default function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [user, setUser] = useState<any>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [courseRows, setCourseRows] = useState<CourseRow[]>([])
  const [weekLabel, setWeekLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all')
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [requestType, setRequestType] = useState<'exchange' | 'substitute'>('substitute')
  const [targetInstructorId, setTargetInstructorId] = useState('')
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [sending, setSending] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    setUser(parsed)
    fetchData()
    fetchInstructors()
  }, [])

  const fetchData = async () => {
    const { data: schedule } = await supabase
      .from('schedules').select('*').eq('id', id).single()
    if (schedule) setWeekLabel(schedule.week_label)

    const { data: lessonData } = await supabase
      .from('lessons')
      .select(`id, date, period, subject, subject_type, classroom, course_name, row_order,
        instructor1:instructor1_id(id, name),
        instructor2:instructor2_id(id, name)`)
      .eq('schedule_id', id)
      .order('row_order')
      .order('date')
      .order('period')

    if (lessonData) {
      setLessons(lessonData as any)
      const uniqueDates = [...new Set(lessonData.map((l: any) => l.date))].sort()
      setDates(uniqueDates)
      const seen = new Set<string>()
      const rows: CourseRow[] = []
      lessonData.forEach((l: any) => {
        const key = `${l.classroom}||${l.course_name}`
        if (!seen.has(key) && (l.classroom || l.course_name)) {
          seen.add(key)
          rows.push({ classroom: l.classroom || '', course_name: l.course_name || '', row_order: l.row_order })
        }
      })
      rows.sort((a, b) => a.row_order - b.row_order)
      setCourseRows(rows)
    }
    setLoading(false)
  }

  const fetchInstructors = async () => {
    const { data } = await supabase.from('instructors').select('id, name').order('display_order')
    setInstructors(data || [])
  }

  const getLesson = (classroom: string, course_name: string, date: string, period: number) =>
    lessons.find(l =>
      l.classroom === classroom &&
      l.course_name === course_name &&
      l.date === date &&
      l.period === period
    )

  const isMyLesson = (lesson: Lesson) => {
    if (!user) return false
    return lesson.instructor1?.id === user.id || lesson.instructor2?.id === user.id
  }

  const handleLessonClick = (lesson: Lesson) => {
    if (lesson.subject_type === 'empty' || lesson.subject_type === 'lunch') return
    if (!isMyLesson(lesson)) return
    setSelectedLesson(lesson)
    setShowModal(true)
  }

  const handleSendRequest = async () => {
    if (!targetInstructorId) return alert('대상 강사를 선택해주세요.')
    if (!selectedLesson) return
    setSending(true)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const lessonDate = new Date(selectedLesson.date)
    if (lessonDate <= today) {
      alert('당일 또는 지난 수업은 요청할 수 없습니다.')
      setSending(false)
      return
    }

    const expires = new Date()
    expires.setHours(23, 59, 59, 999)

    const { error } = await supabase.from('requests').insert({
      type: requestType,
      status: 'pending',
      requester_id: user.id,
      target_id: targetInstructorId,
      lesson_id: selectedLesson.id,
      expires_at: expires.toISOString(),
    })

    if (error) alert('요청 실패: ' + error.message)
    else {
      alert('요청이 전송됐어요!')
      setShowModal(false)
      setSelectedLesson(null)
      setTargetInstructorId('')
    }
    setSending(false)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
  }

  if (!user) return null

  // 상단 헤더 높이 (px) - sticky top offset
  const HEADER_HEIGHT = 90

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 - z-40 */}
      <div className="sticky top-0 bg-white shadow-sm z-40 px-4 py-3">
        <div className="flex justify-between items-center">
          <button onClick={() => router.push('/schedule')} className="text-blue-500 text-sm">← 뒤로</button>
          <h1 className="text-lg font-bold text-blue-600">⏱ {weekLabel}</h1>
          <div className="flex gap-3">
            <button onClick={() => router.push('/requests')} className="text-sm text-gray-500">요청목록</button>
            <button onClick={() => { localStorage.removeItem('user'); router.push('/') }} className="text-sm text-gray-400">로그아웃</button>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setViewMode('all')} className={`px-3 py-1 rounded-lg text-xs font-medium ${viewMode === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>전체</button>
          <button onClick={() => setViewMode('mine')} className={`px-3 py-1 rounded-lg text-xs font-medium ${viewMode === 'mine' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>내 수업</button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 mt-8">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto p-2">
          <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
            <thead>
              {/* 날짜 행: 상단 헤더 바로 아래 고정 */}
              <tr>
                <th
                  className="border border-gray-300 bg-gray-100 p-1 text-center sticky left-0 z-30"
                  style={{ width: '30px', minWidth: '30px', top: `${HEADER_HEIGHT}px` }}
                  rowSpan={2}
                >강의실</th>
                <th
                  className="border border-gray-300 bg-gray-100 p-1 text-center sticky left-8 z-30"
                  style={{ width: '108px', minWidth: '108px', maxWidth: '108px', top: `${HEADER_HEIGHT}px` }}
                  rowSpan={2}
                >과정</th>
                {dates.map(d => (
                  <th
                    key={d}
                    className="border border-gray-300 bg-gray-200 p-2 text-center font-bold sticky z-20"
                    style={{ top: `${HEADER_HEIGHT}px` }}
                    colSpan={PERIODS.length}
                  >
                    {formatDate(d)}
                  </th>
                ))}
              </tr>
              {/* 교시 행: 날짜 행 높이(약 33px) 만큼 더 아래 고정 */}
              <tr>
                {dates.map(d =>
                  PERIODS.map(p => (
                    <th
                      key={`${d}-${p}`}
                      className="border border-gray-200 bg-gray-50 p-1 text-center text-gray-500 whitespace-nowrap font-normal sticky z-20"
                      style={{ top: `${HEADER_HEIGHT + 33}px` }}
                    >
                      {PERIOD_LABELS[p]}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {courseRows.map((course, idx) => {
                const hasMyLesson = dates.some(d =>
                  PERIODS.some(p => {
                    const l = getLesson(course.classroom, course.course_name, d, p)
                    return l && isMyLesson(l)
                  })
                )
                if (viewMode === 'mine' && !hasMyLesson) return null

                return (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border border-gray-200 bg-gray-50 p-1 text-center font-bold sticky left-0 z-10" style={{width: '30px', minWidth: '30px'}}>
                      {course.classroom}
                    </td>
                    <td className="border border-gray-200 bg-gray-50 p-1 text-center sticky left-8 z-10" style={{width: '108px', minWidth: '108px', maxWidth: '108px', wordBreak: 'keep-all'}}>
                      {course.course_name}
                    </td>
                    {dates.map(d =>
                      PERIODS.map(p => {
                        const lesson = getLesson(course.classroom, course.course_name, d, p)
                        const mine = lesson ? isMyLesson(lesson) : false
                        return (
                          <td key={`${d}-${p}`} className="border border-gray-100 p-1 min-w-16">
                            {lesson ? (
                              <div
                                onClick={() => handleLessonClick(lesson)}
                                className={`rounded p-1 text-center ${TYPE_COLORS[lesson.subject_type]} ${mine ? 'ring-2 ring-red-500 cursor-pointer' : ''}`}
                              >
                                <div className="font-medium leading-tight">{lesson.subject}</div>
                                {lesson.instructor1?.name && (
                                  <div className="text-gray-500 leading-tight mt-0.5">{lesson.instructor1.name}</div>
                                )}
                                {lesson.instructor2?.name && (
                                  <div className="text-gray-500 leading-tight">{lesson.instructor2.name}</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center text-gray-200">-</div>
                            )}
                          </td>
                        )
                      })
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && selectedLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-800 mb-1">요청 보내기</h2>
            <p className="text-sm text-gray-500 mb-4">
              {formatDate(selectedLesson.date)} {PERIOD_LABELS[selectedLesson.period]} · {selectedLesson.subject}
            </p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setRequestType('substitute')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${requestType === 'substitute' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>🙋 대리강의</button>
              <button onClick={() => setRequestType('exchange')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${requestType === 'exchange' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>🔄 교환</button>
            </div>
            <select value={targetInstructorId} onChange={(e) => setTargetInstructorId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
              <option value="">강사 선택</option>
              {instructors.filter(i => i.id !== user.id).map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => { setShowModal(false); setTargetInstructorId('') }} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-3 text-sm">취소</button>
              <button onClick={handleSendRequest} disabled={sending} className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm disabled:opacity-50">{sending ? '전송 중...' : '요청 보내기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
