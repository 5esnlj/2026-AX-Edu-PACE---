import type { Level, Subject } from '../types';
import type { AreaCode, DiagnosticState } from './wire';
export type StudentRow = {
  id: string; name: string; nativeLanguage: string;
  diagnosticStatus: DiagnosticState;
  listening: Level | null; reading: Level | null; overall: Level | null;
  recentScore: { correct: number; total: number } | null;
  recentStatus: '배포 없음' | '풀기 전' | '푸는 중' | '완료';
  wrongCount: number | null;
};
export type ClassDashboard = {
  classId: string; className: string; selectedArea: AreaCode; subject: Subject; studentCount: number;
  levelCounts: Record<Level | '진단 미완료', number>;
  pendingReviewCount: number; students: StudentRow[];
};
export type Material = { id: string; subject: Subject; unit: string; title: string; date: string; isNew?: boolean };
export type MaterialList = { mySubject: Subject; materials: Material[] };
export type QuestionSet = { id: string; title: string; subject: Subject; progress: number; status: '풀기 전' | '푸는 중' | '완료' | '다시 풀기'; wrongCount: number; unansweredCount: number };
export type StudentHome = {
  studentName: string; className: string; selectedArea: AreaCode; subject: Subject; todoCount: number;
  myLevel: { listening: Level | null; reading: Level | null; listeningScore: number | null; readingScore: number | null };
  newMaterials: Material[]; questionSets: QuestionSet[];
};
