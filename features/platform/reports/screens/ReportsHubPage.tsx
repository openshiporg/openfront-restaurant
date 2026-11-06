import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { ChefHat, TrendingUp, Users } from 'lucide-react'
import Link from 'next/link'

const availableReports = [
  {
    title: 'Sales Overview',
    href: '/dashboard/platform/reports/sales',
    icon: TrendingUp,
  },
  {
    title: 'Menu Performance',
    href: '/dashboard/platform/reports/menu-performance',
    icon: ChefHat,
  },
  {
    title: 'Labor & Staffing',
    href: '/dashboard/platform/reports/labor',
    icon: Users,
  },
]

export function ReportsHubPage() {
  return (
    <div className="flex h-full flex-col bg-background">
      <PageBreadcrumbs
        items={[
          { type: 'link', label: 'Dashboard', href: '/dashboard' },
          { type: 'page', label: 'Platform' },
          { type: 'page', label: 'Reports' },
        ]}
      />

      <div className="border-b border-border px-4 py-4 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Data and analytics for your restaurant operations.
        </p>
      </div>

      <div className="px-4 py-5 md:px-6">
                <div className="overflow-hidden rounded-lg border border-border">
          {availableReports.map((report) => {
            const Icon = report.icon

            return (
              <Link
                key={report.title}
                href={report.href}
                className="group flex items-center gap-3 border-b border-border bg-card px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-background">
                  <Icon size={15} className="text-muted-foreground" />
                </div>
                <span className="flex-1 text-sm font-medium">{report.title}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Live
                </span>
                <span className="text-muted-foreground transition-colors group-hover:text-foreground">
                  ›
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
