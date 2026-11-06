"use client"

/** Order-ahead time in the guest's own clock (rendered client-side so the server zone never leaks in). */
export function ScheduledTime({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
    </time>
  )
}
