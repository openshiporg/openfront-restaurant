import Link from "next/link"

export function Unavailable({ title, message, action = true }: { title: string; message: string; action?: boolean }) {
  const words = title.split(" ")
  const cut = Math.ceil(words.length / 2)
  return (
    <section className="o-pagehero" style={{ minHeight: "60dvh", display: "grid", alignItems: "center" }}>
      <img src="/images/kitchen-backdrop.webp" alt="" />
      <div className="o-shell">
        <h1 className="o-split o-split-lg" style={{ maxWidth: "18ch" }}>
          <span className="o-thin">{words.slice(0, cut).join(" ")}</span>
          <span className="o-heavy">{words.slice(cut).join(" ")}</span>
        </h1>
        <p className="o-lede" style={{ marginTop: 16 }}>{message}</p>
        {action ? <Link href="/menu" className="o-btn" style={{ marginTop: 24 }}>Back to the menu</Link> : null}
      </div>
    </section>
  )
}
