"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { chooseCollection, chooseWishlist } from "@/lib/sharing/sharing-draft"
import { AUDIENCES, type Audience, type SharingSettings } from "@/lib/sharing/contracts"

const AUDIENCE_LABELS: Record<Audience, string> = {
  private: "Private",
  friends: "Friends only",
  public: "Public",
}

export interface ContainerAudienceFieldsProps {
  /** Name of this container. Root uses “items not in a box”; boxes use the box name. */
  containerLabel: string
  value: SharingSettings
  onChange: (next: SharingSettings) => void
  disabled?: boolean
  idPrefix?: string
}

export function ContainerAudienceFields({
  containerLabel,
  value,
  onChange,
  disabled = false,
  idPrefix = "container",
}: ContainerAudienceFieldsProps) {
  const draft = { ...value, wishlistEdited: true, applyToDescendants: true }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-fluid-sm font-medium">{containerLabel}</h3>
        <p className="text-fluid-xs text-muted-foreground mt-0.5">
          Collection and wishlist audiences are independent. A child cannot be wider than this container
          in the same audience. Restricting narrows wider descendants; widening does not change them.
        </p>
      </div>

      <AudienceSelect
        id={`${idPrefix}-collection-audience`}
        label="Collection"
        hint="Who can see items filed in this container"
        value={value.collectionVisibility}
        disabled={disabled}
        onValueChange={(audience) => {
          const next = chooseCollection({ ...draft, wishlistEdited: false }, audience)
          onChange({
            collectionVisibility: next.collectionVisibility,
            wishlistVisibility: next.wishlistVisibility,
            shareFinancials: value.shareFinancials,
          })
        }}
      />

      <AudienceSelect
        id={`${idPrefix}-wishlist-audience`}
        label="Wishlist"
        hint="Who can see wishes associated with this container"
        value={value.wishlistVisibility}
        disabled={disabled}
        onValueChange={(audience) => {
          const next = chooseWishlist(draft, audience)
          onChange({
            collectionVisibility: value.collectionVisibility,
            wishlistVisibility: next.wishlistVisibility,
            shareFinancials: value.shareFinancials,
          })
        }}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5 min-w-0">
          <Label htmlFor={`${idPrefix}-share-financials`}>Share collection finances</Label>
          <p className="text-fluid-xs text-muted-foreground">
            Show acquisition cost and current value for collection items in this container. Totals can still
            include descendants that share theirs.
          </p>
        </div>
        <Switch
          id={`${idPrefix}-share-financials`}
          checked={value.shareFinancials}
          disabled={disabled}
          onCheckedChange={(shareFinancials) => onChange({ ...value, shareFinancials })}
        />
      </div>
    </div>
  )
}

function AudienceSelect({
  id,
  label,
  hint,
  value,
  disabled,
  onValueChange,
}: {
  id: string
  label: string
  hint: string
  value: Audience
  disabled?: boolean
  onValueChange: (audience: Audience) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} disabled={disabled} onValueChange={(next) => onValueChange(next as Audience)}>
        <SelectTrigger id={id} className="max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIENCES.map((audience) => (
            <SelectItem key={audience} value={audience}>
              {AUDIENCE_LABELS[audience]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-fluid-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
