"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Tag, TAG_COLORS, type TagColor } from "@/lib/types"
import { sortTagsByColorThenName, getTagChipStyle } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, Trash2, Plus } from "lucide-react"

const MAX_TAGS_PER_USER = 256

export default function TagSettings() {
  const supabase = createSupabaseClient()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState<TagColor>("blue")
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<TagColor>("blue")

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setUserId(user.id)
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", user.id)
      if (!error) setTags(sortTagsByColorThenName(data ?? []))
      setLoading(false)
    }
    load()
  }, [supabase])

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor((tag as Tag).color ?? "blue")
  }

  const saveEdit = async () => {
    if (!editingId || !userId) return
    const name = editName.trim()
    if (!name) return
    const { error } = await supabase
      .from("tags")
      .update({ name, color: editColor })
      .eq("id", editingId)
      .eq("user_id", userId)
    if (error) {
      if (error.code === "23505") alert("A tag with this name already exists.")
      else alert(error.message)
      return
    }
    setTags((prev) =>
      prev.map((t) => (t.id === editingId ? { ...t, name, color: editColor } : t))
    )
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const deleteTag = async (tag: Tag) => {
    if (!userId) return
    if (!window.confirm(`Delete tag "${tag.name}"? It will be removed from all items.`)) return
    const { error } = await supabase.from("tags").delete().eq("id", tag.id).eq("user_id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setTags((prev) => prev.filter((t) => t.id !== tag.id))
  }

  const createTag = async () => {
    const name = newName.trim()
    if (!name || !userId) return
    if (tags.length >= MAX_TAGS_PER_USER) {
      alert(`Maximum ${MAX_TAGS_PER_USER} tags. Delete some to create more.`)
      return
    }
    const { data, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name, color: newColor })
      .select()
      .single()
    if (error) {
      if (error.code === "23505") alert("A tag with this name already exists.")
      else alert(error.message)
      return
    }
    if (data) {
      setTags((prev) => sortTagsByColorThenName([...prev, data]))
      setNewName("")
      setNewColor("blue")
      setShowCreate(false)
    }
  }

  if (loading) {
    return <p className="text-fluid-sm text-muted-foreground">Loading tags…</p>
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-fluid-xl font-semibold mb-2">Tags</h2>
        <p className="text-fluid-sm text-muted-foreground mb-4">
          Manage your tags: rename, change color, or delete. Deleting a tag removes it from all items. You can have up to {MAX_TAGS_PER_USER} tags.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-fluid-sm">Your tags ({tags.length})</Label>
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3 min-w-0"
            >
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Tag name"
                    className="flex-1 min-w-[120px]"
                  />
                  <select
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value as TagColor)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-fluid-sm min-w-[100px]"
                  >
                    {TAG_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" onClick={saveEdit}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span
                    className="rounded-md px-2 py-0.5 text-fluid-sm font-medium text-white shrink-0"
                    style={getTagChipStyle((tag as Tag).color ?? "blue")}
                  >
                    {tag.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(tag)}
                    aria-label={`Rename ${tag.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTag(tag)}
                    aria-label={`Delete ${tag.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {showCreate ? (
        <div className="rounded-lg border p-4 space-y-2 bg-light-muted">
          <Label className="text-fluid-sm">New tag</Label>
          <div className="flex flex-wrap gap-2 items-end">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tag name"
              className="min-w-[140px]"
            />
            <select
              value={newColor}
              onChange={(e) => setNewColor(e.target.value as TagColor)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-fluid-sm min-w-[100px]"
            >
              {TAG_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={createTag} disabled={!newName.trim() || tags.length >= MAX_TAGS_PER_USER}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(""); setNewColor("blue") }}>
              Cancel
            </Button>
          </div>
          {tags.length >= MAX_TAGS_PER_USER && (
            <p className="text-fluid-xs text-muted-foreground">Maximum {MAX_TAGS_PER_USER} tags reached.</p>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowCreate(true)}
          disabled={tags.length >= MAX_TAGS_PER_USER}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create new tag
        </Button>
      )}
    </div>
  )
}
