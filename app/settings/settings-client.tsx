"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import { WishlistSettings } from "@/components/settings/wishlist-settings"
import { PersonalSettings } from "@/components/settings/personal-settings"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  getDefaultColorScheme,
  getColorSchemeByPreset,
  parseImportedColorScheme,
  applyColorScheme,
  COLOR_SCHEME_PRESETS,
  type ColorSchemePreset,
} from "@/lib/settings"
import { UserSettings, ColorScheme } from "@/lib/types"
import { Upload } from "lucide-react"

export interface InitialProfile {
  displayName: string
  useCustomDisplayName: boolean
  providerName: string | null
  email: string
  isEmailProvider: boolean
  avatarUrl: string | null
  userId: string
}

interface SettingsClientProps {
  initialSettings: UserSettings | null
  initialProfile: InitialProfile
}

export default function SettingsClient({ initialSettings, initialProfile }: SettingsClientProps) {
  const router = useRouter()
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    initialSettings?.color_scheme || getDefaultColorScheme()
  )
  const [selectedPreset, setSelectedPreset] = useState<ColorSchemePreset>(
    initialSettings?.color_scheme ? "custom" : "light"
  )
  const [wishlistIsPublic, setWishlistIsPublic] = useState(
    initialSettings?.wishlist_is_public || false
  )
  const [wishlistShareToken, setWishlistShareToken] = useState<string | null>(
    initialSettings?.wishlist_share_token || null
  )
  const [wishlistApplyColors, setWishlistApplyColors] = useState(
    initialSettings?.wishlist_apply_colors || false
  )
  const [useCustomDisplayName, setUseCustomDisplayName] = useState(
    initialProfile.useCustomDisplayName
  )
  const [displayName, setDisplayName] = useState(initialProfile.displayName)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatarUrl)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Apply colors immediately for preview
  useEffect(() => {
    const cssVars = applyColorScheme(colorScheme)
    const root = document.documentElement

    Object.entries(cssVars).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })

    return () => {
      // Don't reset on unmount - let ThemeProvider handle it
    }
  }, [colorScheme])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          color_scheme: colorScheme,
          wishlist_is_public: wishlistIsPublic,
          wishlist_apply_colors: wishlistApplyColors,
          use_custom_display_name: useCustomDisplayName,
          name: displayName,
        }),
      })

      const updated = await response.json()

      if (!response.ok) {
        throw new Error(updated?.error ?? "Failed to save settings")
      }

      setWishlistShareToken(updated.wishlist_share_token)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (error) {
      console.error("Error saving settings:", error)
      alert(error instanceof Error ? error.message : "Failed to save settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleResetColors = () => {
    setColorScheme(getDefaultColorScheme())
    setSelectedPreset("light")
  }

  const handlePresetChange = (preset: ColorSchemePreset) => {
    setSelectedPreset(preset)
    if (preset !== "custom") {
      setColorScheme(getColorSchemeByPreset(preset))
    }
  }

  const handleImportColors = () => {
    fileInputRef.current?.click()
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const importedScheme = parseImportedColorScheme(text)

      if (importedScheme) {
        setColorScheme(importedScheme)
        setSelectedPreset("custom")
        alert("Color scheme imported successfully!")
      } else {
        alert("Invalid color scheme format. Please ensure the file contains valid JSON with HSL color values.")
      }
    } catch (error) {
      console.error("Error importing colors:", error)
      alert("Failed to import color scheme. Please check the file format.")
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleExportColors = () => {
    const json = JSON.stringify(colorScheme, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "color-scheme.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRegenerateToken = async () => {
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          regenerate_wishlist_token: true,
        }),
      })

      const updated = await response.json()
      if (!response.ok) {
        throw new Error(updated?.error ?? "Failed to regenerate token")
      }
      setWishlistShareToken(updated.wishlist_share_token ?? null)
      router.refresh()
    } catch (error) {
      console.error("Error regenerating token:", error)
      alert("Failed to regenerate token. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-fluid-3xl font-bold mb-8">Settings</h1>

        <Tabs defaultValue="personal" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4 mb-6">
            <TabsList className="inline-flex w-auto min-w-full">
              <TabsTrigger value="personal" className="whitespace-nowrap shrink-0">Personal</TabsTrigger>
              <TabsTrigger value="colors" className="whitespace-nowrap shrink-0">Color</TabsTrigger>
              <TabsTrigger value="wishlist" className="whitespace-nowrap shrink-0">Wishlist</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="personal" className="space-y-6 mt-6 min-w-0">
            <PersonalSettings
              displayName={displayName}
              useCustomDisplayName={useCustomDisplayName}
              providerName={initialProfile.providerName}
              email={initialProfile.email}
              isEmailProvider={initialProfile.isEmailProvider}
              avatarUrl={avatarUrl}
              avatarVersion={avatarVersion}
              userId={initialProfile.userId}
              onDisplayNameChange={setDisplayName}
              onUseCustomDisplayNameChange={setUseCustomDisplayName}
              onAvatarChange={(url) => {
                setAvatarUrl(url)
                setAvatarVersion((v) => v + 1)
                router.refresh()
              }}
            />
          </TabsContent>

          <TabsContent value="colors" className="space-y-6 mt-6 min-w-0">
            <div>
              <h2 className="text-fluid-xl font-semibold mb-2">Color Scheme</h2>
              <p className="text-fluid-sm text-muted-foreground mb-4">
                Customize the appearance of your ShrineKeep interface. Changes
                are applied immediately for preview.
              </p>
            </div>

            {/* Preset Selector */}
            <div className="space-y-2">
              <label className="text-fluid-sm font-medium">Color Scheme Preset</label>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(e.target.value as ColorSchemePreset)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {Object.entries(COLOR_SCHEME_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleImportColors}
                  className="shrink-0"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportColors}
                  className="shrink-0"
                >
                  Export
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </div>
              <p className="text-fluid-xs text-muted-foreground">
                Select a preset or import a custom color scheme JSON file
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorPicker
                label="Background"
                value={colorScheme.background || "0 0% 100%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, background: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Foreground"
                value={colorScheme.foreground || "222.2 84% 4.9%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, foreground: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Card"
                value={colorScheme.card || "0 0% 100%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, card: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Card Foreground"
                value={colorScheme.cardForeground || "222.2 84% 4.9%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, cardForeground: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Popover"
                value={colorScheme.popover || "0 0% 100%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, popover: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Popover Foreground"
                value={colorScheme.popoverForeground || "222.2 84% 4.9%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, popoverForeground: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Primary"
                value={colorScheme.primary || "222.2 47.4% 11.2%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, primary: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Primary Foreground"
                value={colorScheme.primaryForeground || "210 40% 98%"}
                onChange={(value) => {
                  setColorScheme({
                    ...colorScheme,
                    primaryForeground: value,
                  })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Secondary"
                value={colorScheme.secondary || "210 40% 96.1%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, secondary: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Secondary Foreground"
                value={colorScheme.secondaryForeground || "222.2 47.4% 11.2%"}
                onChange={(value) => {
                  setColorScheme({
                    ...colorScheme,
                    secondaryForeground: value,
                  })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Muted"
                value={colorScheme.muted || "210 40% 96.1%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, muted: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Muted Foreground"
                value={colorScheme.mutedForeground || "215.4 16.3% 46.9%"}
                onChange={(value) => {
                  setColorScheme({
                    ...colorScheme,
                    mutedForeground: value,
                  })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Accent"
                value={colorScheme.accent || "210 40% 96.1%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, accent: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Accent Foreground"
                value={colorScheme.accentForeground || "222.2 47.4% 11.2%"}
                onChange={(value) => {
                  setColorScheme({
                    ...colorScheme,
                    accentForeground: value,
                  })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Destructive"
                value={colorScheme.destructive || "0 84.2% 60.2%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, destructive: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Destructive Foreground"
                value={colorScheme.destructiveForeground || "210 40% 98%"}
                onChange={(value) => {
                  setColorScheme({
                    ...colorScheme,
                    destructiveForeground: value,
                  })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Border"
                value={colorScheme.border || "214.3 31.8% 91.4%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, border: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Input"
                value={colorScheme.input || "214.3 31.8% 91.4%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, input: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Ring"
                value={colorScheme.ring || "222.2 84% 4.9%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, ring: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Value Color"
                value={colorScheme.valueColor || "142 76% 36%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, valueColor: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Acquisition Color"
                value={colorScheme.acquisitionColor || "0 84% 60%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, acquisitionColor: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Graph Value Color"
                value={colorScheme.graphValueColor || "142 76% 36%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, graphValueColor: value })
                  setSelectedPreset("custom")
                }}
              />
              <ColorPicker
                label="Graph Acquisition Color"
                value={colorScheme.graphAcquisitionColor || "0 84% 60%"}
                onChange={(value) => {
                  setColorScheme({ ...colorScheme, graphAcquisitionColor: value })
                  setSelectedPreset("custom")
                }}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleResetColors} variant="outline">
                Reset to Light Mode
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="wishlist" className="mt-6 min-w-0">
            <WishlistSettings
              wishlistIsPublic={wishlistIsPublic}
              wishlistShareToken={wishlistShareToken}
              wishlistApplyColors={wishlistApplyColors}
              onPublicChange={setWishlistIsPublic}
              onApplyColorsChange={setWishlistApplyColors}
              onRegenerateToken={handleRegenerateToken}
            />
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end gap-2 border-t pt-4 mt-8">
          {saved && (
            <span className="text-fluid-sm text-muted-foreground self-center">
              Settings saved!
            </span>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  )
}
