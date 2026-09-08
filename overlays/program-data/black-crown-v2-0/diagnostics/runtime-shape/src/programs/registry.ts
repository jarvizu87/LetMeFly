import type { ProgramDay, ProgramWeek, PublicProgramKey } from '../program-engine/types'
import { CROWNFORGE } from './crownforge'
import { CROWN_MAINTENANCE } from './crown-maintenance'
import { BLACK_CROWN } from './black-crown'

export { CROWNFORGE } from './crownforge'
export { CROWN_MAINTENANCE } from './crown-maintenance'
export { BLACK_CROWN } from './black-crown'

export const PROGRAMS = [CROWNFORGE, CROWN_MAINTENANCE, BLACK_CROWN] as const

export function getProgram(key: PublicProgramKey) {
  return PROGRAMS.find((program) => program.key === key) ?? null
}

export function getCrownforgeWeek(week: number): ProgramWeek | null {
  return CROWNFORGE.weekData.find((item) => item.week === week) ?? null
}

export function getCrownforgeDay(week: number, day: number): ProgramDay | null {
  const w = getCrownforgeWeek(week)
  return w?.days.find((item) => item.day === day) ?? null
}

export function getCrownMaintenanceWeek(week: number): ProgramWeek | null {
  return CROWN_MAINTENANCE.weekData.find((item) => item.week === week) ?? null
}

export function getCrownMaintenanceDay(week: number, day: number): ProgramDay | null {
  const w = getCrownMaintenanceWeek(week)
  return w?.days.find((item) => item.day === day) ?? null
}

export type CalendarProgramKey = 'crownforge' | 'crown-maintenance'

export function getCalendarDay(date = new Date()): { week: number; day: number; program: CalendarProgramKey } | null {
  const iso = toLocalIsoDate(date)
  for (const [programKey, program] of [['crownforge', CROWNFORGE], ['crown-maintenance', CROWN_MAINTENANCE]] as const) {
    for (const week of program.weekData) {
      const day = week.days.find((item) => item.date === iso)
      if (day) return { week: week.week, day: day.day, program: programKey }
    }
  }
  return null
}

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
