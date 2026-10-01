import { Logo, LogoMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

export const metadata = { title: "Design system", robots: { index: false } };

const swatches: [string, string[]][] = [
  [
    "Damson (brand 1)",
    [
      "damson-950",
      "damson-900",
      "damson-800",
      "damson-700",
      "damson-600",
      "damson-300",
      "damson-100",
      "damson-50",
    ],
  ],
  ["Kiln (brand 2)", ["kiln-800", "kiln-700", "kiln-600", "kiln-400", "kiln-100"]],
  ["Marigold (accent)", ["marigold-700", "marigold-600", "marigold-500", "marigold-300", "marigold-100"]],
  ["Neutrals", ["ink", "slate", "stone", "sand", "cream", "paper"]],
];

/** Living style guide at /_design. Mirrors docs/DESIGN_SYSTEM.md. */
export default function DesignPage() {
  return (
    <main id="main" className="container-site py-16">
      <p className="t-eyebrow">Aurelia Hall</p>
      <h1 className="t-display text-primary mt-3">Design system</h1>
      <p className="t-lead mt-4 max-w-2xl">
        Warm, scholarly and calm. An arched doorway and a rising sun; damson, kiln and marigold on paper.
      </p>

      <section className="mt-16 grid gap-10 md:grid-cols-2" aria-labelledby="logo">
        <div>
          <h2 id="logo" className="t-h2">
            Logo
          </h2>
          <div className="border-line bg-elevated text-primary mt-6 flex flex-wrap items-center gap-8 rounded-lg border p-8">
            <Logo />
            <LogoMark className="h-16" />
          </div>
          <div className="bg-damson-900 text-paper mt-4 flex items-center gap-8 rounded-lg p-8">
            <Logo />
          </div>
        </div>
        <div>
          <h2 className="t-h2">Type</h2>
          <div className="mt-6 space-y-3">
            <p className="t-display">Fraunces display</p>
            <p className="t-h1">Heading one</p>
            <p className="t-h2">Heading two</p>
            <p className="t-h3">Heading three</p>
            <p className="t-eyebrow">Eyebrow label</p>
            <p className="t-lead">Lead paragraph in Hanken Grotesk — generous, legible, warm.</p>
            <p>Body copy at 16–17px with 1.6–1.75 line height for long reading.</p>
          </div>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="colour">
        <h2 id="colour" className="t-h2">
          Colour
        </h2>
        <div className="mt-6 space-y-6">
          {swatches.map(([label, names]) => (
            <div key={label}>
              <p className="mb-2 text-sm font-medium">{label}</p>
              <div className="flex flex-wrap gap-2">
                {names.map((n) => (
                  <div key={n} className="w-28">
                    <div className="ring-line h-16 rounded-md ring-1" style={{ background: `var(--${n})` }} />
                    <p className="text-muted mt-1 font-mono text-xs">{n}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-10 md:grid-cols-2" aria-labelledby="controls">
        <div>
          <h2 id="controls" className="t-h2">
            Buttons & badges
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["neutral", "primary", "accent", "success", "warning", "danger", "info"] as const).map((t) => (
              <Badge key={t} tone={t}>
                {t}
              </Badge>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            <div className="arch from-kiln-400 to-kiln-700 aspect-[3/4] bg-gradient-to-b" />
            <div className="arch from-marigold-300 to-marigold-600 aspect-[3/4] bg-gradient-to-b" />
            <div className="arch from-damson-600 to-damson-900 aspect-[3/4] bg-gradient-to-b" />
          </div>
          <p className="text-muted mt-2 text-sm">The arch mask is the recurring image shape.</p>
        </div>
        <div className="space-y-4">
          <h2 className="t-h2">Form fields</h2>
          <Field id="d1" label="Parent name" required hint="As it appears on ID">
            <Input id="d1" placeholder="Full name" />
          </Field>
          <Field id="d2" label="Class" error="Please choose a class">
            <Select id="d2" aria-invalid="true">
              <option>Year 7</option>
            </Select>
          </Field>
          <Field id="d3" label="Message">
            <Textarea id="d3" />
          </Field>
        </div>
      </section>

      <section className="mt-16 grid gap-6 md:grid-cols-3" aria-label="States">
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <EmptyState title="No leads yet">New enquiries will appear here.</EmptyState>
        <ErrorState>We couldn’t load this list.</ErrorState>
      </section>
    </main>
  );
}
