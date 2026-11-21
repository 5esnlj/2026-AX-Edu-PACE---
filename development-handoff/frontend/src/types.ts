export type Tone = 'blue' | 'yellow' | 'green' | 'orange' | 'purple' | 'red';
export type Level = '초급 미달' | '초급' | '중급' | '고급';
export type Role = 'teacher' | 'student';
export type Subject = '국어' | '수학' | '사회' | '과학' | '생활한국어';

/** 교과별 색 — 화면에서 교과 색이 필요하면 항상 이 표를 쓴다 */
export const SUBJECT_TONE: Record<Subject, Tone> = {
  사회: 'blue',
  수학: 'yellow',
  과학: 'green',
  국어: 'orange',
  생활한국어: 'purple',
};

export const LEVEL_TONE: Record<Level, Tone | null> = {
  '초급 미달': null,
  초급: 'orange',
  중급: 'yellow',
  고급: 'green',
};
