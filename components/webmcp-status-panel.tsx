"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  Loader2,
  MessageSquareText,
  PanelRightOpen,
  PencilLine,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  WebMcpActivityItem,
  WebMcpToolStatus,
  WebMcpVisibleTool,
} from "@/lib/hooks/use-webmcp-tool"
import { cn } from "@/lib/utils"
import {
  initPrompt,
  openBoxLabel,
  valuationPrompt,
  type CoachState,
} from "@/lib/webmcp/first-run-coach"

interface VisibleTool extends WebMcpVisibleTool {
  status: WebMcpToolStatus
}

interface Props {
  page: "dashboard" | "wishlist"
  status: "ready" | "checking" | "unsupported" | "error" | "disabled"
  registeredToolCount: number
  toolCount: number
  tools: VisibleTool[]
  activity: WebMcpActivityItem[]
  invocationCount: number
  lastInvokedAt: string | null
  coach?: {
    state: CoachState
    nameDraft: string
    onNameDraft: (value: string) => void
    onContinueName: () => void
    onSkipStep: () => void
    onSkip: () => void
    onSample: () => void
    busy?: boolean
    error?: string | null
    webMcpAvailable?: boolean
  }
  completionNotice?: boolean
  onDismissCompletion?: () => void
}

const dashboardPrompts = [
  { title: "Set up a new box for my [name] collection", detail: "Research a new child-box checklist, then choose A: approve list only; B: approve and research each price; C: approve, research prices, and save evidence in descriptions (recommended for future valuations)." },
  { title: "Complete the collection in my current box", detail: "Compare the researched list with owned and wishlist cards, then stage missing cards. Choose A: list only; B: research each price; C: research and save evidence in descriptions (recommended for future valuations)." },
  { title: "Update valuations for only the items I selected", detail: "Use ShrineKeep's compact selection context instead of reading every card in the box. Uses item description for additional context." },
  { title: "Update the estimated value of what I own in this box", detail: "Research current resale values and prepare suggested updates. Uses item description for additional context." },
  { title: "Update valuations of wishlist items in this box", detail: "Stage estimated worth for wishlist cards. Expected purchase prices can be included when they need a correction. Uses item description for additional context." },
]

const wishlistPrompts = [
  { title: "Update valuations on my wishlist", detail: "Stage estimated worth for wishlist cards. Expected purchase prices can be included when they need a correction." },
  { title: "Update only the wishlist items I selected", detail: "Read the compact ShrineKeep selection and leave every unselected card alone." },
]

function formatActivityTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function connectionCopy(status: Props["status"], registeredToolCount: number, toolCount: number) {
  if (status === "ready") return `${registeredToolCount} tools available to connected AI agents.`
  if (status === "checking") return "Checking whether this browser supports WebMCP."
  if (status === "error") return `${registeredToolCount} of ${toolCount} tools connected. Some registrations failed.`
  return "WebMCP is not available in this browser. ShrineKeep still works normally."
}

function friendlyStatus(status: Props["status"]) {
  if (status === "ready") return "Ready in this browser"
  if (status === "checking") return "Connecting"
  if (status === "error") return "Some features need attention"
  return "AI access is unavailable here"
}

function ToolStatusDot({ status }: { status: WebMcpToolStatus }) {
  const label = status === "ready" ? "Available" : status === "error" ? "Registration failed" : status === "unsupported" ? "Unavailable" : status === "disabled" ? "Disabled" : "Connecting"
  return <span className="inline-flex items-center gap-1.5 text-fluid-xs text-muted-foreground">
    <span className={cn("h-1.5 w-1.5 rounded-full", status === "ready" ? "bg-primary" : status === "error" ? "bg-destructive" : status === "checking" || status === "registering" ? "animate-pulse bg-primary/60" : "bg-muted-foreground/50")} />
    {label}
  </span>
}

function ActivityStatus({ item }: { item: WebMcpActivityItem }) {
  if (item.status === "running") return <span className="inline-flex items-center gap-1 text-fluid-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />Running</span>
  if (item.status === "failed") return <span className="inline-flex items-center gap-1 text-fluid-xs text-destructive"><XCircle className="h-3.5 w-3.5" />Failed</span>
  return <span className="inline-flex items-center gap-1 text-fluid-xs text-primary"><Check className="h-3.5 w-3.5" />Completed</span>
}

export default function WebMcpStatusPanel({
  page,
  status,
  registeredToolCount,
  toolCount,
  tools,
  activity,
  invocationCount,
  lastInvokedAt,
  coach,
  completionNotice = false,
  onDismissCompletion,
}: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(completionNotice)
  const [spotlight, setSpotlight] = useState(Boolean(coach))
  const coachUserId = coach?.state.userId ?? null
  const [previousCoachUserId, setPreviousCoachUserId] = useState(coachUserId)
  const [previousCompletionNotice, setPreviousCompletionNotice] = useState(completionNotice)
  const ready = status === "ready"
  const checking = status === "checking"
  const prompts = page === "dashboard" ? dashboardPrompts : wishlistPrompts

  if (previousCoachUserId !== coachUserId) {
    setPreviousCoachUserId(coachUserId)
    setSpotlight(coachUserId !== null)
  }

  if (previousCompletionNotice !== completionNotice) {
    setPreviousCompletionNotice(completionNotice)
    if (completionNotice) setExpanded(true)
  }

  useEffect(() => {
    if (coachUserId === null) return
    const id = window.setTimeout(() => setSpotlight(false), 3000)
    return () => window.clearTimeout(id)
  }, [coachUserId])

  return <>
    {spotlight ? <div className="sk-coach-scrim" aria-hidden="true" /> : null}
    <section
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        "mb-6 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        spotlight && "relative z-50"
      )}
    >
      <div className="p-4 sm:p-5 layout-shrink-visible">
        <div className="flex flex-wrap items-center justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex min-w-0 items-center font-heading text-fluid-xl font-semibold">
                <Sparkles className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                Use AI with ShrineKeep
              </h2>
              {coach ? (
                <span className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-primary">
                  Tutorial
                </span>
              ) : null}
              <span
                className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium leading-4", status === "error" ? "bg-destructive/10 text-destructive" : !ready && "bg-muted text-muted-foreground")}
                style={ready ? { color: "hsl(var(--value-color))", backgroundColor: "hsl(var(--value-color) / 0.1)" } : undefined}
              >
                {checking ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <span className={cn("h-1 w-1 rounded-full", status === "error" ? "bg-destructive" : !ready && "bg-muted-foreground/60")} style={ready ? { backgroundColor: "hsl(var(--value-color))" } : undefined} />}
                {friendlyStatus(status)}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-fluid-sm leading-relaxed text-muted-foreground">
              ShrineKeep uses WebMCP to allow AI agents to help.{" "}
              <a
                href="https://webmcp.com/ecosystem-tracker"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Try e.g. ChatGPT desktop app
              </a>
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="agent-feature-details">
            {expanded ? <><ChevronUp className="mr-1 h-4 w-4" />Collapse</> : <><ChevronDown className="mr-1 h-4 w-4" />Expand</>}
          </Button>
        </div>
        {coach ? <CoachSteps coach={coach} /> : null}
        {completionNotice ? (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-primary/25 bg-primary/5 p-3 sm:p-4">
            <p className="min-w-0 text-fluid-sm font-medium text-foreground">
              You completed the tutorial. You can keep using this panel with your agent anytime.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onDismissCompletion}
            >
              Close
            </Button>
          </div>
        ) : null}
      </div>

      {expanded && !coach && <div id="agent-feature-details" className="space-y-4 border-t border-border bg-light-muted px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-fluid-sm font-semibold"><MessageSquareText className="h-4 w-4 text-primary" />Try asking, &quot;Via ShrineKeep WebMCP in this browser...&quot;</div>
            <p className="mt-1 text-fluid-xs text-muted-foreground">Suggested changes always wait for your approval.</p>
          </div>
          <Button type="button" variant="outline" className="w-full shrink-0 gap-2 sm:w-auto" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog">
            Open tools &amp; activity <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
        <div className={cn("grid items-start gap-2", prompts.length > 1 && "md:grid-cols-2 xl:grid-cols-4")}>
          {prompts.map((prompt) => <details key={prompt.title} className="group overflow-hidden rounded-md border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 marker:content-none">
              <span className="min-w-0 flex-1 text-fluid-sm font-medium leading-snug">“{prompt.title}”</span>
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="border-t border-border px-3 py-2.5 text-fluid-xs leading-relaxed text-muted-foreground">{prompt.detail}</p>
          </details>)}
        </div>
      </div>}
    </section>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="left-auto right-0 top-0 flex h-[100dvh] w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 data-[state=open]:!slide-in-from-right-full data-[state=open]:!slide-in-from-top-0 data-[state=open]:!zoom-in-100 data-[state=closed]:!slide-out-to-right-full data-[state=closed]:!slide-out-to-top-0 data-[state=closed]:!zoom-out-100 sm:w-[28rem] sm:rounded-none">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-12 text-left">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-muted p-2 text-primary"><Bot className="h-4 w-4" /></span>
            <div className="min-w-0">
              <DialogTitle>Agent access</DialogTitle>
              <DialogDescription className="mt-1">See what ShrineKeep exposes to AI agents and what they have done.</DialogDescription>
            </div>
          </div>
          <div className={cn("mt-4 flex items-start gap-2 rounded-lg border p-3 text-fluid-sm", ready ? "border-primary/25 bg-primary/5" : status === "error" ? "border-destructive/25 bg-destructive/5" : "bg-light-muted")}>
            <ShieldCheck className={cn("mt-0.5 h-4 w-4 shrink-0", ready ? "text-primary" : "text-muted-foreground")} />
            <span>{connectionCopy(status, registeredToolCount, toolCount)}</span>
          </div>
        </DialogHeader>

        <Tabs defaultValue="tools" className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
          <TabsList className="grid h-10 w-full shrink-0 grid-cols-2">
            <TabsTrigger value="tools" className="gap-2"><Wrench className="h-4 w-4" />Tools <span className="text-fluid-xs opacity-70">{toolCount}</span></TabsTrigger>
            <TabsTrigger value="activity" className="gap-2"><Activity className="h-4 w-4" />Activity {invocationCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{invocationCount}</span>}</TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-3 py-2">
              {tools.map((tool) => <article key={tool.name} className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">{tool.readOnly ? <Eye className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <h3 className="text-fluid-sm font-semibold leading-5">{tool.title}</h3>
                      <ToolStatusDot status={tool.status} />
                    </div>
                    <code className="mt-1 block break-all text-[11px] text-primary">{tool.name}</code>
                    <p className="mt-2 text-fluid-sm leading-relaxed text-muted-foreground">{tool.description}</p>
                    <span className="mt-2 inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{tool.readOnly ? "Read only" : "Stages for review"}</span>
                  </div>
                </div>
              </article>)}
            </div>

            <details className="group mt-3 rounded-lg border border-border bg-light-muted">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-fluid-sm font-semibold marker:content-none">
                <MessageSquareText className="h-4 w-4 text-primary" />Try these prompts
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-border p-3">
                {prompts.map((prompt) => <div key={prompt.title} className="rounded-md bg-card p-3">
                  <p className="text-fluid-sm font-medium">“{prompt.title}”</p>
                  <p className="mt-1 text-fluid-xs leading-relaxed text-muted-foreground">{prompt.detail}</p>
                </div>)}
              </div>
            </details>
            <p className="px-1 pb-1 pt-3 text-fluid-xs leading-relaxed text-muted-foreground">Tools that write only create a review stage. Your collection does not change until you approve it in ShrineKeep.</p>
          </TabsContent>

          <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activity.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <span className="rounded-full bg-muted p-3 text-muted-foreground"><Activity className="h-5 w-5" /></span>
              <h3 className="mt-3 text-fluid-sm font-semibold">No agent activity yet</h3>
              <p className="mt-1 max-w-xs text-fluid-sm leading-relaxed text-muted-foreground">Calls made through ShrineKeep’s WebMCP tools will appear here while this page is open.</p>
            </div> : <div className="space-y-2 py-2">
              {activity.map((item) => <article key={item.id} className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground"><Bot className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-fluid-sm font-semibold">{item.toolTitle}</h3>
                      <ActivityStatus item={item} />
                    </div>
                    <code className="mt-1 block break-all text-[11px] text-primary">{item.toolName}</code>
                    <p className="mt-2 flex items-center gap-1.5 text-fluid-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{formatActivityTime(item.startedAt)}</p>
                    {item.error && <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-2 text-fluid-xs text-destructive">{item.error}</p>}
                  </div>
                </div>
              </article>)}
            </div>}
            {lastInvokedAt && <p className="px-1 pb-1 pt-3 text-fluid-xs text-muted-foreground">Latest activity at {formatActivityTime(lastInvokedAt)}. This session keeps the 30 most recent events.</p>}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  </>
}

function CoachSteps({ coach }: { coach: NonNullable<Props["coach"]> }) {
  const [copied, setCopied] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const step = coach.state.step
  const boxName = coach.state.createdBoxName ?? coach.state.collectionName
  const prompt =
    step === "copy_init" || step === "wait_init_approve"
      ? initPrompt(coach.state.collectionName)
      : step === "copy_prices" || step === "wait_price_approve"
        ? valuationPrompt()
        : null
  const webMcpAvailable = coach.webMcpAvailable !== false

  const copy = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-light-muted p-3 sm:p-4">
      <p className="text-fluid-xs font-medium uppercase tracking-wide text-primary">Follow these steps</p>
      {webMcpAvailable ? (
        <>
          {step === "ask_name" ? (
            <>
              <p className="text-fluid-sm font-medium">What collection do you have?</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={coach.nameDraft}
                  onChange={(event) => coach.onNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && coach.nameDraft.trim()) coach.onContinueName()
                  }}
                  placeholder="e.g. 1999 English Pokémon TCG Base Set"
                  className="min-h-11 min-w-0 flex-1"
                />
                <Button
                  className="min-h-11 w-full shrink-0 sm:w-auto"
                  disabled={!coach.nameDraft.trim()}
                  onClick={coach.onContinueName}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : null}
          {step === "copy_init" || step === "copy_prices" ? (
            <>
              <p className="text-fluid-sm font-medium">
                {step === "copy_init"
                  ? "Paste this into your agent, confirm the match in chat, then wait here."
                  : "Paste this into your agent, then approve the valuation suggestions in ShrineKeep."}
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-card p-3 text-fluid-xs leading-relaxed">
                {prompt}
              </pre>
              <Button type="button" className="min-h-11" onClick={() => void copy()}>
                {copied ? "Copied." : "Copy prompt"}
              </Button>
              <span className="sr-only" aria-live="polite">
                {copied ? "Copied." : ""}
              </span>
            </>
          ) : null}
          {step === "wait_init_approve" ? (
            <p className="text-fluid-sm">Your agent staged a box. Review and approve it.</p>
          ) : null}
          {step === "open_box" ? (
            <p className="text-fluid-sm">
              {coach.state.createdBoxId ? (
                <>
                  Open <strong>{openBoxLabel(boxName)}</strong> in the grid below.
                </>
              ) : (
                <>Open a box in the grid below.</>
              )}
            </p>
          ) : null}
          {step === "wait_price_approve" ? (
            <p className="text-fluid-sm">Approve the valuation suggestions. Approve at least one row to continue.</p>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-fluid-sm font-medium">WebMCP isn’t connected in this browser.</p>
          <p className="text-fluid-sm text-muted-foreground">
            The AI walkthrough needs a connected agent. You can still see how ShrineKeep works with a
            sample collection.
          </p>
        </div>
      )}
      {coach.error ? (
        <p className="text-fluid-sm text-destructive" role="alert">
          {coach.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {webMcpAvailable ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={coach.busy}
            onClick={coach.onSkipStep}
          >
            Skip this step
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={coach.busy}
          onClick={() => setConfirmSkip(true)}
        >
          Skip tutorial
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={coach.busy}
          onClick={coach.onSample}
        >
          {webMcpAvailable ? "Use sample demo data instead" : "Try a sample collection"}
        </Button>
      </div>
      <Dialog open={confirmSkip} onOpenChange={setConfirmSkip}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip this setup?</DialogTitle>
            <DialogDescription>
              This tutorial will not show again for this account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmSkip(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={coach.busy}
              onClick={() => {
                setConfirmSkip(false)
                coach.onSkip()
              }}
            >
              {coach.busy ? "Saving…" : "Skip tutorial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
