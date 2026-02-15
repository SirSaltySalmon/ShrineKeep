"use client"

import { useState } from "react"
import { ColorPicker } from "@/components/ui/color-picker"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { Theme } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ThumbnailPreview } from "@/components/thumbnail-content"
import { ValueAcquisitionCharts } from "@/components/value-acquisition-charts"
import type { ValueChartPoint, AcquisitionChartPoint } from "@/lib/hooks/use-box-stats"

/** Preset chart data for theme editor (ISO dates, currency values). */
const GRAPH_PREVIEW_VALUE_DATA: ValueChartPoint[] = (() => {
  const lastYear = new Date().getFullYear() - 1
  const thisYear = new Date().getFullYear()
  return [
    { date: `${lastYear}-01-01`, value: 0 },
    { date: `${thisYear}-01-01`, value: 1234.56 },
  ]
})()

const GRAPH_PREVIEW_ACQUISITION_DATA: AcquisitionChartPoint[] = (() => {
  const lastYear = new Date().getFullYear() - 1
  const thisYear = new Date().getFullYear()
  return [
    { date: `${lastYear}-01-01`, cumulativeAcquisition: 0 },
    { date: `${thisYear}-01-01`, cumulativeAcquisition: 600 },
  ]
})()

type ColorKey = keyof Omit<Theme, "radius">

export interface ColorRowConfig {
  key: ColorKey
  label: string
  defaultValue: string
}

const RADIUS_OPTIONS = [
  { value: "0", label: "None" },
  { value: "0.25rem", label: "Small" },
  { value: "0.5rem", label: "Medium" },
  { value: "0.75rem", label: "Large" },
] as const

interface PreviewGroupConfig {
  title: string
  description?: string
  preview: React.ReactNode
  rows: ColorRowConfig[]
}

export interface ThemeEditorProps {
  theme: Theme
  setTheme: (s: Theme | ((prev: Theme) => Theme)) => void
  setSelectedPreset: (p: "light" | "dark" | "custom") => void
}

function PreviewBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center min-h-[2.5rem] p-3 rounded-lg border border-border bg-muted/20",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Full-size Select matching app dropdowns (h-10, same min width as elsewhere). */
function DropdownPreview() {
  const [value, setValue] = useState("option-a")
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger className="h-10 min-w-[140px] w-full max-w-[200px]">
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option-a">Option A</SelectItem>
        <SelectItem value="option-b">Option B</SelectItem>
        <SelectItem value="option-c">Option C</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function ThemeEditor({ theme, setTheme, setSelectedPreset }: ThemeEditorProps) {
  const handleColorChange = (key: ColorKey, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }))
    setSelectedPreset("custom")
  }

  const handleRadiusChange = (value: string) => {
    setTheme((prev) => ({ ...prev, radius: value }))
    setSelectedPreset("custom")
  }

  const handleGraphOverlayChange = (checked: boolean) => {
    setTheme((prev) => ({ ...prev, graphOverlay: checked }))
    setSelectedPreset("custom")
  }

  const [inputPreviewValue, setInputPreviewValue] = useState("")

  const PREVIEW_GROUPS: PreviewGroupConfig[] = [
    {
      title: "Page & surfaces",
      description: "Background and main surfaces",
      preview: (
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-border p-4 bg-background text-foreground text-fluid-sm">
            Page
          </div>
          <Card className="min-w-[200px]">
            <CardHeader className="p-4">
              <CardTitle className="text-fluid-sm">Card title</CardTitle>
            </CardHeader>
          </Card>
          <DropdownPreview />
        </div>
      ),
      rows: [
        { key: "background", label: "Background", defaultValue: "0 0% 100%" },
        { key: "foreground", label: "Foreground (text)", defaultValue: "222.2 84% 4.9%" },
        { key: "card", label: "Card", defaultValue: "0 0% 100%" },
        { key: "cardForeground", label: "Card text", defaultValue: "222.2 84% 4.9%" },
        { key: "popover", label: "Popover", defaultValue: "0 0% 100%" },
        { key: "popoverForeground", label: "Popover text", defaultValue: "222.2 84% 4.9%" },
      ],
    },
    {
      title: "Buttons & actions",
      description: "Primary and secondary buttons; hover to see accent",
      preview: (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={(e) => e.preventDefault()}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={(e) => e.preventDefault()}>
            Cancel
          </Button>
          <div className="rounded-md px-4 py-2 bg-muted text-muted-foreground text-fluid-sm">
            Muted text
          </div>
          <Button type="button" variant="ghost" onClick={(e) => e.preventDefault()}>
            Hover
          </Button>
        </div>
      ),
      rows: [
        { key: "primary", label: "Primary (e.g. Save)", defaultValue: "222.2 47.4% 11.2%" },
        { key: "primaryForeground", label: "Primary text", defaultValue: "210 40% 98%" },
        { key: "secondary", label: "Secondary (e.g. Cancel)", defaultValue: "210 40% 96.1%" },
        { key: "secondaryForeground", label: "Secondary text", defaultValue: "222.2 47.4% 11.2%" },
        { key: "muted", label: "Muted", defaultValue: "210 40% 96.1%" },
        { key: "mutedForeground", label: "Muted text", defaultValue: "215.4 16.3% 46.9%" },
        { key: "accent", label: "Accent (hover)", defaultValue: "210 40% 96.1%" },
        { key: "accentForeground", label: "Accent text", defaultValue: "222.2 47.4% 11.2%" },
      ],
    },
    {
      title: "Borders & focus",
      description: "Border, input border, and focus ring. You can type in the input.",
      preview: (
        <div className="flex flex-wrap items-center gap-3 w-full">
          <div className="rounded-md flex items-center justify-center text-fluid-sm bg-background border-2 border-border px-4 py-2 min-w-[100px] h-10">
            Border
          </div>
          <Input
            className="h-10 min-w-[180px] flex-1 max-w-[240px]"
            placeholder="Input text"
            value={inputPreviewValue}
            onChange={(e) => setInputPreviewValue(e.target.value)}
          />
        </div>
      ),
      rows: [
        { key: "border", label: "Border", defaultValue: "214.3 31.8% 91.4%" },
        { key: "input", label: "Input border", defaultValue: "214.3 31.8% 91.4%" },
        { key: "ring", label: "Focus ring", defaultValue: "222.2 84% 4.9%" },
      ],
    },
    {
      title: "Destructive",
      description: "Delete and danger actions",
      preview: (
        <Button type="button" variant="destructive" onClick={(e) => e.preventDefault()}>
          Delete
        </Button>
      ),
      rows: [
        { key: "destructive", label: "Destructive", defaultValue: "0 84.2% 60.2%" },
        { key: "destructiveForeground", label: "Destructive text", defaultValue: "210 40% 98%" },
      ],
    },
    {
      title: "Values & data",
      description: "Value and acquisition prices in the app",
      preview: (
        <div className="flex items-center gap-4 text-fluid-sm font-medium">
          <span className="text-[hsl(var(--value-color))]">$123.45</span>
          <span className="text-[hsl(var(--acquisition-color))]">$50.00</span>
        </div>
      ),
      rows: [
        { key: "valueColor", label: "Value color", defaultValue: "142 76% 36%" },
        { key: "acquisitionColor", label: "Acquisition color", defaultValue: "0 84% 60%" },
      ],
    },
    {
      title: "Graph",
      description: "Value history chart: axes, grid, tooltip, and lines. Toggle below to show one graph (overlay) or two separate.",
      preview: null,
      rows: [
        { key: "graphValueColor", label: "Graph value line", defaultValue: "142 76% 36%" },
        { key: "graphAcquisitionColor", label: "Graph acquisition line", defaultValue: "0 84% 60%" },
        { key: "graphAxisColor", label: "Graph axes & labels", defaultValue: "214.3 31.8% 91.4%" },
        { key: "graphGridColor", label: "Graph grid lines", defaultValue: "214.3 31.8% 91.4%" },
        { key: "graphTooltipBackground", label: "Graph tooltip background", defaultValue: "0 0% 100%" },
        { key: "graphTooltipForeground", label: "Graph tooltip text", defaultValue: "222.2 84% 4.9%" },
      ],
    },
    {
      title: "Thumbnail",
      description: "Thumbnail star and badge in item dialog; highlight is hover on overlay icons. Delete icon will use destructive color, however.",
      preview: <ThumbnailPreview />,
      rows: [
        { key: "thumbnailColor", label: "Thumbnail fill", defaultValue: "38 92% 50%" },
        { key: "thumbnailForeground", label: "Thumbnail text & icons", defaultValue: "0 0% 100%" },
        { key: "thumbnailHighlight", label: "Thumbnail highlight", defaultValue: "0 0% 100% / 0.2" },
        { key: "thumbnailHover", label: "Thumbnail icon hover", defaultValue: "0 0% 100%" },
      ],
    },
  ]

  return (
    <div className="space-y-8">
      {PREVIEW_GROUPS.map((group) => (
        <div key={group.title} className="space-y-3">
          <div>
            <h3 className="text-fluid-lg font-semibold">{group.title}</h3>
            {group.description && (
              <p className="text-fluid-sm text-muted-foreground mt-0.5">{group.description}</p>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,2fr)_1fr] gap-4 items-start">
            <PreviewBox className="w-full min-w-0">
              {group.title === "Graph" ? (
                <div className="w-full">
                  <ValueAcquisitionCharts
                    valueChartData={GRAPH_PREVIEW_VALUE_DATA}
                    acquisitionChartData={GRAPH_PREVIEW_ACQUISITION_DATA}
                    graphOverlay={theme.graphOverlay !== false}
                    height={220}
                  />
                </div>
              ) : (
                group.preview
              )}
            </PreviewBox>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
              {group.rows.map((row) => (
                <ColorPicker
                  key={row.key}
                  label={row.label}
                  value={(theme[row.key] as string) || row.defaultValue}
                  onChange={(v) => handleColorChange(row.key, v)}
                  className="min-w-0"
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <div>
          <h3 className="text-fluid-lg font-semibold">Charts</h3>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            Box stats: draw value and acquisition on one graph or two separate graphs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            id="theme-graph-overlay"
            checked={theme.graphOverlay !== false}
            onCheckedChange={handleGraphOverlayChange}
          />
          <Label htmlFor="theme-graph-overlay" className="text-fluid-sm">
            Draw value and acquisition on one graph (overlay)
          </Label>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-fluid-lg font-semibold">Roundedness</h3>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            Border radius for cards, buttons, and inputs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Label className="sr-only">Border radius</Label>
          <Select value={theme.radius || "0.5rem"} onValueChange={handleRadiusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Medium" />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Card
            className="h-10 w-24 flex items-center justify-center text-fluid-xs shrink-0"
            style={{ borderRadius: theme.radius || "0.5rem" }}
          >
            Preview
          </Card>
        </div>
      </div>
    </div>
  )
}
