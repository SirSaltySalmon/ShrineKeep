"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { ValueHistory } from "@/lib/types"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { Calendar, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ValueGraphProps {
  itemId: string
  acquisitionDate?: string | null
  currentValue?: string
}

export default function ValueGraph({ itemId, acquisitionDate, currentValue }: ValueGraphProps) {
  const supabase = createSupabaseClient()
  const [history, setHistory] = useState<ValueHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [itemId])

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("value_history")
        .select("*")
        .eq("item_id", itemId)
        .order("recorded_at", { ascending: true })

      if (error) throw error
      setHistory(data || [])
    } catch (error) {
      console.error("Error loading value history:", error)
    } finally {
      setLoading(false)
    }
  }

  const deleteRecord = async (recordId: string) => {
    try {
      const { error } = await supabase
        .from("value_history")
        .delete()
        .eq("id", recordId)

      if (error) throw error
      loadHistory()
    } catch (error) {
      console.error("Error deleting record:", error)
    }
  }

  const formatRecordedAtForInput = (recordedAt: string) => {
    const d = new Date(recordedAt)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }

  const updateRecordDate = async (recordId: string, newRecordedAt: string) => {
    try {
      const iso = new Date(newRecordedAt).toISOString()
      const { error } = await supabase
        .from("value_history")
        .update({ recorded_at: iso })
        .eq("id", recordId)

      if (error) throw error
      loadHistory()
    } catch (error) {
      console.error("Error updating record date:", error)
    }
  }

  const setRecordToAcquisitionDate = async (recordId: string) => {
    if (!acquisitionDate) return
    // Use noon local to avoid timezone edge cases
    const datetimeLocal = `${acquisitionDate}T12:00:00`
    await updateRecordDate(recordId, datetimeLocal)
  }

  const addRecordNow = async () => {
    const raw = (currentValue ?? "").trim()
    const num = raw === "" ? null : parseFloat(raw)
    const value = num === null || Number.isNaN(num) ? 0 : num
    try {
      const { error } = await supabase.from("value_history").insert({
        item_id: itemId,
        value,
      })
      if (error) throw error
      loadHistory()
    } catch (error) {
      console.error("Error adding record:", error)
    }
  }

  if (loading) {
    return <div>Loading graph...</div>
  }

  if (history.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Value History</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRecordNow}
            className="shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            Record current value
          </Button>
        </div>
        <p className="text-center py-6 text-muted-foreground">
          No value history yet. Enter a value above and click &quot;Record current value&quot; or save the item to add a record.
        </p>
      </div>
    )
  }

  const chartData = history.map((record) => ({
    date: format(new Date(record.recorded_at), "MMM dd"),
    value: parseFloat(record.value.toString()),
    fullDate: record.recorded_at,
    id: record.id,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold">Value History</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRecordNow}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Record current value
        </Button>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#22c55e"
            strokeWidth={2}
            name="Value"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {history.map((record) => (
          <div
            key={record.id}
            className="flex flex-wrap items-center gap-2 p-2 border rounded"
          >
            <div className="shrink-0">
              <div className="font-medium">{formatCurrency(parseFloat(record.value.toString()))}</div>
              <label className="text-xs text-muted-foreground block mt-1">Date & time</label>
              <div className="mt-0.5 flex items-center gap-1">
                <input
                  key={`${record.id}-${record.recorded_at}`}
                  type="datetime-local"
                  className="text-sm border rounded px-2 py-1 bg-background w-[200px] min-w-0 max-w-[calc(100vw-12rem)]"
                  defaultValue={formatRecordedAtForInput(record.recorded_at)}
                  onBlur={(e) => {
                    const v = e.target.value
                    if (v && v !== formatRecordedAtForInput(record.recorded_at)) {
                      updateRecordDate(record.id, v)
                    }
                  }}
                />
                {acquisitionDate && (
                  <button
                    type="button"
                    onClick={() => setRecordToAcquisitionDate(record.id)}
                    className="p-1.5 rounded border border-input bg-background hover:bg-accent hover:text-accent-foreground shrink-0"
                    title="Set date & time to acquisition date"
                    aria-label="Set date & time to acquisition date"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-2" aria-hidden />
            <button
              onClick={() => deleteRecord(record.id)}
              className="text-destructive hover:underline text-sm shrink-0"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
