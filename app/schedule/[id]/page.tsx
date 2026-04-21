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
// 교시별 시간 표시
const PERIOD_TIMES: Record<number, string> = {
  1: '09:20~10:10',
  2: '10:20~11:10',
  3: '11:20~12:10',
  4: '12:20~13:10',
  5: '13:10~14:00',
  6: '14:10~15:00',
  7: '15:10~16:00',
  8: '16:10~17:00',
  9: '17:10~18:00',
}
const TYPE_COLORS: Record<string, string> = {
  star: 'bg-blue-100 text-blue-800',
  theory: 'bg-green-100 text-green-800',
  lunch: 'bg-gray-100 text-gray-500',
  empty: 'bg-white text-gray-200',
}

const COL_CLASSROOM = 36
const COL_COURSE = 108
const COL_PERIOD = 72
const ROW_DATE = 28
const ROW_PERIOD_LABEL = 22  // 교시명 행 높이
const ROW_PERIOD_TIME = 18   // 시간 행 높이
const ROW_LESSON = 56

// 요일 구분선 스타일
const DAY_BORDER = '3px solid #374151'
const NORMAL_BORDER = '1px solid #e5e7eb'
const CELL_BORDER = '1px solid #f3f4f6'

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
  const [myExchangeLessonId, setMyExchangeLessonId] = useState('')
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [sending, setSending] = useState(false)
  const router = useRouter()

  const topHeaderRef = useRef<HTMLDivElement>(null)
  const leftHeaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    fetchData()
    fetchInstructors()
  }, [])

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
    !!(user && (lesson.instructor1?.id === user.id || lesson.instructor2?.id === user.id))

  const myLessons = lessons.filter(l =>
    isMyLesson(l) &&
    l.subject_type !== 'lunch' &&
    l.subject_type !== 'empty' &&
    l.id !== selectedLesson?.id
  )

  const handleLessonClick = (lesson: Lesson) => {
    if (lesson.subject_type === 'empty' || lesson.subject_type === 'lunch') return
    if (!isMyLesson(lesson)) return
    setSelectedLesson(lesson)
    setRequestType('substitute')
    setTargetInstructorId('')
    setMyExchangeLessonId('')
    setShowModal(true)
  }

  const handleSendRequest = async () => {
    if (!targetInstructorId) return alert('대상 강사를 선택해주세요.')
    if (!selectedLesson) return
    if (requestType === 'exchange' && !myExchangeLessonId) return alert('교환할 내 수업을 선택해주세요.')

    setSending(true)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const lessonDate = new Date(selectedLesson.date)
    if (lessonDate <= today) { alert('당일 또는 지난 수업은 요청할 수 없습니다.'); setSending(false); return }

    if (requestType === 'exchange' && myExchangeLessonId) {
      const myExchangeLesson = lessons.find(l => l.id === myExchangeLessonId)
      if (myExchangeLesson) {
        const exchangeDate = new Date(myExchangeLesson.date)
        if (exchangeDate <= today) { alert('당일 또는 지난 수업은 교환 요청할 수 없습니다.'); setSending(false); return }
      }
    }

    const expires = new Date(); expires.setHours(23, 59, 59, 999)
    const { error } = await supabase.from('requests').insert({
      type: requestType,
      status: 'pending',
      requester_id: user.id,
      target_id: targetInstructorId,
      lesson_id: selectedLesson.id,
      target_lesson_id: requestType === 'exchange' ? myExchangeLessonId : null,
      expires_at: expires.toISOString(),
    })

    if (error) alert('요청 실패: ' + error.message)
    else {
      alert('요청이 전송됐어요!')
      setShowModal(false)
      setSelectedLesson(null)
      setTargetInstructorId('')
      setMyExchangeLessonId('')
    }
    setSending(false)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
  }

  const visibleRows = courseRows.filter(course => {
    if (viewMode === 'all') return true
    return dates.some(d => PERIODS.some(p => {
      const l = getLesson(course.classroom, course.course_name, d, p)
      return l && isMyLesson(l)
    }))
  })

  const contentWidth = dates.length * PERIODS.length * COL_PERIOD
  const fixedColWidth = COL_CLASSROOM + COL_COURSE
  const headerHeight = ROW_DATE + ROW_PERIOD_LABEL + ROW_PERIOD_TIME

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
        <div className="flex overflow-hidden" style={{height: 'calc(100vh - 88px)'}}>

          {/* 왼쪽 고정 열 */}
          <div className="flex-shrink-0 flex flex-col border-r border-gray-300" style={{width: fixedColWidth}}>
            <div className="flex-shrink-0 border-b border-gray-300 bg-gray-100 flex items-end"
              style={{height: headerHeight}}>
              <div className="text-center text-xs font-bold p-1 border-r border-gray-300 text-gray-800" style={{width: COL_CLASSROOM}}>강의실</div>
              <div className="text-center text-xs font-bold p-1 text-gray-800" style={{width: COL_COURSE}}>과정</div>
            </div>
            <div ref={leftHeaderRef} className="flex-1 overflow-hidden">
              {visibleRows.map((course, idx) => (
                <div key={idx} className="flex border-b border-gray-200" style={{height: ROW_LESSON}}>
                  <div className="flex items-center justify-center text-xs font-bold bg-gray-50 border-r border-gray-200 p-1 text-center text-gray-800"
                    style={{width: COL_CLASSROOM}}>
                    {course.classroom}
                  </div>
                  <div className="flex items-center justify-center text-xs bg-gray-50 p-1 text-center leading-tight text-gray-800"
                    style={{width: COL_COURSE, wordBreak: 'keep-all'}}>
                    {course.course_name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽 스크롤 영역 */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* 날짜 + 교시 헤더 */}
            <div ref={topHeaderRef} className="flex-shrink-0 overflow-hidden border-b border-gray-300">

              {/* 날짜 행 */}
              <div className="flex" style={{height: ROW_DATE, width: contentWidth}}>
                {dates.map((d, dIdx) => (
                  <div key={d}
                    className="flex-shrink-0 flex items-center justify-center text-xs font-bold bg-gray-200 text-gray-800"
                    style={{
                      width: COL_PERIOD * PERIODS.length,
                      borderLeft: dIdx === 0 ? 'none' : DAY_BORDER,
                    }}>
                    {formatDate(d)}
                  </div>
                ))}
              </div>

              {/* 교시명 행 */}
              <div className="flex" style={{height: ROW_PERIOD_LABEL, width: contentWidth}}>
                {dates.map((d, dIdx) => PERIODS.map((p, pIdx) => (
                  <div key={`label-${d}-${p}`}
                    className="flex-shrink-0 flex items-center justify-center text-xs font-medium text-gray-700 bg-gray-50"
                    style={{
                      width: COL_PERIOD,
                      borderLeft: (dIdx > 0 && pIdx === 0) ? DAY_BORDER : NORMAL_BORDER,
                      borderBottom: '1px solid #e5e7eb',
                    }}>
                    {PERIOD_LABELS[p]}
                  </div>
                )))}
              </div>

              {/* 시간 행 */}
              <div className="flex" style={{height: ROW_PERIOD_TIME, width: contentWidth}}>
                {dates.map((d, dIdx) => PERIODS.map((p, pIdx) => (
                  <div key={`time-${d}-${p}`}
                    className="flex-shrink-0 flex items-center justify-center bg-gray-50 text-gray-400"
                    style={{
                      width: COL_PERIOD,
                      fontSize: '9px',
                      borderLeft: (dIdx > 0 && pIdx === 0) ? DAY_BORDER : NORMAL_BORDER,
                    }}>
                    {PERIOD_TIMES[p]}
                  </div>
                )))}
              </div>
            </div>

            {/* 셀 본문 */}
            <div className="flex-1 overflow-auto" onScroll={handleScroll}>
              <div style={{width: contentWidth}}>
                {visibleRows.map((course, idx) => (
                  <div key={idx} className="flex border-b border-gray-200" style={{height: ROW_LESSON}}>
                    {dates.map((d, dIdx) => PERIODS.map((p, pIdx) => {
                      const lesson = getLesson(course.classroom, course.course_name, d, p)
                      const mine = lesson ? isMyLesson(lesson) : false
                      return (
                        <div key={`${d}-${p}`}
                          className="flex-shrink-0 p-0.5"
                          style={{
                            width: COL_PERIOD,
                            borderLeft: (dIdx > 0 && pIdx === 0) ? DAY_BORDER : CELL_BORDER,
                          }}>
                          {lesson ? (
                            <div onClick={() => handleLessonClick(lesson)}
                              className={`h-full rounded p-0.5 text-center text-xs ${TYPE_COLORS[lesson.subject_type]} ${mine ? 'ring-2 ring-red-500 cursor-pointer' : ''}`}>
                              <div className="font-medium leading-tight">{lesson.subject}</div>
                              {lesson.instructor1?.name && <div className="text-gray-500 leading-tight">{lesson.instructor1.name}</div>}
                              {lesson.instructor2?.name && <div className="text-gray-500 leading-tight">{lesson.instructor2.name}</div>}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-gray-200 text-xs">-</div>
                          )}
                        </div>
                      )
                    }))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 요청 모달 */}
      {showModal && selectedLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-800 mb-1">요청 보내기</h2>
            <p className="text-sm text-gray-500 mb-4">
              {formatDate(selectedLesson.date)} {PERIOD_LABELS[selectedLesson.period]} · {selectedLesson.subject}
            </p>

            <div className="flex gap-2 mb-4">
              <button onClick={() => { setRequestType('substitute'); setMyExchangeLessonId('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${requestType === 'substitute' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                🙋 대리강의
              </button>
              <button onClick={() => setRequestType('exchange')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${requestType === 'exchange' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                🔄 교환
              </button>
            </div>

            {requestType === 'exchange' && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">내가 내줄 수업 선택</p>
                <select
                  value={myExchangeLessonId}
                  onChange={(e) => setMyExchangeLessonId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">수업 선택</option>
                  {myLessons.map(l => (
                    <option key={l.id} value={l.id}>
                      {formatDate(l.date)} {PERIOD_LABELS[l.period]} · {l.subject}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <select
              value={targetInstructorId}
              onChange={(e) => setTargetInstructorId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">강사 선택</option>
              {instructors.filter(i => i.id !== user.id).map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button onClick={() => { setShowModal(false); setTargetInstructorId(''); setMyExchangeLessonId('') }}
                className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-3 text-sm">취소</button>
              <button onClick={handleSendRequest} disabled={sending}
                className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm disabled:opacity-50">
                {sending ? '전송 중...' : '요청 보내기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
