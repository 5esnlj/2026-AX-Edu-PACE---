import type { L1Result, ReadingSupport } from "./l1";
export type Role = "teacher" | "student";
export type Student = {
  id: string;
  name: string;
  language: string;
  grade: string;
  levels: {
    listening: number;
    speaking: number;
    reading: number;
    writing: number;
  };
  everyday: number;
  academic: number;
  diagnostic_source: "sample" | "self";
};
export type Session = {
  role: Role;
  name: string;
  student: Student | null;
  class_name: string;
  demo: boolean;
};
export type Term = {
  term: string;
  meaning: string;
  translation: string;
  verified: boolean;
  translations: Record<string, string>;
};
export type Variant = {
  text: string;
  terms: Term[];
  visuals: {
    term: string;
    meaning: string;
    kind?: string;
    items?: string[];
    alt_text?: string;
    visible_by_default?: boolean;
  }[];
  level: number;
  language: string;
  provider: string;
  notice: string;
  native_language?: string;
  reconstruction?: L1Result;
  source_pdf_url?: string | null;
  reading_support?: ReadingSupport[];
};
export type Material = {
  id: string;
  title: string;
  subject: string;
  unit: string;
  source_text: string;
  targets: string[];
  modes: string[];
  variants: Record<string, Variant>;
  reviewed: string[];
  status: "draft" | "reviewed" | "published";
  created_at: string;
};
export type Attempt = {
  score: number;
  total: number;
  standard: number;
  reduced: number;
  kind: string;
  label: string;
  recommendation: string;
  caution: string;
  is_sample?: boolean;
  created_at?: string;
  results: {
    id: string;
    correct: boolean;
    selected: number;
    answer: number;
    explanation: string;
    load: string;
    concept: string;
  }[];
};
export type Report = {
  student: Student;
  attempt: Attempt | null;
  completed_steps: number;
  saved_words: number;
};
export type Quiz = {
  id: string;
  material_id: string;
  title: string;
  question_count: number;
  attempt: Attempt | null;
};
export type Question = {
  id: string;
  concept: string;
  load: string;
  prompt: string;
  options: string[];
};
export type QuizDetail = {
  id: string;
  title: string;
  fairness: string;
  questions: Question[];
};
export type Message = {
  id: number;
  student_id: string;
  sender: Role;
  content: string;
  created_at: string;
};
export type RoadStep = {
  id: string;
  title: string;
  description: string;
  minutes: number;
  prompt: string;
  options: string[];
  completed: boolean;
};
export const languages: Record<string, string> = {
  vi: "베트남어",
  en: "영어",
  uz: "우즈베크어",
  mn: "몽골어",
  bn: "벵골어",
};
export const levelNames = [
  "시작해요",
  "익숙해져요",
  "스스로 해요",
  "넓혀 가요",
];

export const skillLabels = {
  listening: "듣기",
  speaking: "말하기",
  reading: "읽기",
  writing: "쓰기",
};
