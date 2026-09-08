export function NicknameMark({ nickname }: { nickname: string }) {
  const initial = Array.from(nickname.trim() || "?")[0]?.toUpperCase() ?? "?"
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-light-muted text-fluid-xs text-foreground"
      aria-hidden
    >
      {initial}
    </span>
  )
}
