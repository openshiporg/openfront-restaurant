export type TipShiftEntry = {
  staffId: string;
  staffName: string;
  role: string;
  hoursWorked: number;
};

export type TipDistribution = TipShiftEntry & { amount: number };

export const TIP_ROLE_WEIGHTS: Record<string, number> = {
  server: 60,
  bartender: 20,
  busser: 10,
  host: 10,
};

export const TIP_INELIGIBLE_ROLES = new Set(["manager", "admin", "owner", "supervisor"]);

export function isTipEligibleRole(role: string | null | undefined) {
  return Boolean(role && !TIP_INELIGIBLE_ROLES.has(role.toLowerCase()));
}

function allocateCents<T>(
  total: number,
  entries: T[],
  getWeight: (entry: T) => number,
  getStableKey: (entry: T) => string
) {
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, getWeight(entry)), 0);
  if (totalWeight <= 0 || total <= 0) return entries.map((entry) => ({ entry, amount: 0 }));

  const allocations = entries.map((entry) => {
    const exact = (Math.max(0, getWeight(entry)) / totalWeight) * total;
    const floor = Math.floor(exact);
    return { entry, amount: floor, remainder: exact - floor, key: getStableKey(entry) };
  });
  let centsRemaining = total - allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  allocations
    .sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))
    .forEach((allocation) => {
      if (centsRemaining > 0) {
        allocation.amount += 1;
        centsRemaining -= 1;
      }
    });

  return allocations
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ entry, amount }) => ({ entry, amount }));
}

function aggregateEntries(entries: TipShiftEntry[]) {
  const byStaff = new Map<string, TipShiftEntry>();
  for (const entry of entries) {
    const role = (entry.role || "").toLowerCase();
    if (!entry.staffId || !isTipEligibleRole(role) || entry.hoursWorked <= 0) continue;
    const key = `${entry.staffId}:${role}`;
    const existing = byStaff.get(key);
    byStaff.set(key, {
      staffId: entry.staffId,
      staffName: entry.staffName,
      role,
      hoursWorked: (existing?.hoursWorked || 0) + entry.hoursWorked,
    });
  }
  return Array.from(byStaff.values());
}

export function calculateTipDistributions(
  type: "house_pool" | "pool_by_role",
  totalTipsCents: number,
  rawEntries: TipShiftEntry[]
): TipDistribution[] {
  const total = Math.max(0, Math.round(totalTipsCents));
  const entries = aggregateEntries(rawEntries);
  if (!entries.length || !total) return [];

  if (type === "house_pool") {
    return allocateCents(total, entries, (entry) => entry.hoursWorked, (entry) => entry.staffId)
      .map(({ entry, amount }) => ({ ...entry, amount }));
  }

  const groups = Array.from(
    entries.reduce((map, entry) => {
      map.set(entry.role, [...(map.get(entry.role) || []), entry]);
      return map;
    }, new Map<string, TipShiftEntry[]>())
  ).map(([role, roleEntries]) => ({
    role,
    entries: roleEntries,
    weight: TIP_ROLE_WEIGHTS[role] || 0,
  })).filter((group) => group.weight > 0);

  const groupAllocations = allocateCents(
    total,
    groups,
    (group) => group.weight,
    (group) => group.role
  );
  return groupAllocations.flatMap(({ entry: group, amount: groupAmount }) =>
    allocateCents(
      groupAmount,
      group.entries,
      (entry) => entry.hoursWorked,
      (entry) => entry.staffId
    ).map(({ entry, amount }) => ({ ...entry, amount }))
  );
}

export function assertTipConservation(totalTipsCents: number, distributions: TipDistribution[]) {
  const distributed = distributions.reduce((sum, distribution) => sum + distribution.amount, 0);
  if (distributed !== Math.round(totalTipsCents)) {
    throw new Error(`Tip allocation must conserve every cent (${distributed} of ${totalTipsCents})`);
  }
}
