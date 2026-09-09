/**
 * The single prompt every provider sends, built once here so a copilot/ollama/
 * anthropic difference in output quality traces back to the model, never to
 * three subtly different questions.
 *
 * @since 0.3.0
 */

import type { EnrichmentTarget } from "@/enricher/types";

/**
 * Builds the text prompt asking a provider to suggest a TSDoc comment for one
 * flagged declaration.
 *
 * @remarks
 * The prompt states the concrete reasons `scan --classify` flagged the
 * declaration — the same `gaps`/`stale` strings the human report already
 * prints — rather than only the topology name, so the model is pointed at what
 * to fix instead of re-deriving it from the declaration name alone.
 *
 * @param target - The flagged declaration and the file it lives in.
 * @returns The prompt text.
 */
export function buildPrompt(target: EnrichmentTarget): string {
  const { path, declaration } = target;
  const lines: string[] = [
    "You are migrating a TypeScript project's documentation from JSDoc to " +
      "TSDoc (the @microsoft/tsdoc standard).",
    `File: ${path}`,
    `Declaration: ${declaration.kind} ${declaration.name} (line ${String(declaration.line)})`,
    `Documentation topology: ${declaration.topology}`,
  ];

  if (declaration.stale.length > 0) {
    lines.push("The existing comment contradicts the signature:");
    for (const reason of declaration.stale) {
      lines.push(`- ${reason}`);
    }
  }
  if (declaration.gaps.length > 0) {
    lines.push("The signature declares more than the comment documents:");
    for (const gap of declaration.gaps) {
      lines.push(`- ${gap}`);
    }
  }

  lines.push(
    "Suggest a corrected TSDoc block comment for this declaration, in valid " +
      "TSDoc syntax (a summary paragraph, then tags such as @param / @returns " +
      "as needed).",
    "Reply with only the comment text — no surrounding code fence, no " +
      "explanation before or after it.",
  );

  return lines.join("\n");
}
