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

interface ColorPickerProps {
  value: string // HSL format: "222.2 47.4% 11.2%"
  onChange: (value: string) => void
  label?: string
  className?: string
}

export function ColorPicker({ value, onChange, label, className }: ColorPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Convert HSL to hex for the picker
  const hexValue = React.useMemo(() => {
    try {
      return hslToHex(value)
    } catch {
      return "#000000"
    }
  }, [value])

  // Convert hex back to HSL format
  const handleColorChange = (hex: string) => {
    try {
      const hsl = hexToHsl(hex)
      onChange(hsl)
    } catch (error) {
      console.error("Error converting color:", error)
    }
  }

  // Close picker when clicking outside
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
          style={{ backgroundColor: `hsl(${value})` }}
          aria-label={`Pick color for ${label || "color"}`}
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="222.2 47.4% 11.2%"
          className="flex-1 min-w-0"
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
