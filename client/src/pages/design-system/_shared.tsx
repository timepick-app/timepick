import type { ReactNode } from "react"
import type { ComponentMeta, MetaGuideline, MetaAntiPattern, MetaExample } from "@/components/ui/_meta/types"
import { Typography } from "@/components/ui/typography"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function GuidelineGrid({ guidelines }: { guidelines: MetaGuideline[] }) {
  return (
    <>
      {guidelines.map((g, index) => (
        <div key={index} className="space-y-2 p-4 rounded-lg bg-background border">
          <Typography variant="h6" className="font-semibold text-foreground">
            {g.rule}
          </Typography>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div className="space-y-1">
              <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ Correct:</span>
              <code className="block bg-green-50 dark:bg-green-950 p-2 rounded text-xs overflow-x-auto whitespace-pre">
                {g.correct}
              </code>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-red-600 dark:text-red-400">✗ Incorrect:</span>
              <code className="block bg-red-50 dark:bg-red-950 p-2 rounded text-xs overflow-x-auto whitespace-pre">
                {g.wrong}
              </code>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

function AntiPatternList({ antiPatterns }: { antiPatterns: MetaAntiPattern[] }) {
  return (
    <>
      {antiPatterns.map((ap, index) => (
        <div key={index} className="space-y-2 p-4 rounded-lg bg-background border">
          <Typography variant="h6" className="font-semibold text-foreground">
            {ap.title}
          </Typography>
          <Typography variant="body-sm" color="muted">
            {ap.description}
          </Typography>
        </div>
      ))}
    </>
  )
}

function ExampleList({ examples }: { examples: MetaExample[] }) {
  return (
    <>
      {examples.map((ex, index) => (
        <div key={index} className="space-y-2">
          <Typography variant="h6">{ex.label}</Typography>
          <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
            {ex.code}
          </pre>
        </div>
      ))}
    </>
  )
}

interface ComponentDocProps {
  meta: ComponentMeta
  /** Préfixe de titre des cartes ("Badges", "Buttons"…). Défaut : meta.name. */
  label?: string
  /** Si fourni (et guidelines non vides), rend la carte « Bonnes pratiques ». */
  guidelinesDescription?: string
  /** Si fourni (et antiPatterns non vides), rend la carte « Anti-patterns ». */
  antiPatternsDescription?: string
  /** Si fourni (et examples non vides), rend la carte « Exemples de code ». */
  examplesDescription?: string
  /** Cartes de démo bespoke, rendues avant les cartes documentaires. */
  children?: ReactNode
}

export function ComponentDoc({
  meta,
  label,
  guidelinesDescription,
  antiPatternsDescription,
  examplesDescription,
  children,
}: ComponentDocProps) {
  const name = label ?? meta.name
  return (
    <>
      {children}
      {guidelinesDescription && meta.guidelines.length > 0 && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>✅</span>
              {name} — Bonnes pratiques
            </CardTitle>
            <CardDescription>{guidelinesDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GuidelineGrid guidelines={meta.guidelines} />
          </CardContent>
        </Card>
      )}
      {antiPatternsDescription && meta.antiPatterns.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <span>⚠️</span>
              {name} — Anti-patterns
            </CardTitle>
            <CardDescription>{antiPatternsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AntiPatternList antiPatterns={meta.antiPatterns} />
          </CardContent>
        </Card>
      )}
      {examplesDescription && meta.examples.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{name} — Exemples de code</CardTitle>
            <CardDescription>{examplesDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExampleList examples={meta.examples} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
