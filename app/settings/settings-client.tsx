"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ThemeEditor } from "@/components/settings/theme-editor"
import { OptionsSettings } from "@/components/settings/options-settings"
import { WishlistSettings } from "@/components/settings/wishlist-settings"
import { PersonalSettings } from "@/components/settings/personal-settings"
import TagSettings from "@/components/settings/tag-settings"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  getDefaultColorScheme,
  getColorSchemeByPreset,
  parseImportedColorScheme,
  buildThemeExport,
  applyColorScheme,
  COLOR_SCHEME_PRESETS,
  type ThemePreset,
} from "@/lib/settings"
import { DEFAULT_FONT_FAMILY, FONT_FAMILY_CSS } from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"
import { UserSettings, Theme } from "@/lib/types"
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
  const [theme, setTheme] = useState<Theme>(
    initialSettings?.color_scheme || getDefaultColorScheme()
  )
  const [selectedPreset, setSelectedPreset] = useState<ThemePreset>(
    initialSettings?.color_scheme ? "custom" : "light"
  )
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(
    (initialSettings?.font_family as FontFamilyId) || DEFAULT_FONT_FAMILY
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

  // Apply theme and font immediately for preview
  useEffect(() => {
    const root = document.documentElement
    const cssVars = applyColorScheme(theme)
    Object.entries(cssVars).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })
    const fontCss = FONT_FAMILY_CSS[fontFamily]
    if (fontCss) root.style.setProperty("--font-sans", fontCss)
    return () => {
      // Don't reset on unmount - let ThemeProvider handle it
    }
  }, [theme, fontFamily])

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
          theme,
          font_family: fontFamily,
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

  const handleResetTheme = () => {
    setTheme((prev) => ({ ...getDefaultColorScheme(), graphOverlay: prev?.graphOverlay ?? true }))
    setSelectedPreset("light")
  }

  const handlePresetChange = (preset: ThemePreset) => {
    setSelectedPreset(preset)
    if (preset !== "custom") {
      setTheme((prev) => ({ ...getColorSchemeByPreset(preset), graphOverlay: prev?.graphOverlay ?? true }))
    }
  }

  const handleImportTheme = () => {
    fileInputRef.current?.click()
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const imported = parseImportedColorScheme(text)

      if (imported) {
        setTheme((prev) => ({
          ...getDefaultColorScheme(),
          ...imported.theme,
          graphOverlay: prev?.graphOverlay ?? true,
        }))
        if (imported.fontFamily) setFontFamily(imported.fontFamily)
        setSelectedPreset("custom")
        alert("Theme imported successfully!")
      } else {
        alert("Invalid theme format. Please ensure the file contains valid JSON with colors, optional radius and font_family.")
      }
    } catch (error) {
      console.error("Error importing theme:", error)
      alert("Failed to import theme. Please check the file format.")
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleExportTheme = () => {
    const data = buildThemeExport(theme, fontFamily)
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "theme.json"
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
              <TabsTrigger value="theme" className="whitespace-nowrap shrink-0">Theme</TabsTrigger>
              <TabsTrigger value="options" className="whitespace-nowrap shrink-0">Options</TabsTrigger>
              <TabsTrigger value="wishlist" className="whitespace-nowrap shrink-0">Wishlist</TabsTrigger>
              <TabsTrigger value="tags" className="whitespace-nowrap shrink-0">Tags</TabsTrigger>
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

          <TabsContent value="theme" className="space-y-6 mt-6 min-w-0">
            <div>
              <h2 className="text-fluid-xl font-semibold mb-2">Theme</h2>
              <p className="text-fluid-sm text-muted-foreground mb-4">
                Customize the appearance of your ShrineKeep interface. Changes
                are applied immediately for preview.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Theme preset</Label>
              <div className="flex gap-2 items-center">
                <Select
                  value={selectedPreset}
                  onValueChange={(value) => handlePresetChange(value as ThemePreset)}
                >
                  <SelectTrigger className="flex-1 min-w-0">
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COLOR_SCHEME_PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleImportTheme}
                  className="shrink-0"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportTheme}
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
                Select a preset or import a custom theme JSON file
              </p>
            </div>

            <ThemeEditor
              theme={theme}
              setTheme={setTheme}
              setSelectedPreset={setSelectedPreset}
              fontFamily={fontFamily}
              setFontFamily={setFontFamily}
            />

            <div className="flex gap-2">
              <Button onClick={handleResetTheme} variant="outline">
                Reset to Light Mode
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="options" className="mt-6 min-w-0">
            <OptionsSettings
              graphOverlay={theme.graphOverlay !== false}
              onGraphOverlayChange={(checked) => setTheme((prev) => ({ ...prev, graphOverlay: checked }))}
            />
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

          <TabsContent value="tags" className="mt-6 min-w-0">
            <TagSettings />
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
