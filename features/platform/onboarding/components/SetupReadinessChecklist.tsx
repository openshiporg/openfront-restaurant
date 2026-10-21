import Link from "next/link";
import type { OnboardingSettingsReview } from "../hooks/useOnboardingState";

type ReadinessCheck = { title: string; detail: string; href: string; link: string; secondaryHref?: string; secondaryLink?: string };

const CHECKS: ReadinessCheck[] = [
  {
    title: "Menu prices and modifiers",
    detail: "Review every customer-facing price in the venue currency, including modifier add-ons.",
    href: "/dashboard/platform/menu",
    link: "Review menu",
  },
  {
    title: "Service hours and delivery zone",
    detail: "Review saved hours and, if offering delivery, confirm explicit postal codes. Test one in-zone and one out-of-zone address before enabling delivery.",
    href: "/dashboard/platform/store-settings",
    link: "Review store settings",
    secondaryHref: "/",
    secondaryLink: "Open storefront",
  },
  {
    title: "Payment and refund flow",
    detail: "Configure credentials and complete provider sandbox payment, refund, and webhook checks. Do not use live keys for setup tests.",
    href: "/dashboard/platform/payment-providers",
    link: "Review providers",
    secondaryHref: "/dashboard/platform/reconciliation",
    secondaryLink: "Review reconciliation",
  },
  {
    title: "Staff permissions",
    detail: "Confirm each operator has only the permissions needed for their role, including payment and order corrections.",
    href: "/dashboard/platform/users",
    link: "Review staff roles",
  },
];

export function SetupReadinessChecklist({ settingsReview }: { settingsReview: OnboardingSettingsReview | null }) {
  return <section className="space-y-5" aria-labelledby="setup-readiness-title">
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <h3 id="setup-readiness-title" className="font-semibold">Setup records saved — operational readiness is not verified</h3>
      <p className="mt-1">Completing this setup only confirms record persistence. Finish these checks before accepting customer orders.</p>
    </div>

    <div className="rounded-md border p-4 text-sm">
      <h3 className="font-medium">Persisted settings review</h3>
      {!settingsReview ? <p className="mt-1 text-muted-foreground">No settings readback is available. Review the saved configuration manually.</p> : settingsReview.mismatchedFields.length > 0 ? (
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          Existing settings were preserved without overwrite. These fields differ from the selected setup: {settingsReview.mismatchedFields.join(", ")}.
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground">
          The persisted settings match the submitted setup values for {settingsReview.checkedFields.length} fields{settingsReview.reused ? " (existing record reused)" : ""}. This does not verify customer or provider behavior.
        </p>
      )}
    </div>

    <ol className="space-y-3">
      {CHECKS.map((check, index) => <li key={check.title} className="rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{index + 1}. {check.title} <span className="ml-1 text-xs font-normal text-amber-700 dark:text-amber-300">Not verified</span></p>
            <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link className="text-sm font-medium underline underline-offset-4" href={check.href}>{check.link}</Link>
            {check.secondaryHref && check.secondaryLink ? <Link className="text-sm font-medium underline underline-offset-4" href={check.secondaryHref}>{check.secondaryLink}</Link> : null}
          </div>
        </div>
      </li>)}
    </ol>
  </section>;
}
