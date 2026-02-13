"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, RefreshCw } from "lucide-react"

interface WishlistSettingsProps {
  wishlistIsPublic: boolean
  wishlistShareToken: string | null
  wishlistApplyColors: boolean
  onPublicChange: (isPublic: boolean) => void
  onApplyColorsChange: (applyColors: boolean) => void
  onRegenerateToken: () => void
}

export function WishlistSettings({
  wishlistIsPublic,
  wishlistShareToken,
  wishlistApplyColors,
  onPublicChange,
  onApplyColorsChange,
  onRegenerateToken,
}: WishlistSettingsProps) {
  const [copied, setCopied] = useState(false)

  const shareUrl = wishlistShareToken
    ? `${window.location.origin}/wishlist/${wishlistShareToken}`
    : ""

  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-fluid-lg font-semibold mb-2">Wishlist Privacy</h3>
        <p className="text-fluid-sm text-muted-foreground mb-4">
          Control who can view your wishlist and how it appears.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label className="text-fluid-sm font-medium">
              Make wishlist public
            </label>
            <p className="text-fluid-xs text-muted-foreground">
              Allow others to view your wishlist via a shareable link
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={wishlistIsPublic}
              onChange={(e) => onPublicChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {wishlistIsPublic && (
          <div className="space-y-2">
            <label className="text-fluid-sm font-medium">Shareable link</label>
            <div className="flex gap-2">
              <Input
                value={shareUrl || "Save settings to get link"}
                readOnly
                className="flex-1 font-mono text-fluid-xs"
                disabled={!wishlistShareToken}
              />
              {wishlistShareToken && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      "Copied!"
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRegenerateToken}
                    className="shrink-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {wishlistIsPublic && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-fluid-sm font-medium">
                Apply custom colors to public view
              </label>
              <p className="text-fluid-xs text-muted-foreground">
                Visitors will see your wishlist with your custom color scheme
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={wishlistApplyColors}
                onChange={(e) => onApplyColorsChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
