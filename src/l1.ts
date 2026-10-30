export type L1Sentence = {
  id: string;
  source: string;
  rewritten: string;
  operations: string[];
  rationale: string;
};
export type L1Vocabulary = {
  term: string;
  tier: string;
  action: string;
  simple_meaning: string;
  translation: string;
  source_sentence_ids: string[];
  translation_status: string;
  knowledge_state: string;
  required_level: number | string | null;
  learner_level: number | string | null;
};
export type L1Visual = {
  needed: boolean;
  kind: string;
  title: string;
  description: string;
  items: string[];
  source_sentence_ids: string[];
  alt_text: string;
  visible_by_default: boolean;
  rationale: string;
};
export type L1Result = {
  status: string;
  learner_decision: {
    diagnosed_level: number | string | null;
    native_language: string;
    subject_profile_used: {
      representative_level?: number | string | null;
      level?: number | string | null;
      recheck_required?: boolean;
      uncertain?: boolean;
      uncertainty_flags?: string[];
    };
    methods_selected: string[];
    rationale: string[];
  };
  profile_context: {
    source: string;
    level_scale: string;
    bottlenecks: string[];
  };
  recognition: { page_notes: string[]; uncertain_spans: string[] };
  key_sentences: L1Sentence[];
  vocabulary: L1Vocabulary[];
  visual_aids: L1Visual[];
  teacher_review: { questions: string[] };
  finalization: { approved_by_teacher: boolean; final_document: string | null };
  warnings: string[];
};
export type L1Edits = {
  sentences: Pick<L1Sentence, "id" | "rewritten">[];
  vocabulary: Pick<
    L1Vocabulary,
    "term" | "tier" | "action" | "simple_meaning" | "translation"
  >[];
  visual_aids: Pick<
    L1Visual,
    "title" | "description" | "items" | "alt_text" | "visible_by_default"
  >[];
};
export function toL1Edits(data: L1Result): L1Edits {
  return {
    sentences: data.key_sentences.map(({ id, rewritten }) => ({
      id,
      rewritten,
    })),
    vocabulary: data.vocabulary.map(
      ({ term, tier, action, simple_meaning, translation }) => ({
        term,
        tier,
        action,
        simple_meaning,
        translation,
      }),
    ),
    visual_aids: data.visual_aids.map(
      ({ title, description, items, alt_text, visible_by_default }) => ({
        title,
        description,
        items,
        alt_text,
        visible_by_default,
      }),
    ),
  };
}
export const l1Tiers: Record<string, string> = {
  "1": "생활 한국어",
  "2-1": "교실 어휘",
  "2-2": "사고 도구",
  "2-3": "범용 지식 어휘",
  "3": "교과 개념어",
  unknown_needs_teacher: "교사 분류 필요",
};
export const l1Actions: Record<string, string> = {
  retain: "유지",
  elaborate: "상세화",
  simplify: "단순화",
  review: "교사 판단 필요",
};
export const l1Methods: Record<string, string> = {
  easy: "쉬운 한국어",
  bilingual: "모국어 병기",
  visual: "시각 자료",
};
