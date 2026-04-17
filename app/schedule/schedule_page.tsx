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

interface TodayLesson {
  period: number
  subject: string
  classroom: string
  course_name: string
}

const PERIOD_LABELS: Record<number, string> = {
  1: '1교시', 2: '2교시', 3: '3교시',
  4: '4-1교시', 5: '4-2교시',
  6: '5교시', 7: '6교시', 8: '7교시', 9: '8교시'
}

// 교시별 시작 시간 (알림용)
const PERIOD_TIMES: Record<number, { hour: number; minute: number }> = {
  1: { hour: 9, minute: 20 },
  2: { hour: 10, minute: 20 },
  3: { hour: 11, minute: 20 },
  4: { hour: 12, minute: 10 },
  5: { hour: 13, minute: 10 },
  6: { hour: 14, minute: 10 },
  7: { hour: 15, minute: 10 },
  8: { hour: 16, minute: 10 },
  9: { hour: 17, minute: 10 },
}

export default function SchedulePage() {
  const [user, setUser] = useState<any>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [todayLessons, setTodayLessons] = useState<TodayLesson[]>([])
  const [notificationEnabled, setNotificationEnabled] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    setUser(parsed)
    fetchSchedules()
    fetchTodayLessons(parsed.id)

    // 알림 설정 불러오기
    const notiSetting = localStorage.getItem('notification_enabled')
    setNotificationEnabled(notiSetting === 'true')
  }, [])

  const fetchSchedules = async () => {
    const { data } = await supabase.from('schedules').select('*').order('week_start', { ascending: true })
    setSchedules(data || [])
    setLoading(false)
  }

  const fetchTodayLessons = async (userId: string) => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const { data } = await supabase
      .from('lessons')
      .select(`
        period, subject, classroom, course_name,
        instructor1:instructor1_id(id),
        instructor2:instructor2_id(id)
      `)
      .eq('date', todayStr)
      .or(`instructor1_id.eq.${userId},instructor2_id.eq.${userId}`)
      .order('period')

    if (data) {
      setTodayLessons(data.map((l: any) => ({
        period: l.period,
        subject: l.subject,
        classroom: l.classroom,
        course_name: l.course_name,
      })))
    }
  }

  // 알림 권한 요청 및 설정
  const handleNotificationToggle = async () => {
    if (!notificationEnabled) {
      // 알림 켜기
      if (!('Notification' in window)) {
        alert('이 브라우저는 알림을 지원하지 않아요.')
        return
      }
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setNotificationEnabled(true)
        localStorage.setItem('notification_enabled', 'true')
        alert('✅ 수업 5분 전 알림이 설정됐어요!')
        scheduleNotifications()
      } else {
        alert('알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.')
      }
    } else {
      // 알림 끄기
      setNotificationEnabled(false)
      localStorage.setItem('notification_enabled', 'false')
      alert('🔕 알림이 꺼졌어요.')
    }
  }

  // 오늘 수업 알림 예약
  const scheduleNotifications = () => {
    const now = new Date()
    todayLessons.forEach(lesson => {
      const periodTime = PERIOD_TIMES[lesson.period]
      if (!periodTime) return

      const lessonTime = new Date()
      lessonTime.setHours(periodTime.hour, periodTime.minute - 5, 0, 0) // 5분 전

      const delay = lessonTime.getTime() - now.getTime()
      if (delay > 0) {
        setTimeout(() => {
          new Notification('⏱ 가스타임 수업 알림', {
            body: `${PERIOD_LABELS[lesson.period]} ${lesson.subject} (강의실 ${lesson.classroom}) 5분 후 시작`,
            icon: '/icon-192.png',
          })
        }, delay)
      }
    })
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-600">⏱ 가스타임</h1>
          <div className="flex items-center gap-3">
            {/* 알림 설정 버튼 */}
            <button
              onClick={handleNotificationToggle}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
                notificationEnabled
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {notificationEnabled ? '🔔 알림 ON' : '🔕 알림 OFF'}
            </button>
            <button
              onClick={() => { localStorage.removeItem('user'); router.push('/') }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              로그아웃
            </button>
          </div>
        </div>

        <p className="text-gray-700 mb-4">👋 {user.name}님, 주차를 선택해주세요</p>

        {/* 주차 목록 */}
        {loading ? (
          <p className="text-gray-400 text-center">불러오는 중...</p>
        ) : schedules.length === 0 ? (
          <p className="text-gray-400 text-center">등록된 시간표가 없습니다.</p>
        ) : (
          <div className="space-y-3 mb-6">
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
                {s.is_uploaded
                  ? <span className="text-blue-500 text-sm">보기 →</span>
                  : <span className="text-gray-400 text-sm">🔒 준비 중</span>
                }
              </button>
            ))}
          </div>
        )}

        {/* 오늘의 강의 */}
        {todayLessons.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <h2 className="font-bold text-gray-800 mb-3">📚 오늘의 강의</h2>
            <div className="space-y-2">
              {todayLessons.map((lesson, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium whitespace-nowrap">
                    {PERIOD_LABELS[lesson.period]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{lesson.subject}</div>
                    <div className="text-xs text-gray-500">강의실 {lesson.classroom} · {lesson.course_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {todayLessons.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <h2 className="font-bold text-gray-800 mb-2">📚 오늘의 강의</h2>
            <p className="text-sm text-gray-400 text-center py-2">오늘 수업이 없습니다.</p>
          </div>
        )}

        {/* 관리자 메뉴 */}
        {user.is_admin && (
          <button
            onClick={() => router.push('/admin')}
            className="w-full bg-gray-800 text-white rounded-xl p-4 text-sm font-medium hover:bg-gray-700"
          >
            ⚙️ 관리자 메뉴
          </button>
        )}
      </div>
    </div>
  )
}
