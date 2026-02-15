"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
} from "@/lib/validation"
import TurnstileWidget, { type TurnstileWidgetRef } from "@/components/turnstile-widget"
import { User } from "lucide-react"

const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2MB
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
const AVATAR_SIZE = 256 // Output square size in pixels

/**
 * Crop image to center square and resize to AVATAR_SIZE, return as JPEG File.
 * Caller should use only the returned File for upload; original file is not used after this.
 */
function cropImageToSquare(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    const cleanup = () => {
      URL.revokeObjectURL(url)
      img.src = ""
    }

    img.onload = () => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      const s = Math.floor(Math.min(w, h))
      const sx = Math.floor((w - s) / 2)
      const sy = Math.floor((h - s) / 2)

      const canvas = document.createElement("canvas")
      canvas.width = AVATAR_SIZE
      canvas.height = AVATAR_SIZE
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        cleanup()
        reject(new Error("Canvas not supported"))
        return
      }
      ctx.drawImage(img, sx, sy, s, s, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

      canvas.toBlob(
        (blob) => {
          cleanup()
          if (blob) {
            resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }))
          } else {
            reject(new Error("Failed to encode image"))
          }
        },
        "image/jpeg",
        0.88
      )
    }
    img.onerror = () => {
      cleanup()
      reject(new Error("Failed to load image"))
    }
    img.src = url
  })
}

export interface PersonalSettingsProps {
  /** Display name stored in public.users (editable). */
  displayName: string
  /** Whether to show custom display name (true) or provider name (false). */
  useCustomDisplayName: boolean
  /** Name from auth provider (e.g. Google); shown when useCustomDisplayName is false. */
  providerName: string | null
  /** Current email (for display). */
  email: string
  /** True if user signed up with email/password (can change password). */
  isEmailProvider: boolean
  /** Current avatar URL (from public.users or provider). */
  avatarUrl: string | null
  /** Incremented when avatar changes; used to cache-bust the image URL. */
  avatarVersion?: number
  /** Current user id (for storage path). */
  userId: string
  onDisplayNameChange: (value: string) => void
  onUseCustomDisplayNameChange: (value: boolean) => void
  onAvatarChange: (url: string | null) => void
}

export function PersonalSettings({
  displayName,
  useCustomDisplayName,
  providerName,
  email,
  isEmailProvider,
  avatarUrl,
  avatarVersion,
  userId,
  onDisplayNameChange,
  onUseCustomDisplayNameChange,
  onAvatarChange,
}: PersonalSettingsProps) {
  const supabase = createSupabaseClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  const router = useRouter()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedProfile, setSavedProfile] = useState(false)

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    setSavedProfile(false)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_custom_display_name: useCustomDisplayName,
          name: displayName,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "Failed to save profile")
      setSavedProfile(true)
      setTimeout(() => setSavedProfile(false), 3000)
      router.refresh()
    } catch (err) {
      console.error("Error saving profile:", err)
      alert(err instanceof Error ? err.message : "Failed to save profile. Please try again.")
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.")
      return
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      setPasswordError(PASSWORD_LENGTH_MESSAGE)
      return
    }
    if (!captchaToken) {
      setPasswordError("Please complete the captcha verification.")
      return
    }
    setPasswordLoading(true)
    try {
      const res = await fetch("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          captchaToken,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPasswordError(data?.error ?? "Failed to update password.")
        setCaptchaToken(null)
        turnstileRef.current?.reset()
        setPasswordLoading(false)
        return
      }
      setPasswordSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setCaptchaToken(null)
      turnstileRef.current?.reset()
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch {
      setPasswordError("Something went wrong. Please try again.")
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setAvatarError(null)
    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Please choose a JPEG, PNG, GIF, or WebP image.")
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("Image must be 2 MB or smaller.")
      return
    }
    setAvatarUploading(true)
    try {
      const croppedFile = await cropImageToSquare(file)
      const path = `${userId}/avatar.jpg`
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, croppedFile, {
        upsert: true,
        contentType: "image/jpeg",
      })
      if (uploadError) {
        setAvatarError(uploadError.message)
        setAvatarUploading(false)
        return
      }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path)
      const url = urlData.publicUrl
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url }),
      })
      if (!res.ok) {
        setAvatarError("Failed to save avatar.")
        setAvatarUploading(false)
        return
      }
      onAvatarChange(url)
    } catch {
      setAvatarError("Something went wrong. Please try again.")
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarError(null)
    setAvatarUploading(true)
    try {
      const res = await fetch("/api/users/me/avatar", { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAvatarError(data?.error ?? "Failed to remove avatar.")
        setAvatarUploading(false)
        return
      }
      onAvatarChange(null)
    } catch {
      setAvatarError("Something went wrong. Please try again.")
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-fluid-lg font-semibold mb-2">Profile photo</h3>
        {isEmailProvider ? (
          <>
            <p className="text-fluid-sm text-muted-foreground mb-4">
              Upload an image to use as your avatar (JPEG, PNG, GIF, or WebP, max 2 MB). It will be automatically cropped.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                {avatarUrl ? (
                  <img
                    src={avatarVersion != null ? `${avatarUrl}?v=${avatarVersion}` : avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={AVATAR_TYPES.join(",")}
                  onChange={handleAvatarFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarUploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={avatarUploading}
                    onClick={handleRemoveAvatar}
                  >
                    Remove photo
                  </Button>
                )}
              </div>
            </div>
            {avatarError && (
              <p className="text-fluid-sm text-destructive mt-2">{avatarError}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-fluid-sm text-muted-foreground mb-4">
              The avatar is provided by your sign-in account (e.g. Google) and cannot be changed
              here.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                {avatarUrl ? (
                  <img
                    src={avatarVersion != null ? `${avatarUrl}?v=${avatarVersion}` : avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-fluid-lg font-semibold mb-2">Display name</h3>
        {isEmailProvider ? (
          <>
            <p className="text-fluid-sm text-muted-foreground mb-4">
              This is the name you set when you signed up. Change it below and click Save profile to
              update it everywhere.
            </p>
          </>
        ) : (
          <>
            <p className="text-fluid-sm text-muted-foreground mb-4">
              Choose whether to show a custom name or the name from your sign-in account (e.g.
              Google).
            </p>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="space-y-0.5">
                <span className="text-fluid-sm font-medium">Use custom display name</span>
                <p className="text-fluid-xs text-muted-foreground">
                  {useCustomDisplayName
                    ? "Showing your custom name below."
                    : `Showing provider name${providerName ? `: ${providerName}` : ""}.`}
                </p>
              </div>
              <Switch
                checked={useCustomDisplayName}
                onCheckedChange={onUseCustomDisplayNameChange}
                aria-label="Use custom display name"
              />
            </div>
          </>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder={providerName || "Your name"}
          className="max-w-sm"
          maxLength={NAME_MAX_LENGTH}
        />
      </div>
      <div className="flex gap-2">
        {savedProfile && (
          <span className="text-fluid-sm text-muted-foreground self-center">Profile saved!</span>
        )}
        <Button type="button" onClick={handleSaveProfile} disabled={savingProfile}>
          {savingProfile ? "Saving..." : "Save profile"}
        </Button>
      </div>

      {isEmailProvider && (
        <>
          <div>
            <h3 className="text-fluid-lg font-semibold mb-2">Change password</h3>
            <p className="text-fluid-sm text-muted-foreground mb-4">
              Enter your current password and choose a new one. Complete the captcha to continue.
            </p>
            <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
              <div className="space-y-2">
                <Label htmlFor="current-password">
                  Current password
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  Confirm new password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2 flex justify-start">
                <TurnstileWidget ref={turnstileRef} onSuccess={setCaptchaToken} />
              </div>
              {passwordError && (
                <div className="space-y-1 form-error-message">
                  <p className="text-fluid-sm text-destructive">{passwordError}</p>
                  {passwordError !== "Please complete the captcha verification." && (
                    <p className="text-fluid-xs text-muted-foreground">
                      Complete the captcha again to try again.
                    </p>
                  )}
                </div>
              )}
              {passwordSuccess && (
                <p className="text-fluid-sm text-green-600 dark:text-green-400">
                  Password updated.
                </p>
              )}
              <Button type="submit" disabled={passwordLoading || !captchaToken}>
                {passwordLoading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </div>
        </>
      )}

      {!isEmailProvider && (
        <div>
          <h3 className="text-fluid-lg font-semibold mb-2">Account</h3>
          <p className="text-fluid-sm text-muted-foreground">
            You signed in with a provider (e.g. Google). Password and email are managed by that
            account. Current email: {email}
          </p>
        </div>
      )}
    </div>
  )
}
