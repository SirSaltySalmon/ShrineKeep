"use client"

import { useState } from "react"
import type { CSSProperties } from "react"
import { useRouter } from "next/navigation"
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
import type { Theme } from "@/lib/types"
import { THEME_EDITOR_GROUPS, getThemeColorMeta, type ThemeColorKey } from "@/lib/theme-colors"
import { FONT_OPTIONS, FONT_FAMILY_CSS, DEFAULT_FONT_FAMILY, type FontFamilyId } from "@/lib/fonts"
import { applyColorScheme, getDefaultColorScheme, type ThemePreset } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { Selectable } from "@/components/selectable"
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

const RADIUS_OPTIONS = [
  { value: "0", label: "None" },
  { value: "0.25rem", label: "Small" },
  { value: "0.5rem", label: "Medium" },
  { value: "0.75rem", label: "Large" },
] as const

export interface ThemeEditorProps {
  theme: Theme
  setTheme: (s: Theme | ((prev: Theme) => Theme)) => void
  setSelectedPreset: (p: ThemePreset) => void
  fontFamily: FontFamilyId
  setFontFamily: (f: FontFamilyId) => void
  /** Chart overlay preference (Options); used only for graph preview in this editor. */
  graphOverlay?: boolean
}

function PreviewBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center min-h-[2.5rem] p-3 rounded-lg border border-border bg-light-muted",
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

/** Border preview: click to toggle selection, shows selection ring when selected (like item cards). */
function BorderPreviewSelectable() {
  const [selected, setSelected] = useState(false)
  return (
    <Selectable
      role="button"
      tabIndex={0}
      selected={selected}
      selectionMode={true}
      isOver={false}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setSelected((prev) => !prev)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setSelected((prev) => !prev)
        }
      }}
    >
      <div className="rounded-md flex items-center justify-center text-fluid-sm bg-light-muted border-2 border-border px-4 py-2 min-w-[100px] h-10">
        Selectable
      </div>
    </Selectable>
  )
}

export function ThemeEditor({ theme, setTheme, setSelectedPreset, fontFamily, setFontFamily, graphOverlay = true }: ThemeEditorProps) {
  const router = useRouter()
  const [savingTheme, setSavingTheme] = useState(false)
  const [savedTheme, setSavedTheme] = useState(false)

  const handleSaveTheme = async () => {
    setSavingTheme(true)
    setSavedTheme(false)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, font_family: fontFamily }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "Failed to save theme")
      setSavedTheme(true)
      setTimeout(() => setSavedTheme(false), 3000)
      router.refresh()
    } catch (err) {
      console.error("Error saving theme:", err)
      alert(err instanceof Error ? err.message : "Failed to save theme. Please try again.")
    } finally {
      setSavingTheme(false)
    }
  }

  const handleResetTheme = () => {
    setTheme({
      ...getDefaultColorScheme(),
      radius: "0.5rem",
    })
    setFontFamily(DEFAULT_FONT_FAMILY)
    setSelectedPreset("light")
  }
  

  const handleColorChange = (key: ThemeColorKey, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }))
    setSelectedPreset("custom")
  }

  const handleRadiusChange = (value: string) => {
    setTheme((prev) => ({ ...prev, radius: value }))
    setSelectedPreset("custom")
  }

  const [inputPreviewValue, setInputPreviewValue] = useState("")

  const GROUP_PREVIEWS: (React.ReactNode | null)[] = [
    <div key="page" className="flex flex-wrap items-center gap-3">
      <div className="rounded-lg border border-border p-4 bg-background text-foreground text-fluid-sm">
        Page
      </div>
      <Card className="min-w-[200px]">
        <CardHeader className="p-4">
          <CardTitle className="text-fluid-sm">Card title</CardTitle>
        </CardHeader>
      </Card>
      <DropdownPreview />
    </div>,
    <div key="buttons" className="flex flex-wrap items-center gap-2">
      <Button type="button" onClick={(e) => e.preventDefault()}>
        Save
      </Button>
      <Button type="button" variant="secondary" onClick={(e) => e.preventDefault()}>
        Copy
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
    </div>,
    <div key="borders" className="flex flex-wrap items-center gap-3 w-full">
      <BorderPreviewSelectable />
      <Input
        className="h-10 min-w-[180px] flex-1 max-w-[240px]"
        placeholder="Input text"
        value={inputPreviewValue}
        onChange={(e) => setInputPreviewValue(e.target.value)}
      />
    </div>,
    <Button key="destructive" type="button" variant="destructive" onClick={(e) => e.preventDefault()}>
      Delete
    </Button>,
    <div key="values" className="flex items-center gap-4 text-fluid-sm font-medium">
      <span className="text-[hsl(var(--value-color))]">$123.45</span>
      <span className="text-[hsl(var(--acquisition-color))]">$50.00</span>
    </div>,
    null,
    <ThumbnailPreview key="thumbnail" />,
    <div key="tags" className="flex flex-wrap gap-2">
      {(["red", "orange", "yellow", "green", "blue", "indigo", "violet"] as const).map((c) => (
        <span
          key={c}
          className="rounded-md px-2 py-1 text-fluid-xs font-medium"
          style={{
            background: `hsl(var(--tag-${c}))`,
            color: "hsl(var(--tag-foreground))",
          }}
        >
          {c}
        </span>
      ))}
    </div>,
  ]

  return (
    <div className="space-y-8">
      {THEME_EDITOR_GROUPS.map((group, i) => (
        <div key={group.id} className="space-y-3">
          <div>
            <h3 className="text-fluid-lg font-semibold">{group.title}</h3>
          </div>
          <div className="space-y-4">
            <PreviewBox className="w-full min-w-0">
              {group.id === "graph" ? (
                <div className="w-full">
                  <ValueAcquisitionCharts
                    valueChartData={GRAPH_PREVIEW_VALUE_DATA}
                    acquisitionChartData={GRAPH_PREVIEW_ACQUISITION_DATA}
                    graphOverlay={graphOverlay}
                    height={220}
                  />
                </div>
              ) : (
                GROUP_PREVIEWS[i]
              )}
            </PreviewBox>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
              {group.keys.map((key) => {
                const meta = getThemeColorMeta(key)
                return (
                  <ColorPicker
                    key={key}
                    label={meta.label}
                    value={(theme[key] as string) ?? meta.defaultLight}
                    onChange={(v) => handleColorChange(key, v)}
                    className="min-w-0"
                  />
                )
              })}
            </div>
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <div>
          <h3 className="text-fluid-lg font-semibold">Typography</h3>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            Font used for the app interface. Exported with theme files.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Label className="sr-only">Font family</Label>
          <Select
            value={fontFamily}
            onValueChange={(v) => {
              setFontFamily(v as FontFamilyId)
              setSelectedPreset("custom")
            }}
          >
            <SelectTrigger className="w-[220px]" style={{ fontFamily: FONT_FAMILY_CSS[fontFamily] }}>
              <SelectValue placeholder="Inter" />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span style={{ fontFamily: FONT_FAMILY_CSS[opt.value] }}>
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-fluid-sm text-muted-foreground">
            Sample: The quick brown fox jumps over the lazy dog
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-fluid-lg font-semibold">Roundedness</h3>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            Border radius for cards, buttons, and inputs. Exported with theme files.
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
        <div 
          className="rounded-md"
          style={
                applyColorScheme(getDefaultColorScheme(), {
                  fontFamily: FONT_FAMILY_CSS[DEFAULT_FONT_FAMILY],
                }) as CSSProperties
              }
        >
          <Button onClick={handleResetTheme} variant="outline">
            Reset to Light Mode
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        {savedTheme && (
          <span className="text-fluid-sm text-muted-foreground self-center">Theme saved!</span>
        )}
        <Button type="button" onClick={handleSaveTheme} disabled={savingTheme}>
          {savingTheme ? "Saving..." : "Save theme"}
        </Button>
      </div>
    </div>
  )
}
