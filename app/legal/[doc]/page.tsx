import { readFile } from "node:fs/promises"
import path from "node:path"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const DOCS: Record<string, { title: string; filename: string }> = {
  privacy: { title: "Privacy Policy", filename: "PRIVACY_POLICY.md" },
  terms: { title: "Terms and Conditions", filename: "TERMS_AND_CONDITIONS.md" },
}

interface LegalDocPageProps {
  params: Promise<{ doc: string }>
}

export default async function LegalDocPage({ params }: LegalDocPageProps) {
  const { doc } = await params
  const selected = DOCS[doc]

  if (!selected) notFound()

  const markdownPath = path.join(process.cwd(), "legal", selected.filename)
  let content = ""

  try {
    content = await readFile(markdownPath, "utf8")
  } catch {
    notFound()
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <h1 className="text-fluid-2xl font-bold">{selected.title}</h1>
          <Link href="/landing" className="text-fluid-sm text-primary hover:underline">
            Back to landing
          </Link>
        </div>

        <article className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-fluid-2xl font-bold mb-4 text-foreground">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-fluid-xl font-semibold mt-8 mb-3 text-foreground">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-fluid-lg font-semibold mt-6 mb-2 text-foreground">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-fluid-sm leading-7 mb-4 text-foreground">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-6 mb-4 space-y-1 text-fluid-sm text-foreground">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-6 mb-4 space-y-1 text-fluid-sm text-foreground">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-7">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              a: ({ href, children }) => (
                <a href={href} className="text-primary underline underline-offset-2 hover:no-underline">
                  {children}
                </a>
              ),
              hr: () => <hr className="my-6 border-border" />,
              code: ({ children }) => (
                <code className="rounded bg-muted px-1.5 py-0.5 text-fluid-xs">{children}</code>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  )
}

