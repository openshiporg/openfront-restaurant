import type { MenuItem } from "@/features/storefront/lib/store-data"

export type OptionGroup = {
  id: string
  name: string
  required: boolean
  min: number
  max: number
  options: Array<{ id: string; name: string; price: number; default: boolean }>
}

/** A dish's modifiers as the kitchen grouped them: what must be chosen, how many, and what each adds to the price. */
export function groupsOf(item: Pick<MenuItem, "modifiers">): OptionGroup[] {
  const map = new Map<string, OptionGroup>()
  for (const m of item.modifiers || []) {
    const key = m.modifierGroup || "other"
    const group = map.get(key) || {
      id: key,
      name: m.modifierGroupLabel || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
      required: false,
      min: 0,
      max: 0,
      options: [],
    }
    group.required ||= Boolean(m.required)
    group.min = Math.max(group.min, m.minSelections || 0)
    group.max = Math.max(group.max, m.maxSelections || 0)
    group.options.push({ id: m.id, name: m.name, price: Number(m.priceAdjustment || 0), default: Boolean(m.defaultSelected) })
    map.set(key, group)
  }
  return [...map.values()].map((g) => ({ ...g, max: g.max || g.options.length, min: g.required ? Math.max(1, g.min) : g.min }))
}

/** One tap on an option: radio groups swap, others add or drop within the group's limits. */
export function toggleOption(now: string[], group: OptionGroup, id: string): string[] {
  if (now.includes(id)) return now.length <= group.min ? now : now.filter((x) => x !== id)
  if (group.max === 1) return [id]
  return now.length >= group.max ? now : [...now, id]
}
