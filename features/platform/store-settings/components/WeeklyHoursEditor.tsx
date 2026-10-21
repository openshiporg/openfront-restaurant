'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AlertCircle, CalendarClock, Plus, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface DayRange {
  open: string
  close: string
}

export interface DaySchedule {
  enabled: boolean
  ranges: DayRange[]
}

export interface HoursState {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

interface WeeklyHoursEditorProps {
  days: Array<{ key: DayKey; label: string; short: string }>
  hours: HoursState
  openDaysCount: number
  todaySummary: string
  locale: string
  timezone: string
  error: string | null
  onSetDayEnabled: (day: DayKey, enabled: boolean) => void
  onSetRangeValue: (day: DayKey, idx: number, key: 'open' | 'close', value: string) => void
  onAddRange: (day: DayKey) => void
  onRemoveRange: (day: DayKey, idx: number) => void
  onCopyDayToAll: (day: DayKey) => void
}

function to12Hour(time24: string, locale = 'en-US', timezone = 'UTC') {
  const [hour, minute] = time24.split(':').map((v) => Number.parseInt(v, 10))
  const d = new Date(Date.UTC(2000, 0, 1, hour, minute))
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}

export function WeeklyHoursEditor({
  days,
  hours,
  locale,
  timezone,
  error,
  onSetDayEnabled,
  onSetRangeValue,
  onAddRange,
  onRemoveRange,
  onCopyDayToAll,
}: WeeklyHoursEditorProps) {
  const [activeDay, setActiveDay] = useState<DayKey>(days[0].key)

  const s = hours[activeDay]
  const activeDayData = days.find((d) => d.key === activeDay)!

  // Which key corresponds to today
  const todayKey = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(new Date()).toLowerCase()

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">

      {/* Section header */}
      <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
        <CalendarClock size={13} className="text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
          Operations
        </span>
      </div>

      {/* 7-day tab strip */}
      <div className="grid grid-cols-7 divide-x divide-border">
        {days.map((day) => {
          const ds = hours[day.key]
          const isActive = activeDay === day.key
          const isToday = day.key === todayKey
          return (
            <button
              key={day.key}
              onClick={() => setActiveDay(day.key)}
              className={cn(
                'flex flex-col items-center py-3 px-1 transition-colors',
                isActive ? 'bg-muted' : 'hover:bg-muted/30'
              )}
            >
              <p
                className={cn(
                  'text-[10px] uppercase tracking-wider font-semibold',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {day.short}
              </p>
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full mt-1.5',
                  ds.enabled
                    ? 'bg-emerald-500'
                    : 'bg-zinc-300 dark:bg-zinc-600'
                )}
              />
              {isToday && (
                <span className="mt-0.5 text-[8px] uppercase tracking-wider font-semibold text-blue-500">
                  Today
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Active day — status row */}
      <div className="px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {activeDayData.label}
          </p>
          <p className="text-sm font-semibold mt-0.5">
            {s.enabled
              ? s.ranges.length > 0
                ? `${s.ranges.length} service window${s.ranges.length !== 1 ? 's' : ''}`
                : 'No windows set'
              : 'Closed all day'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">
            {s.enabled ? 'Open' : 'Closed'}
          </span>
          <Switch
            checked={s.enabled}
            onCheckedChange={(v) => onSetDayEnabled(activeDay, v)}
          />
        </div>
      </div>

      {/* Time ranges */}
      {s.enabled ? (
        <>
          {s.ranges.map((range, idx) => (
            <div
              key={`${activeDay}-${idx}`}
              className="grid divide-x divide-border"
              style={{ gridTemplateColumns: '1fr 1fr auto' }}
            >
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Open</p>
                <Input
                  type="time"
                  step={1800}
                  value={range.open}
                  onChange={(e) =>
                    onSetRangeValue(activeDay, idx, 'open', e.target.value)
                  }
                  className="mt-1.5 h-8 text-sm font-semibold"
                />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Close</p>
                <Input
                  type="time"
                  step={1800}
                  value={range.close}
                  onChange={(e) =>
                    onSetRangeValue(activeDay, idx, 'close', e.target.value)
                  }
                  className="mt-1.5 h-8 text-sm font-semibold"
                />
              </div>
              <div className="px-4 flex items-end pb-4">
                <button
                  className="text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-25 disabled:pointer-events-none"
                  onClick={() => onRemoveRange(activeDay, idx)}
                  disabled={s.ranges.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Actions */}
          <div className="px-5 py-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => onAddRange(activeDay)}
            >
              <Plus size={11} className="mr-1" />
              Split shift
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2.5 text-muted-foreground"
              onClick={() => onCopyDayToAll(activeDay)}
            >
              <Copy size={11} className="mr-1" />
              Copy to all days
            </Button>
          </div>
        </>
      ) : (
        <div className="px-5 py-4 text-xs text-muted-foreground italic">
          Toggle open to add service windows for {activeDayData.label}.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 py-3 flex items-center gap-2 text-xs text-destructive">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </div>
  )
}
