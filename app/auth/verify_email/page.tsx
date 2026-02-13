"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function VerifyEmailPage() {
  return (
    <div>
      <h1>Verify Your Email</h1>
      <p>Please check your email for a verification link, then click below to log in again.</p>
      <Button asChild>
        <Link href="/auth/login">Log In</Link>
      </Button>
    </div>
  )
}