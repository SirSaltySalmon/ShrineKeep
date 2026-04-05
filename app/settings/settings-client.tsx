"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { PersonalSettings } from "@/components/settings/personal-settings"
import TagSettings from "@/components/settings/tag-settings"
import BillingSettings from "@/components/settings/billing-settings"
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
import {
  DEFAULT_BODY_FONT_FAMILY,
  DEFAULT_HEADER_FONT_FAMILY,
  FONT_FAMILY_CSS,
} from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"
import { UserSettings, Theme } from "@/lib/types"
import { Upload } from "lucide-react"

const SETTINGS_TABS = ["personal", "theme", "options", "tags", "billing"] as const

function isSettingsTab(value: string | null): value is (typeof SETTINGS_TABS)[number] {
  return value !== null && (SETTINGS_TABS as readonly string[]).includes(value)
}

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
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState<(typeof SETTINGS_TABS)[number]>(() =>
    isSettingsTab(tabFromUrl) ? tabFromUrl : "personal"
  )

  useEffect(() => {
    const t = searchParams.get("tab")
    if (isSettingsTab(t)) setActiveTab(t)
  }, [searchParams])

  const [theme, setTheme] = useState<Theme>(() => {
    const cs = initialSettings?.color_scheme as Theme | undefined
    if (!cs || typeof cs !== "object") return getDefaultColorScheme()
    const { graphOverlay: _, ...rest } = cs as Theme & { graphOverlay?: boolean }
    return { ...getDefaultColorScheme(), ...rest }
  })
  const [selectedPreset, setSelectedPreset] = useState<ThemePreset>(
    initialSettings?.color_scheme ? "custom" : "light"
  )
  const [headerFontFamily, setHeaderFontFamily] = useState<FontFamilyId>(
    (initialSettings?.header_font_family as FontFamilyId) || DEFAULT_HEADER_FONT_FAMILY
  )
  const [bodyFontFamily, setBodyFontFamily] = useState<FontFamilyId>(
    (initialSettings?.body_font_family as FontFamilyId) || DEFAULT_BODY_FONT_FAMILY
  )
  const [graphOverlay, setGraphOverlay] = useState(
    initialSettings?.graph_overlay ?? true
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Apply theme and font immediately for preview
  useEffect(() => {
    const root = document.documentElement
    const cssVars = applyColorScheme(theme)
    Object.entries(cssVars).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })
    const headerCss = FONT_FAMILY_CSS[headerFontFamily]
    const bodyCss = FONT_FAMILY_CSS[bodyFontFamily]
    if (headerCss) root.style.setProperty("--font-heading", headerCss)
    if (bodyCss) root.style.setProperty("--font-sans", bodyCss)
    return () => {
      // Don't reset on unmount - let ThemeProvider handle it
    }
  }, [theme, headerFontFamily, bodyFontFamily])

  const handleResetTheme = () => {
    setTheme({
      ...getDefaultColorScheme(),
      radius: "0.5rem",
    })
    setHeaderFontFamily(DEFAULT_HEADER_FONT_FAMILY)
    setBodyFontFamily(DEFAULT_BODY_FONT_FAMILY)
    setSelectedPreset("light")
  }

  const handlePresetChange = (preset: ThemePreset) => {
    setSelectedPreset(preset)
    if (preset !== "custom") {
      const presetScheme = getColorSchemeByPreset(preset)
      setTheme({
        ...presetScheme,
        radius: "0.5rem",
      })
      setHeaderFontFamily(DEFAULT_HEADER_FONT_FAMILY)
      setBodyFontFamily(DEFAULT_BODY_FONT_FAMILY)
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
          radius: prev?.radius ?? "0.5rem",
        }))
        if (imported.headerFontFamily) setHeaderFontFamily(imported.headerFontFamily)
        if (imported.bodyFontFamily) setBodyFontFamily(imported.bodyFontFamily)
        setSelectedPreset("custom")
        alert("Theme imported successfully!")
      } else {
        alert(
          "Invalid theme format. Please ensure the file contains valid JSON with colors, optional radius, header_font_family, and/or body_font_family."
        )
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
    const data = buildThemeExport(theme, {
      headerFontFamily,
      bodyFontFamily,
    })
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-fluid-3xl font-bold mb-8">Settings</h1>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            const next = v as (typeof SETTINGS_TABS)[number]
            setActiveTab(next)
            router.replace(`/settings?tab=${next}`, { scroll: false })
          }}
          className="w-full"
        >
          <div className="mb-6 min-w-0 overflow-x-auto overflow-y-hidden rounded-md">
            <TabsList className="flex w-max min-w-full shrink-0 justify-center gap-1 overflow-visible">
              <TabsTrigger value="personal" className="whitespace-nowrap shrink-0">Personal</TabsTrigger>
              <TabsTrigger value="theme" className="whitespace-nowrap shrink-0">Theme</TabsTrigger>
              <TabsTrigger value="options" className="whitespace-nowrap shrink-0">Options</TabsTrigger>
              <TabsTrigger value="tags" className="whitespace-nowrap shrink-0">Tags</TabsTrigger>
              <TabsTrigger value="billing" className="whitespace-nowrap shrink-0">Billing</TabsTrigger>
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
              headerFontFamily={headerFontFamily}
              setHeaderFontFamily={setHeaderFontFamily}
              bodyFontFamily={bodyFontFamily}
              setBodyFontFamily={setBodyFontFamily}
              graphOverlay={graphOverlay}
            />
          </TabsContent>

          <TabsContent value="options" className="mt-6 min-w-0">
            <OptionsSettings
              graphOverlay={graphOverlay}
              onGraphOverlayChange={setGraphOverlay}
              wishlistIsPublic={wishlistIsPublic}
              wishlistShareToken={wishlistShareToken}
              wishlistApplyColors={wishlistApplyColors}
              onPublicChange={setWishlistIsPublic}
              onApplyColorsChange={setWishlistApplyColors}
              onShareTokenChange={setWishlistShareToken}
            />
          </TabsContent>

          <TabsContent value="tags" className="mt-6 min-w-0">
            <TagSettings />
          </TabsContent>

          <TabsContent value="billing" className="mt-6 min-w-0">
            <BillingSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
