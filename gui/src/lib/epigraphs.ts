import type { ResolvedLanguage } from "@/lib/language";

/**
 * Empty-state conditions an epigraph can bind to. v1 ships only
 * `"fresh"`; the type is intentionally open so later conditions
 * (e.g. `"quiet"` for an all-idle team, `"busy"` for many active
 * sessions) can be added without touching the renderer — add one
 * entry to `EPIGRAPHS` and one line to `EPIGRAPH_BINDINGS`.
 *
 * Part A of the philosophical-voice feature. The epigraph is a single
 * state-bound Wittgenstein line shown above the empty-state Composer:
 * a translated line in the user's software language, with the German
 * original on an always-on secondary line. See
 * `.kiro/specs/philosophical-voice/`.
 */
export type EpigraphCondition = "fresh"; // future: "quiet" | "busy" | ...

export interface Epigraph {
  /** Stable key, e.g. `"tractatus-7"`. */
  id: string;
  /** Light citation, e.g. `"Tractatus 7"` / `"PI §133"`. */
  source: string;
  /** German original — rendered as the always-on secondary line. */
  de: string;
  /** Chinese translation. */
  zh: string;
  /** English translation. */
  en: string;
}

export interface ResolvedEpigraph {
  /** Translated line in the user's software language. Never empty. */
  primary: string;
  /** German original. Never empty. */
  de: string;
  source: string;
  id: string;
}

/**
 * Curated set — deliberately small (Req 2.4). Each entry holds the
 * German original plus every software-language translation together so
 * the curation stays editable in one place (Req 6.2 / 6.4).
 *
 * v1 ships exactly one entry, which is also the safe default. Rationale
 * for binding Tractatus 7 to the fresh/empty screen: the interface is
 * literally silent at that moment, so *sagen* and *zeigen* coincide
 * (Req 2.1) — the line is about the screen's own condition, not a
 * decorative quote.
 */
export const EPIGRAPHS: readonly Epigraph[] = [
  {
    id: "tractatus-7",
    source: "Tractatus 7",
    de: "Wovon man nicht sprechen kann, darüber muss man schweigen.",
    zh: "凡不可说的，应当沉默。",
    en: "Whereof one cannot speak, thereof one must be silent.",
  },
];

/** Condition -> epigraph id. */
export const EPIGRAPH_BINDINGS: Readonly<Record<EpigraphCondition, string>> = {
  fresh: "tractatus-7",
};

/**
 * Safe default used when a condition has no binding or referenced data
 * is missing (Req 2.2 / 6.3). Must reference an existing entry id.
 */
export const DEFAULT_EPIGRAPH_ID = "tractatus-7";

/** Pick the translated field for a language, with cross-field fallback
 * so a single empty translation never yields an empty render. */
function pickPrimary(entry: Epigraph, language: ResolvedLanguage): string {
  const ordered =
    language === "en-US"
      ? [entry.en, entry.zh, entry.de]
      : [entry.zh, entry.en, entry.de];
  for (const candidate of ordered) {
    if (candidate.trim().length > 0) return candidate;
  }
  // All translations empty: fall back to id so we still render something
  // visible rather than a blank line. The dev guard below prevents this
  // in practice.
  return entry.id;
}

function findById(id: string): Epigraph | undefined {
  return EPIGRAPHS.find((e) => e.id === id);
}

/**
 * Resolve a condition + language to a displayable epigraph. Pure and
 * total: unknown/unbound condition -> default entry; missing default
 * -> first entry; empty field -> cross-field fallback. Never returns an
 * empty `primary` or `de` (Req 2.2 / 6.3, design Property 1).
 */
export function resolveEpigraph(
  condition: EpigraphCondition,
  language: ResolvedLanguage,
): ResolvedEpigraph {
  const boundId = EPIGRAPH_BINDINGS[condition] ?? DEFAULT_EPIGRAPH_ID;
  const entry =
    findById(boundId) ?? findById(DEFAULT_EPIGRAPH_ID) ?? EPIGRAPHS[0];

  const primary = pickPrimary(entry, language);
  // `de` falls back to the primary line only if the original is somehow
  // empty — keeps the secondary line non-empty (Property 1).
  const de = entry.de.trim().length > 0 ? entry.de : primary;

  return { primary, de, source: entry.source, id: entry.id };
}

/**
 * Dev-only integrity guard (design Property 3). Runs once at module load
 * under Vite's DEV flag so curation mistakes surface immediately in
 * development without shipping a runtime cost or throw to users.
 */
function assertEpigraphIntegrity(): void {
  const ids = new Set<string>();
  for (const e of EPIGRAPHS) {
    for (const [field, value] of Object.entries({
      id: e.id,
      source: e.source,
      de: e.de,
      zh: e.zh,
      en: e.en,
    })) {
      if (value.trim().length === 0) {
        throw new Error(
          `Epigraph integrity: entry "${e.id || "<no id>"}" has empty field "${field}".`,
        );
      }
    }
    if (ids.has(e.id)) {
      throw new Error(`Epigraph integrity: duplicate id "${e.id}".`);
    }
    ids.add(e.id);
  }
  for (const [condition, id] of Object.entries(EPIGRAPH_BINDINGS)) {
    if (!ids.has(id)) {
      throw new Error(
        `Epigraph integrity: binding "${condition}" -> "${id}" references a missing entry.`,
      );
    }
  }
  if (!ids.has(DEFAULT_EPIGRAPH_ID)) {
    throw new Error(
      `Epigraph integrity: DEFAULT_EPIGRAPH_ID "${DEFAULT_EPIGRAPH_ID}" references a missing entry.`,
    );
  }
}

if (import.meta.env.DEV) {
  assertEpigraphIntegrity();
}
