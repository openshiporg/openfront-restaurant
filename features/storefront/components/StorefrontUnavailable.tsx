export function StorefrontUnavailable({ title, message }: { title: string; message: string }) {
  return <main className="storefront-shell flex min-h-[50vh] flex-col items-center justify-center py-20 text-center" role="alert">
    <span className="storefront-kicker">Ordering unavailable</span>
    <h1 className="storefront-heading mt-3 max-w-2xl">{title}</h1>
    <p className="storefront-copy mt-3 max-w-xl">{message}</p>
    <a href="/" className="mt-6 rounded-md border px-4 py-2 text-sm font-medium underline underline-offset-4">Try again</a>
  </main>;
}
