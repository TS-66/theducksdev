"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { useDuckyAgent } from "@/hooks/use-ducky-agent";

type PendingAsk = Exclude<ReturnType<typeof useDuckyAgent>["pendingAsk"], null>;

interface AskUserCardProps {
  pendingAsk: PendingAsk;
  respondAsk: (answers: Record<string, string>) => void;
}

/**
 * Human-in-the-loop questionnaire: one block per question.
 * single-select -> radio cards; multi_select -> checkbox cards.
 * Submit resolves `{ qid: label }` (multi joins labels with ", ").
 */
export function AskUserCard({ pendingAsk, respondAsk }: AskUserCardProps) {
  const initial = React.useMemo(() => {
    const acc: Record<string, string[]> = {};
    for (const q of pendingAsk.questions) {
      acc[q.id] =
        q.multi_select && q.options?.length ? [q.options[0].label] : q.options?.[0]?.label ? [q.options[0].label] : [];
    }
    return acc;
  }, [pendingAsk.questions]);

  const [selections, setSelections] = React.useState<Record<string, string[]>>(initial);
  // Deferred re-seed when a new question set arrives (no render-phase cascade).
  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      if (live) setSelections(initial);
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [initial]);

  const toggleMulti = (qid: string, label: string) => {
    setSelections((sel) => {
      const cur = sel[qid] ?? [];
      return {
        ...sel,
        [qid]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label],
      };
    });
  };

  const onSubmit = () => {
    const answers: Record<string, string> = {};
    for (const q of pendingAsk.questions) answers[q.id] = (selections[q.id] ?? []).join(", ");
    respondAsk(answers);
  };

  return (
    <div className="mx-auto w-full max-w-3xl rounded-lg border bg-card px-4 py-3 shadow-sm md:px-8">
      <div className="flex items-center gap-2">
        <HelpCircle className="size-4 shrink-0 text-[#FDC00A]" aria-hidden />
        <h3 className="text-sm font-semibold">ducky needs your input</h3>
      </div>

      <div className="mt-3 space-y-4">
        {pendingAsk.questions.map((q) => (
          <fieldset key={q.id} className="space-y-1.5">
            <legend className="flex items-baseline gap-2 text-[13px] font-medium">
              {q.header && (
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  [{q.header}]
                </span>
              )}
              <span>{q.question}</span>
            </legend>

            {q.multi_select ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(q.options ?? []).map((opt) => {
                  const checked = (selections[q.id] ?? []).includes(opt.label);
                  return (
                    <Label
                      key={opt.label}
                      className={cnCard(checked)}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleMulti(q.id, opt.label)}
                        aria-label={opt.label}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{opt.label}</span>
                        {opt.description && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </Label>
                  );
                })}
              </div>
            ) : (
              <RadioGroup
                value={(selections[q.id] ?? [])[0] ?? ""}
                onValueChange={(v) => setSelections((sel) => ({ ...sel, [q.id]: [v] }))}
                className="grid gap-1.5 sm:grid-cols-2"
              >
                {(q.options ?? []).map((opt) => (
                  <Label key={opt.label} className={cnCard(false)}>
                    <RadioGroupItem value={opt.label} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{opt.label}</span>
                      {opt.description && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {opt.description}
                        </span>
                      )}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          </fieldset>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onSubmit}>
          Submit
        </Button>
      </div>
    </div>
  );
}

function cnCard(active: boolean): string {
  return [
    "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
    active
      ? "border-ring bg-accent"
      : "bg-background hover:bg-muted/50",
    "has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  ].join(" ");
}
