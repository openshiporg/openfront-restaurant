/** Soft pastel bands sweeping behind a section, the same arcs the hero's plates ride on. Purely decorative. */
const SETS: Record<string, Array<{ c: string; x: string; y: string; s: string; w: number; r: number }>> = {
  menu: [
    { c: "#ffb8a8", x: "-18%", y: "-30%", s: "62vw", w: 46, r: -18 },
    { c: "#b9d8ff", x: "-14%", y: "-24%", s: "58vw", w: 40, r: -18 },
    { c: "#c4e8b5", x: "70%", y: "-10%", s: "46vw", w: 40, r: 30 },
  ],
  popular: [
    { c: "#ffe08a", x: "78%", y: "8%", s: "52vw", w: 44, r: 40 },
    { c: "#e0c6ff", x: "82%", y: "14%", s: "48vw", w: 38, r: 40 },
  ],
  visit: [
    { c: "#ffb8a8", x: "-22%", y: "30%", s: "50vw", w: 44, r: -10 },
    { c: "#e0c6ff", x: "-18%", y: "36%", s: "46vw", w: 38, r: -10 },
    { c: "#c4e8b5", x: "74%", y: "-30%", s: "44vw", w: 40, r: 20 },
  ],
  footer: [
    { c: "#c4e8b5", x: "70%", y: "-60%", s: "50vw", w: 40, r: 10 },
    { c: "#b9d8ff", x: "74%", y: "-54%", s: "46vw", w: 34, r: 10 },
  ],
  page: [
    { c: "#ffb8a8", x: "56%", y: "-50%", s: "70vw", w: 50, r: 0 },
    { c: "#ffe08a", x: "60%", y: "-44%", s: "66vw", w: 44, r: 0 },
    { c: "#c4e8b5", x: "64%", y: "-38%", s: "62vw", w: 40, r: 0 },
  ],
}

export function Arcs({ variant }: { variant: keyof typeof SETS }) {
  return (
    <div className="o-arcs" aria-hidden="true">
      {SETS[variant].map((a, i) => (
        <i
          key={i}
          style={{
            left: a.x,
            top: a.y,
            width: `max(${a.s}, 360px)`,
            height: `max(${a.s}, 360px)`,
            borderWidth: a.w,
            borderTopColor: a.c,
            borderRightColor: a.c,
            transform: `rotate(${a.r}deg)`,
          }}
        />
      ))}
    </div>
  )
}
