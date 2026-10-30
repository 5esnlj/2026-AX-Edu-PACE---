export const domainNames: Record<string, string> = {
  listening: "듣기",
  reading: "읽기",
  writing: "쓰기",
  speaking: "말하기",
};
export const sixLevels = ["시작", "초기", "발달", "확장", "연결", "도달"];
export type DiagnosticResult = {
  complete: boolean;
  overall: number | null;
  overall_label?: string;
  domains: Record<
    string,
    {
      level: number | null;
      label: string;
      next_challenge: boolean;
      display?: string;
      raw?: string[];
      correction_level?: number | null;
      flags?: string[];
    }
  >;
  layers: Record<
    string,
    {
      label: string;
      state: string;
      ratio?: number | null;
      score?: number;
      total?: number;
      unadministered?: number;
    }
  >;
  subjects: Record<
    string,
    {
      label?: string;
      level?: number | null;
      display?: string;
      recheck: boolean;
      t3?: number | null;
      c5?: number | null;
      c6?: number | null;
      flags?: string[];
      output?: Record<string, string>;
    }
  >;
  layer_inversions?: string[];
  subject_representative?: number | null;
  bottleneck?: string | null;
  gap?: number | null;
  gap_label?: string | null;
  prescriptions?: string[];
};
export type DiagnosticQuestion = {
  id: string;
  domain: string;
  level: number;
  tier: string;
  topic: string;
  stimulus: string;
  prompt: string;
  options?: string[];
  option_visuals?: string[];
  visuals?: string[];
  table?: string[][];
  asset_note?: string;
  rubric?: Record<string, string>;
  review_note?: string;
};
export type DiagnosticAttempt = {
  id: string;
  stage: string;
  pending: string | null;
  questions: DiagnosticQuestion[];
  finished: string[];
  notice: string;
  result: DiagnosticResult;
  responses: Record<
    string,
    number | null | { text: string; in_person: boolean }
  >;
  audio: Record<string, string>;
  draft?: {
    answers?: Record<string, number | null>;
    text?: string;
    in_person?: boolean;
  };
  pending_task?: DiagnosticQuestion;
  rubric?: Record<string, string[]>;
  grades?: Record<string, unknown>;
};
export type PathStep = {
  id: string;
  period: string;
  focus: string;
  activities: string[];
  check_for_progress: string;
  evidence: string[];
};
export type LearningPath = {
  id?: string;
  needs_diagnostic?: boolean;
  message?: string;
  student_summary?: string;
  roadmap?: PathStep[];
  check_in?: string;
  provider?: string;
  profile?: DiagnosticResult;
  provisional?: boolean;
  progress?: Record<string, { reflection: string; completed_at: string }>;
};
