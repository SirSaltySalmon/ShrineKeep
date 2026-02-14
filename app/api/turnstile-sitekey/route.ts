import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const siteKey = process.env.TURNSTILE_SITEKEY

export async function GET(request: NextRequest) {
    try {
        return NextResponse.json({ siteKey: siteKey as string })
    } catch (error) {
        console.error("Error fetching turnstile site key:", error)
        return NextResponse.json(
            { error: "Failed to fetch turnstile site key" },
            { status: 500 }
        )
    }
}