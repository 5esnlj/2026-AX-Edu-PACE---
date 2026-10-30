export type ReviewSignal = {
  kind: string;
  label: string;
  segment_id: string;
  quote: string;
  explanation: string;
};
export type ReviewCandidate = {
  term: string;
  wrong: string;
  correct: string;
  status: "suspected" | "review" | "recognition";
  severity: string;
  quote: string;
  reason: string;
  cause: string;
  decision_note: string;
  independent_signal_count: number;
  signals: ReviewSignal[];
  reference_translation: string | null;
  glossary_match: boolean;
  occurrences: number;
  locations: {
    segment_id: string;
    page: number | null;
    location: string;
    quote: string;
    occurrences: number;
  }[];
};
export type ReviewCounts = {
  confirmed: number;
  suspected: number;
  review: number;
  recognition: number;
  weak: number;
};
export type ReviewParameters = {
  mode: "parallel" | "standalone";
  language: string;
  subject: string | null;
  unit: string | null;
};
export type TranslationReport = {
  id: string;
  title: string;
  material_id: string | null;
  document_text: string;
  parameters: ReviewParameters;
  created_at: string;
  result: {
    summary: string;
    subject: string;
    unit: string;
    subject_confidence: number;
    unit_confidence: number;
    context_source: { subject: string; unit: string };
    needs_selection: boolean;
    selection_reason: string;
    provider: string;
    warnings: string[];
    counts: ReviewCounts;
    items: ReviewCandidate[];
    weak_candidates: ReviewCandidate[];
  };
};
export type TranslationGlossary = {
  version: string;
  source: string;
  notice: string;
  transcription_notes: string[];
  languages: Record<string, string>;
  analysis_languages: Record<string, string>;
  entries: { id: string; term: string; translations: Record<string, string> }[];
};
