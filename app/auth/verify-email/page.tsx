"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md min-w-0 overflow-hidden">
        <CardHeader className="space-y-1 min-w-0">
          <CardTitle className="text-fluid-2xl font-bold text-center min-w-0">Verify Your Email</CardTitle>
          <CardDescription className="text-center min-w-0">
            Please check your email for a verification link, then click below to log in again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0 overflow-visible">
          <Button asChild>
            <Link href="/auth/login">Log In</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}