'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { use } from 'react'

interface Instructor { id: string; name: string }
interface Lesson {
  id: string; date: string; period: number; subject: string
  subject_type: string; classroom: string; course_name: string
  row_order: number
  instructor1: Instructor | null; instructor2: Instructor | null
}
interface CourseRow { classroom: string; course_name: string; row_order: number }

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

// 셀 크기 상수
const COL_CLASSROOM = 36  // 강의실 열 너비
const COL_COURSE = 108    // 과정 열 너비
const COL_PERIOD = 72     // 교시 열 너비
const ROW_DATE = 28       // 날짜 행 높이
const ROW_PERIOD = 28     // 교시 행 높이
const ROW_LESSON = 56     // 수업 행 높이

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

  // 스크롤 동기화용 ref
  const scrollRef = useRef<HTMLDivElement>(null)
  const topHeaderRef = useRef<HTMLDivElement>(null)   // 날짜+교시 고정 헤더
  const leftHeaderRef = useRef<HTMLDivElement>(null)  // 강의실+과정 고정 열
  const bodyRef = useRef<HTMLDivElement>(null)        // 실제 수업 내용

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    fetchData()
    fetchInstructors()
  }, [])

  // 스크롤 동기화
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollTop } = e.currentTarget
    if (topHeaderRef.current) topHeaderRef.current.scrollLeft = scrollLeft
    if (leftHeaderRef.current) leftHeaderRef.current.scrollTop = scrollTop
  }

  const fetchData = async () => {
    const { data: schedule } = await supabase.from('schedules').select('*').eq('id', id).single()
    if (schedule) setWeekLabel(schedule.week_label)

    const { data: lessonData } = await supabase
      .from('lessons')
      .select(`id, date, period, subject, subject_type, classroom, course_name, row_order,
        instructor1:instructor1_id(id, name), instructor2:instructor2_id(id, name)`)
      .eq('schedule_id', id)
      .order('row_order').order('date').order('period')

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
    lessons.find(l => l.classroom === classroom && l.course_name === course_name && l.date === date && l.period === period)

  const isMyLesson = (lesson: Lesson) =>
    user && (lesson.instructor1?.id === user.id || lesson.instructor2?.id === user.id)

  const handleLessonClick = (lesson: Lesson) => {
    if (lesson.subject_type === 'empty' || lesson.subject_type === 'lunch') return
    if (!isMyLesson(lesson)) return
    setSelectedLesson(lesson); setShowModal(true)
  }

  const handleSendRequest = async () => {
    if (!targetInstructorId) return alert('대상 강사를 선택해주세요.')
    if (!selectedLesson) return
    setSending(true)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const lessonDate = new Date(selectedLesson.date)
    if (lessonDate <= today) { alert('당일 또는 지난 수업은 요청할 수 없습니다.'); setSending(false); return }
    const expires = new Date(); expires.setHours(23, 59, 59, 999)
    const { error } = await supabase.from('requests').insert({
      type: requestType, status: 'pending', requester_id: user.id,
      target_id: targetInstructorId, lesson_id: selectedLesson.id, expires_at: expires.toISOString(),
    })
    if (error) alert('요청 실패: ' + error.message)
    else { alert('요청이 전송됐어요!'); setShowModal(false); setSelectedLesson(null); setTargetInstructorId('') }
    setSending(false)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
  }

  // 보이는 과정 행 필터
  const visibleRows = courseRows.filter(course => {
    if (viewMode === 'all') return true
    return dates.some(d => PERIODS.some(p => {
      const l = getLesson(course.classroom, course.course_name, d, p)
      return l && isMyLesson(l)
    }))
  })

  const totalCols = dates.length * PERIODS.length
  const contentWidth = totalCols * COL_PERIOD
  const contentHeight = visibleRows.length * ROW_LESSON
  const fixedColWidth = COL_CLASSROOM + COL_COURSE

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 상단 앱 헤더 */}
      <div className="sticky top-0 bg-white shadow-sm z-50 px-4 py-3 flex-shrink-0">
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

      {loading ? <p className="text-center text-gray-400 mt-8">불러오는 중...</p> : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 그리드 레이아웃 */}
          <div className="flex flex-1 overflow-hidden">

            {/* 왼쪽 고정 열 (강의실 + 과정) */}
            <div className="flex-shrink-0 flex flex-col" style={{width: fixedColWidth}}>
              {/* 빈 코너 (날짜+교시 높이만큼) */}
              <div style={{height: ROW_DATE + ROW_PERIOD, flexShrink: 0}}
                className="bg-gray-100 border-b border-r border-gray-300 flex items-end">
                <div style={{width: COL_CLASSROOM}} className="text-center text-xs font-bold p-1 border-r border-gray-300">강의실</div>
                <div style={{width: COL_COURSE}} className="text-center text-xs font-bold p-1">과정</div>
              </div>
              {/* 강의실+과정 목록 (세로 스크롤 동기화) */}
              <div ref={leftHeaderRef} className="overflow-hidden flex-1" style={{overflowY: 'hidden'}}>
                {visibleRows.map((course, idx) => (
                  <div key={idx} className="flex border-b border-gray-200" style={{height: ROW_LESSON}}>
                    <div style={{width: COL_CLASSROOM}} className="flex items-center justify-center text-xs font-bold bg-gray-50 border-r border-gray-200 p-1 text-center">
                      {course.classroom}
                    </div>
                    <div style={{width: COL_COURSE}} className="flex items-center justify-center text-xs bg-gray-50 p-1 text-center leading-tight" style={{wordBreak: 'keep-all'}}>
                      {course.course_name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 오른쪽 스크롤 영역 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 상단 고정 헤더 (날짜 + 교시) */}
              <div ref={topHeaderRef} className="overflow-hidden flex-shrink-0" style={{overflowX: 'hidden'}}>
                {/* 날짜 행 */}
                <div className="flex border-b border-gray-300" style={{height: ROW_DATE, width: contentWidth}}>
                  {dates.map(d => (
                    <div key={d} className="flex-shrink-0 flex items-center justify-center text-xs font-bold bg-gray-200 border-r border-gray-300"
                      style={{width: COL_PERIOD * PERIODS.length}}>
                      {formatDate(d)}
                    </div>
                  ))}
                </div>
                {/* 교시 행 */}
                <div className="flex border-b border-gray-300" style={{height: ROW_PERIOD, width: contentWidth}}>
                  {dates.map(d => PERIODS.map(p => (
                    <div key={`${d}-${p}`} className="flex-shrink-0 flex items-center justify-center text-xs text-gray-500 bg-gray-50 border-r border-gray-200"
                      style={{width: COL_PERIOD}}>
                      {PERIOD_LABELS[p]}
                    </div>
                  )))}
                </div>
              </div>

              {/* 수업 내용 (가로+세로 스크롤) */}
              <div className="flex-1 overflow-auto" onScroll={handleScroll}>
                <div style={{width: contentWidth, height: contentHeight}}>
                  {visibleRows.map((course, idx) => (
                    <div key={idx} className="flex border-b border-gray-200" style={{height: ROW_LESSON}}>
                      {dates.map(d => PERIODS.map(p => {
                        const lesson = getLesson(course.classroom, course.course_name, d, p)
                        const mine = lesson ? isMyLesson(lesson) : false
                        return (
                          <div key={`${d}-${p}`} className="flex-shrink-0 p-0.5 border-r border-gray-100" style={{width: COL_PERIOD}}>
                            {lesson ? (
                              <div onClick={() => handleLessonClick(lesson)}
                                className={`h-full rounded p-0.5 text-center text-xs ${TYPE_COLORS[lesson.subject_type]} ${mine ? 'ring-2 ring-red-500 cursor-pointer' : ''}`}>
                                <div className="font-medium leading-tight">{lesson.subject}</div>
                                {lesson.instructor1?.name && <div className="text-gray-500 leading-tight">{lesson.instructor1.name}</div>}
                                {lesson.instructor2?.name && <div className="text-gray-500 leading-tight">{lesson.instructor2.name}</div>}
                              </div>
                            ) : <div className="h-full flex items-center justify-center text-gray-200 text-xs">-</div>}
                          </div>
                        )
                      }))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
              {instructors.filter(i => i.id !== user.id).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
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
