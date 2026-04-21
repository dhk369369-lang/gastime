'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface Schedule {
  id: string
  week_label: string
  week_start: string
  week_number: number
  is_uploaded: boolean
}

interface Instructor {
  id: string
  name: string
}

// 주간탭: 0-based 열 인덱스 (C=2, L=11, U=20, AD=29, AM=38)
const DAY_START_COLS = [2, 11, 20, 29, 38]

// 검증탭: 0-based 열 인덱스 (B=1부터 9개씩)
const ABS_DAY_START_COLS = [1, 10, 19, 28, 37]

// offset → 교시 번호 (9개 열)
const PERIOD_MAP: Record<number, number> = {
  0: 1, 1: 2, 2: 3,
  3: 4, // 4-1교시
  4: 5, // 4-2교시
  5: 6, 6: 7, 7: 8, 8: 9,
}

export default function AdminSchedulePage() {
  const [user, setUser] = useState<any>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [loading, setLoading] = useState(true)
  const [weekLabel, setWeekLabel] = useState('')
  const [weekStart, setWeekStart] = useState('')
  const [weekNumber, setWeekNumber] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const parsed = JSON.parse(stored)
    if (!parsed.is_admin) { router.push('/schedule'); return }
    setUser(parsed)
    fetchSchedules()
    fetchInstructors()
  }, [])

  const fetchSchedules = async () => {
    const { data } = await supabase.from('schedules').select('*').order('week_start')
    setSchedules(data || [])
    setLoading(false)
  }

  const fetchInstructors = async () => {
    const { data } = await supabase.from('instructors').select('*').order('display_order')
    setInstructors(data || [])
  }

  const handleAdd = async () => {
    if (!weekLabel || !weekStart || !weekNumber) return alert('모두 입력해주세요.')
    const { error } = await supabase.from('schedules').insert({
      week_label: weekLabel, week_start: weekStart,
      week_number: parseInt(weekNumber), is_uploaded: false
    })
    if (error) alert('추가 실패: ' + error.message)
    else { setWeekLabel(''); setWeekStart(''); setWeekNumber(''); fetchSchedules() }
  }

  const handleToggleUpload = async (id: string, current: boolean) => {
    await supabase.from('schedules').update({ is_uploaded: !current }).eq('id', id)
    fetchSchedules()
  }

  const handleDelete = async (id: string, label: string) => {
  if (!confirm(`${label} 주차를 삭제할까요?\n※ 해당 주차의 수업 및 교환/대리 요청도 모두 삭제됩니다.`)) return

  // 해당 주차 lesson id 조회
  const { data: existingLessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('schedule_id', id)

  const lessonIds = (existingLessons ?? []).map((l: any) => l.id)

  // requests 먼저 삭제
  if (lessonIds.length > 0) {
    await supabase.from('requests').delete().in('lesson_id', lessonIds)
    await supabase.from('requests').delete().in('target_lesson_id', lessonIds)
  }

  // lessons 삭제
  await supabase.from('lessons').delete().eq('schedule_id', id)

  // schedules 삭제
  await supabase.from('schedules').delete().eq('id', id)

  fetchSchedules()
}

  const parseDate = (val: any): string => {
    if (!val) return ''
    if (typeof val === 'number') {
      const d = XLSX.SSF.parse_date_code(val)
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
    const str = String(val).trim()
    const m1 = str.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`
    const m2 = str.match(/(\d{4})\.(\d{2})\.(\d{2})/)
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
    return ''
  }

  const getSubjectType = (subject: string): string => {
    if (!subject) return 'empty'
    if (subject.includes('중식') || subject.includes('점심')) return 'lunch'
    if (subject.includes('★') || subject.includes('입교') || subject.includes('수료')) return 'star'
    return 'theory'
  }

  const normalizeName = (raw: string): string =>
    raw.replace(/·/g, '').trim()

  const applyMerges = (ws: XLSX.WorkSheet, raw: any[][]): void => {
    const merges: any[] = ws['!merges'] ?? []
    merges.forEach(({ s, e }) => {
      const cellAddr = XLSX.utils.encode_cell({ r: s.r, c: s.c })
      const cellVal = ws[cellAddr]?.v ?? ''
      for (let r = s.r; r <= e.r; r++) {
        for (let c = s.c; c <= e.c; c++) {
          if (r === s.r && c === s.c) continue
          if (!raw[r]) raw[r] = []
          raw[r][c] = cellVal
        }
      }
    })
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedScheduleId) return alert('주차를 먼저 선택하고 엑셀을 업로드해주세요.')
    setUploading(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      // ── STEP 1: 주간 탭 읽기 + 병합셀 처리 ──
      const sheetName = wb.SheetNames.find(n => n === '주간') ?? wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
      applyMerges(ws, raw)

      // ── STEP 2: 1행에서 요일별 날짜 추출 ──
      const row0 = raw[0] ?? []
      const dayDates: string[] = DAY_START_COLS.map((startCol) => {
        for (let c = startCol + 1; c <= startCol + 8; c++) {
          const d = parseDate(row0[c])
          if (d) return d
        }
        return ''
      })
      console.log('[날짜]', dayDates)

      // ── STEP 3: 검증 탭 파싱 → 부재 맵 ──
      const absentMap: Record<string, Record<string, Set<number>>> = {}

      const absSheet = wb.Sheets['검증']
      if (absSheet) {
        const absRaw = XLSX.utils.sheet_to_json(absSheet, { header: 1, defval: '' }) as any[][]
        applyMerges(absSheet, absRaw)

        const absRow0 = absRaw[0] ?? []
        const absDayDates: string[] = ABS_DAY_START_COLS.map((startCol) => {
          for (let c = startCol + 1; c <= startCol + 8; c++) {
            const d = parseDate(absRow0[c])
            if (d) return d
          }
          return ''
        })
        console.log('[검증탭 날짜]', absDayDates)

        for (let r = 2; r < absRaw.length; r++) {
          const row = absRaw[r]
          const rawName = String(row[0] ?? '').trim()
          if (!rawName) continue
          const instName = normalizeName(rawName)

          for (let dayIdx = 0; dayIdx < ABS_DAY_START_COLS.length; dayIdx++) {
            const startCol = ABS_DAY_START_COLS[dayIdx]
            const date = absDayDates[dayIdx]
            if (!date) continue

            for (let offset = 0; offset < 9; offset++) {
              const col = startCol + offset
              const period = PERIOD_MAP[offset]
              const val = Number(row[col] ?? 0)

              if (val >= 1) {
                if (!absentMap[instName]) absentMap[instName] = {}
                if (!absentMap[instName][date]) absentMap[instName][date] = new Set()
                absentMap[instName][date].add(period)
              }
            }
          }
        }
        console.log('[부재 강사]', Object.keys(absentMap))
      }

      // ── STEP 4: 기존 데이터 삭제 (requests → lessons 순서로 FK 제약 해결) ──

      // 해당 주차의 lesson id 목록 조회
      const { data: existingLessons } = await supabase
        .from('lessons')
        .select('id')
        .eq('schedule_id', selectedScheduleId)

      const lessonIds = (existingLessons ?? []).map((l: any) => l.id)

      // requests 먼저 삭제 (lesson_id, target_lesson_id 둘 다)
      if (lessonIds.length > 0) {
        const { error: deleteReqError1 } = await supabase
          .from('requests')
          .delete()
          .in('lesson_id', lessonIds)
        if (deleteReqError1) throw new Error('요청 데이터 삭제 실패(lesson_id): ' + deleteReqError1.message)

        const { error: deleteReqError2 } = await supabase
          .from('requests')
          .delete()
          .in('target_lesson_id', lessonIds)
        if (deleteReqError2) throw new Error('요청 데이터 삭제 실패(target_lesson_id): ' + deleteReqError2.message)
      }

      // lessons 삭제
      const { error: deleteError } = await supabase
        .from('lessons')
        .delete()
        .eq('schedule_id', selectedScheduleId)
      if (deleteError) throw new Error('기존 데이터 삭제 실패: ' + deleteError.message)

      // ── STEP 5: 수업 데이터 파싱 ──
      const lessonsToInsert: any[] = []

      for (let r = 3; r < raw.length; r += 2) {
        const subjectRow = raw[r] ?? []
        const instructorRow = raw[r + 1] ?? []

        const classroom = String(subjectRow[0] ?? '').trim()
        const courseName = String(subjectRow[1] ?? '').trim()

        if (!classroom && !courseName) continue

        for (let dayIdx = 0; dayIdx < DAY_START_COLS.length; dayIdx++) {
          const startCol = DAY_START_COLS[dayIdx]
          const date = dayDates[dayIdx]
          if (!date) continue

          for (let offset = 0; offset < 9; offset++) {
            const col = startCol + offset
            const period = PERIOD_MAP[offset]

            const subject = String(subjectRow[col] ?? '').trim()
            const instructorCell = String(instructorRow[col] ?? '').trim()

            if (!subject && !instructorCell) continue

            const instNames = instructorCell.split('\n').map((s: string) => s.trim()).filter(Boolean)
            const inst1Name = instNames[0] ?? ''
            const inst2Name = instNames[1] ?? ''

            const inst1 = instructors.find(i => i.name === inst1Name)
            const inst2 = instructors.find(i => i.name === inst2Name)

            if (inst1Name && !inst1) console.warn(`[미매칭] "${inst1Name}" (${date} ${period}교시)`)
            if (inst2Name && !inst2) console.warn(`[미매칭] "${inst2Name}" (${date} ${period}교시)`)

            const isAbsent1 = inst1 ? (absentMap[inst1Name]?.[date]?.has(period) ?? false) : false
            const isAbsent2 = inst2 ? (absentMap[inst2Name]?.[date]?.has(period) ?? false) : false

            lessonsToInsert.push({
              schedule_id: selectedScheduleId,
              date,
              period,
              subject,
              subject_type: getSubjectType(subject),
              instructor1_id: inst1?.id ?? null,
              instructor2_id: inst2?.id ?? null,
              classroom,
              course_name: courseName,
              row_order: r,
              is_absent1: isAbsent1,
              is_absent2: isAbsent2,
            })
          }
        }
      }

      console.log(`[파싱 완료] ${lessonsToInsert.length}개 수업`)

      // ── STEP 6: 100개씩 배치 insert ──
      for (let i = 0; i < lessonsToInsert.length; i += 100) {
        const { error: insertError } = await supabase
          .from('lessons')
          .insert(lessonsToInsert.slice(i, i + 100))
        if (insertError) throw new Error(`insert 실패 (${i}번째 배치): ` + insertError.message)
      }

      // ── STEP 7: 주차 공개 상태 갱신 ──
      await supabase
        .from('schedules')
        .update({ is_uploaded: true })
        .eq('id', selectedScheduleId)

      fetchSchedules()
      alert(`✅ 업로드 완료!\n${lessonsToInsert.length}개 수업이 등록됐어요.`)

    } catch (err: any) {
      console.error('[업로드 오류]', err)
      alert('업로드 실패: ' + err.message)
    }

    setUploading(false)
    e.target.value = ''
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6">
          <button onClick={() => router.push('/admin')} className="text-blue-500 text-sm mr-4">← 뒤로</button>
          <h1 className="text-xl font-bold text-gray-800">📅 시간표 관리</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="font-medium text-gray-700 mb-3">📤 엑셀 업로드</h2>
          <select
            value={selectedScheduleId}
            onChange={(e) => setSelectedScheduleId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
          >
            <option value="">주차 선택</option>
            {schedules.map(s => <option key={s.id} value={s.id}>{s.week_label}</option>)}
          </select>
          <label className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium cursor-pointer ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {uploading ? '업로드 중...' : '📁 엑셀 파일 선택'}
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" disabled={uploading} />
          </label>
          <p className="text-xs text-gray-400 mt-2">※ 주간 탭 + 검증 탭이 있는 엑셀 파일을 업로드해주세요</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="font-medium text-gray-700 mb-3">주차 추가</h2>
          <div className="space-y-2">
            <input
              type="text" value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              placeholder="주차명 (예: 4월 1주차)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date" value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number" value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              placeholder="주차 번호 (예: 1)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={handleAdd} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
              추가
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="font-medium text-gray-700 p-4 border-b">주차 목록</h2>
          {loading ? (
            <p className="text-center text-gray-400 p-4">불러오는 중...</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {schedules.map((s) => (
                <li key={s.id} className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-gray-800">{s.week_label}</span>
                      <div className="text-xs text-gray-400">{s.week_start}</div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handleToggleUpload(s.id, s.is_uploaded)}
                        className={`text-xs px-3 py-1 rounded-full ${s.is_uploaded ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {s.is_uploaded ? '공개' : '잠금'}
                      </button>
                      <button
                        onClick={() => handleDelete(s.id, s.week_label)}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        삭제
                      </button>
                    </div>
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
