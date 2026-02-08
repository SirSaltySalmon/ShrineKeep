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

interface ValueGraphProps {
  itemId: string
}

export default function ValueGraph({ itemId }: ValueGraphProps) {
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

  if (loading) {
    return <div>Loading graph...</div>
  }

  if (history.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">
      No value history yet. Update the item's value to see it tracked here.
    </div>
  }

  const chartData = history.map((record) => ({
    date: format(new Date(record.recorded_at), "MMM dd"),
    value: parseFloat(record.value.toString()),
    fullDate: record.recorded_at,
    id: record.id,
  }))

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Value History</h3>
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
            stroke="#8884d8"
            strokeWidth={2}
            name="Value"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {history.map((record) => (
          <div
            key={record.id}
            className="flex items-center justify-between p-2 border rounded"
          >
            <div>
              <div className="font-medium">{formatCurrency(parseFloat(record.value.toString()))}</div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(record.recorded_at), "PPp")}
              </div>
            </div>
            <button
              onClick={() => deleteRecord(record.id)}
              className="text-destructive hover:underline text-sm"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
