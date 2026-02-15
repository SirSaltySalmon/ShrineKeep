import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { TAG_COLORS, type TagColor } from "@/lib/types"
import { sortTagsByColorThenName } from "@/lib/utils"

const MAX_TAGS_PER_USER = 256

function isValidColor(c: string): c is TagColor {
  return (TAG_COLORS as readonly string[]).includes(c)
}

/** GET: list current user's tags */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .eq("user_id", user.id)
    if (error) throw error
    return NextResponse.json(sortTagsByColorThenName(data ?? []))
  } catch (error) {
    console.error("Error listing tags:", error)
    return NextResponse.json({ error: "Failed to list tags" }, { status: 500 })
  }
}

/** POST: create a tag (enforces 256 limit) */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const color = typeof body.color === "string" && isValidColor(body.color) ? body.color : "blue"
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const { count } = await supabase
      .from("tags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
    if ((count ?? 0) >= MAX_TAGS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum ${MAX_TAGS_PER_USER} tags. Delete some in Settings > Tags.` },
        { status: 400 }
      )
    }
    const { data, error } = await supabase
      .from("tags")
      .insert({ user_id: user.id, name, color })
      .select()
      .single()
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A tag with this name already exists." }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating tag:", error)
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 })
  }
}

/** PATCH: update a tag (name and/or color) */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) {
      return NextResponse.json({ error: "Tag id is required" }, { status: 400 })
    }
    const updates: { name?: string; color?: TagColor } = {}
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim()
    }
    if (typeof body.color === "string" && isValidColor(body.color)) {
      updates.color = body.color
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Provide name and/or color to update" }, { status: 400 })
    }
    const { data, error } = await supabase
      .from("tags")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A tag with this name already exists." }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error updating tag:", error)
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 })
  }
}
