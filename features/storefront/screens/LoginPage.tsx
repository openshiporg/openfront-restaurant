"use client"

import { useState, useActionState } from "react"
import { login, signUp } from "@/features/storefront/lib/data/user"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const [view, setView] = useState<"signin" | "signup">("signin")
  const [signinError, signinAction, isSigninPending] = useActionState(login, null)
  const [signupError, signupAction, isSignupPending] = useActionState(signUp, null)

  return (
    <div className="grid w-full max-w-5xl overflow-hidden bg-card lg:grid-cols-[0.9fr_1.1fr]">
      <div className="bg-muted p-8 sm:p-10 lg:p-12">
        <h1 className="mt-4 text-balance font-serif text-4xl font-semibold text-foreground">
          {view === "signin" ? "Welcome back." : "Create your account."}
        </h1>
        <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground">
          {view === "signin"
            ? "Sign in to reorder past favorites, manage saved addresses, and move through checkout faster."
            : "Save your profile for faster checkout, order history, and easier address management."}
        </p>

        <div className="mt-8 space-y-3 pt-6 text-sm text-muted-foreground">
          <p>• View current and past orders</p>
          <p>• Save delivery and billing addresses</p>
          <p>• Move through checkout faster next time</p>
        </div>
      </div>

      <div className="p-8 sm:p-10 lg:p-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">
              {view === "signin" ? "Sign in" : "Create account"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === "signin"
                ? "Use the same credentials you check out with."
                : "Enter your details once and reuse them later."}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to menu</span>
          </Link>
        </div>

        {view === "signin" ? (
          <form action={signinAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required className="h-11 border-border bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
              <Input id="password" name="password" type="password" required className="h-11 border-border bg-background" />
            </div>
            {signinError ? <p className="text-sm font-medium text-destructive">{signinError}</p> : null}
            <Button type="submit" variant="ghost" className="h-12 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" disabled={isSigninPending}>
              {isSigninPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        ) : (
          <form action={signupAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="signup-name" className="text-sm font-medium text-foreground">Full name</Label>
              <Input id="signup-name" name="name" placeholder="Your full name" required className="h-11 border-border bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email" className="text-sm font-medium text-foreground">Email</Label>
              <Input id="signup-email" name="email" type="email" placeholder="you@example.com" required className="h-11 border-border bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-phone" className="text-sm font-medium text-foreground">Phone number</Label>
              <Input id="signup-phone" name="phone" type="tel" placeholder="(555) 000-0000" required className="h-11 border-border bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password" className="text-sm font-medium text-foreground">Password</Label>
              <Input id="signup-password" name="password" type="password" required className="h-11 border-border bg-background" />
            </div>
            {signupError ? <p className="text-sm font-medium text-destructive">{signupError}</p> : null}
            <Button type="submit" variant="ghost" className="h-12 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" disabled={isSignupPending}>
              {isSignupPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Create account
            </Button>
          </form>
        )}

        <div className="mt-8 pt-6 text-sm text-muted-foreground">
          {view === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button onClick={() => setView("signup")} className="font-medium text-primary transition-colors hover:text-primary/80">
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setView("signin")} className="font-medium text-primary transition-colors hover:text-primary/80">
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
