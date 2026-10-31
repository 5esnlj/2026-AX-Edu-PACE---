export type StudentQuestion = {
  id: string;
  type: "true_false" | "multiple_choice_4" | "short_answer";
  prompt: string;
  choices: string[];
};

export type StudentAttempt = {
  score: number;
  total: number;
  results: {
    id: string;
    correct: boolean;
    selected: string;
    correct_answer: string;
    explanation: string;
  }[];
  notice: string;
};

export type StudentMaterial = {
  id: string;
  title: string;
  subject: string;
  source_text: string;
  result: {
    sentences: { id: string; source: string; rewritten: string }[];
    vocabulary: {
      term: string;
      tier: string;
      translation: string;
      simple_meaning: string;
      action: string;
    }[];
    visual_aids: {
      kind: string;
      title: string;
      description: string;
      items: string[];
    }[];
    notice: string;
    provider: string;
  };
  profile: { level: number | string | null; native_language: string | null };
  completed_at: string | null;
  quiz: {
    items: StudentQuestion[];
    answer_visibility: "after_submission";
  } | null;
  attempt: StudentAttempt | null;
  created_at: string;
};
