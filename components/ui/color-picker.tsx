"use client"

import * as React from "react"
import { HexColorPicker } from "react-colorful"
import { cn } from "@/lib/utils"
import { hslToHex, hexToHsl } from "@/lib/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Re-export for convenience
export { hslToHex, hexToHsl }

/** Normalize to 6-digit hex with #; return null if invalid. */
function normalizeHex(input: string): string | null {
  const s = input.replace(/^#/, "").trim()
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`
  if (/^[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[0] + s[0]
    const g = s[1] + s[1]
    const b = s[2] + s[2]
    return `#${r}${g}${b}`
  }
  return null
}

interface ColorPickerProps {
  value: string // HSL format: "222.2 47.4% 11.2%" (stored in theme)
  onChange: (value: string) => void
  label?: string
  className?: string
}

export function ColorPicker({ value, onChange, label, className }: ColorPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Canonical hex for picker and display
  const hexValue = React.useMemo(() => {
    try {
      return hslToHex(value)
    } catch {
      return "#000000"
    }
  }, [value])

  const [inputHex, setInputHex] = React.useState(hexValue)
  React.useEffect(() => {
    setInputHex(hexValue)
  }, [hexValue])

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setInputHex(v)
    const normalized = normalizeHex(v)
    if (normalized) {
      try {
        onChange(hexToHsl(normalized))
      } catch {
        // ignore invalid
      }
    }
  }

  const handleHexInputBlur = () => {
    setInputHex(hexValue)
  }

  const handleColorChange = (hex: string) => {
    try {
      onChange(hexToHsl(hex))
    } catch (error) {
      console.error("Error converting color:", error)
    }
  }

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && (
        <Label className="mb-2 block">{label}</Label>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 shrink-0 border-2"
          style={{ backgroundColor: hexValue }}
          aria-label={`Pick color for ${label || "color"}`}
        />
        <Input
          type="text"
          value={inputHex}
          onChange={handleHexInputChange}
          onBlur={handleHexInputBlur}
          placeholder="#000000"
          className="flex-1 min-w-0 font-mono text-fluid-sm"
        />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-2 p-3 bg-popover border border-border rounded-md shadow-lg">
          <HexColorPicker color={hexValue} onChange={handleColorChange} />
        </div>
      )}
    </div>
  )
}
