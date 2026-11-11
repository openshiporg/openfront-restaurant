import { arcPath } from "./geometry"

/**
 * Pastel bands behind a section: the same tapered arc the hero's dishes ride on,
 * coming in from one edge of the page. They are clipped to their own section, so
 * they never reach into the next one, and they stay clear of the headings.
 */
type Band = { side: "left" | "right"; y: string; colors: [string, string?] }
const SETS: Record<string, Band[]> = {
  menu: [{ side: "right", y: "70%", colors: ["#ffb8a8", "#b9d8ff"] }],
  popular: [{ side: "left", y: "64%", colors: ["#ffe08a", "#e0c6ff"] }],
  visit: [{ side: "right", y: "30%", colors: ["#c4e8b5", "#ffb8a8"] }],
  footer: [{ side: "right", y: "46%", colors: ["#c4e8b5", "#b9d8ff"] }],
  page: [{ side: "right", y: "0%", colors: ["#ffb8a8", "#ffe08a"] }],
}

export function Arcs({ variant }: { variant: keyof typeof SETS }) {
  return (
    <div className="o-arcs" aria-hidden="true">
      {SETS[variant].map((band, i) => {
        const [a0, a1] = band.side === "right" ? [96, 264] : [-84, 84]
        return (
          <svg key={i} viewBox="0 0 400 400" data-side={band.side} style={{ top: band.y }}>
            <path d={arcPath(a0, a1, 200, 200, 172, 46)} fill={band.colors[0]} />
            {band.colors[1] ? <path d={arcPath(a0 + 14, a1 - 14, 200, 200, 118, 34)} fill={band.colors[1]} /> : null}
          </svg>
        )
      })}
    </div>
  )
}
