"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export interface OptionsSettingsProps {
  /** Whether value and acquisition are drawn on one graph (overlay). */
  graphOverlay: boolean
  onGraphOverlayChange: (checked: boolean) => void
}

export function OptionsSettings({ graphOverlay, onGraphOverlayChange }: OptionsSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-fluid-xl font-semibold mb-2">Options</h2>
        <p className="text-fluid-sm text-muted-foreground mb-4">
          App behavior and display preferences.
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="text-fluid-lg font-semibold">Charts</h3>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            Box stats: draw value and acquisition on one graph or two separate graphs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            id="options-graph-overlay"
            checked={graphOverlay}
            onCheckedChange={onGraphOverlayChange}
          />
          <Label htmlFor="options-graph-overlay" className="text-fluid-sm">
            Draw value and acquisition on one graph (overlay)
          </Label>
        </div>
      </div>
    </div>
  )
}
