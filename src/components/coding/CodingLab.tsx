"use client";

import { useState } from "react";
import { CheckCircle2, Play, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { cn } from "@/lib/utils";

interface Exercise {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium";
  prompt: string;
  starter: string;
  /** Simulated check: a loose pattern the code must contain. Not real execution. */
  expectPattern: RegExp;
  expectedOutput: string;
  hint: string;
}

const exercises: Exercise[] = [
  {
    id: "reverse",
    title: "Reverse a string",
    difficulty: "Easy",
    prompt: "Write a function reverse_string(s) that returns the string reversed.",
    starter:
      'def reverse_string(s):\n    # your code here\n    pass\n\nprint(reverse_string("cova"))\n',
    expectPattern: /return\s+.*(\[::-1\]|reversed|join)/s,
    expectedOutput: "avoc",
    hint: "Slicing with [::-1] reverses a string in one step.",
  },
  {
    id: "sum-evens",
    title: "Sum of evens",
    difficulty: "Easy",
    prompt: "Write sum_evens(numbers) that returns the sum of the even numbers in a list.",
    starter:
      "def sum_evens(numbers):\n    # your code here\n    pass\n\nprint(sum_evens([1, 2, 3, 4]))\n",
    expectPattern: /%\s*2/,
    expectedOutput: "6",
    hint: "Use the modulo operator: n % 2 == 0 means n is even.",
  },
  {
    id: "brackets",
    title: "Valid brackets",
    difficulty: "Medium",
    prompt:
      "Write is_valid(s) that returns True when every bracket in s is closed in the right order.",
    starter: 'def is_valid(s):\n    # your code here\n    pass\n\nprint(is_valid("([]{})"))\n',
    expectPattern: /(append|push)[\s\S]*pop/,
    expectedOutput: "True",
    hint: "Push opening brackets onto a stack and pop when you see a closing one.",
  },
];

type Result = { ok: boolean; lines: string[] } | null;

export function CodingLab() {
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? "");
  const exercise = exercises.find((e) => e.id === exerciseId) ?? exercises[0];
  const [codeById, setCodeById] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result>(null);
  const [showHint, setShowHint] = useState(false);

  if (!exercise) return null;
  const code = codeById[exercise.id] ?? exercise.starter;

  function run() {
    if (!exercise) return;
    const unchanged = code.trim() === exercise.starter.trim();
    const looksRight = !unchanged && exercise.expectPattern.test(code);
    setResult(
      looksRight
        ? {
            ok: true,
            lines: [
              "[Simulated run]",
              exercise.expectedOutput,
              "",
              "Looks like a plausible solution. This was a pattern check, not real code execution.",
            ],
          }
        : {
            ok: false,
            lines: [
              "[Simulated run]",
              unchanged
                ? "No changes yet: replace the starter code with your solution."
                : "The output doesn't match the expected result.",
              `Expected output: ${exercise.expectedOutput}`,
            ],
          },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Exercises">
        <h2 className="mb-2 text-sm font-semibold">Exercises</h2>
        <ul className="space-y-1">
          {exercises.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setExerciseId(e.id);
                  setResult(null);
                  setShowHint(false);
                }}
                aria-current={e.id === exercise.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-cova-pale",
                  e.id === exercise.id && "bg-cova-pale font-medium",
                )}
              >
                {e.title}
                <Badge tone="outline">{e.difficulty}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-4">
        <DemoNotice>
          Simulated execution: this lab does not run your code. &quot;Run&quot; only checks your
          code for a typical approach so you can see how the output panel will behave. A sandboxed
          execution service is planned for the backend phase.
        </DemoNotice>
        <Card>
          <CardBody>
            <h2 className="font-semibold">{exercise.title}</h2>
            <p className="mt-1 text-sm text-cova-mute">{exercise.prompt}</p>
          </CardBody>
        </Card>

        <div className="overflow-hidden rounded-xl border border-cova-line bg-white">
          <div className="flex items-center justify-between border-b border-cova-line bg-cova-pale px-4 py-2">
            <span className="font-mono text-xs">solution.py</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCodeById((c) => ({ ...c, [exercise.id]: exercise.starter }));
                  setResult(null);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
              </Button>
              <Button size="sm" onClick={run}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" /> Run (simulated)
              </Button>
            </div>
          </div>
          <div className="flex">
            <div
              aria-hidden="true"
              className="select-none border-r border-cova-line bg-cova-bg px-3 py-3 text-end font-mono text-xs leading-6 text-cova-mute"
            >
              {code.split("\n").map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              aria-label="Code editor"
              spellCheck={false}
              value={code}
              onChange={(e) => setCodeById((c) => ({ ...c, [exercise.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget;
                  const { selectionStart: s, selectionEnd: end } = t;
                  const next = `${code.slice(0, s)}    ${code.slice(end)}`;
                  setCodeById((c) => ({ ...c, [exercise.id]: next }));
                  requestAnimationFrame(() => {
                    t.selectionStart = t.selectionEnd = s + 4;
                  });
                }
              }}
              rows={Math.max(10, code.split("\n").length + 1)}
              className="min-w-0 flex-1 resize-none bg-white px-3 py-3 font-mono text-sm leading-6 text-cova-ink outline-none"
            />
          </div>
        </div>

        <div className="rounded-xl border border-cova-line bg-white">
          <div className="flex items-center gap-2 border-b border-cova-line px-4 py-2 text-sm font-medium">
            Output
            {result &&
              (result.ok ? (
                <CheckCircle2 className="h-4 w-4 text-cova-muted" aria-label="Looks correct" />
              ) : (
                <XCircle className="h-4 w-4 text-red-700" aria-label="Needs changes" />
              ))}
          </div>
          <pre
            aria-live="polite"
            className="min-h-24 whitespace-pre-wrap p-4 font-mono text-sm text-cova-ink"
          >
            {result ? result.lines.join("\n") : "Run your code to see the simulated output here."}
          </pre>
        </div>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowHint((h) => !h)}>
            {showHint ? "Hide hint" : "Show hint"}
          </Button>
          {showHint && (
            <p className="mt-2 rounded-lg bg-cova-pale px-3 py-2 text-sm">{exercise.hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
