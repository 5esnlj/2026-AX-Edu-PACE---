import type { Level, Subject } from '../types';

/** 화면 기준 데이터 모양. 백엔드 응답 이름이 다르면 api 함수 안에서 이 모양으로 바꿔서 돌려준다 */
export type StudentRow = {
  id: string;
  name: string;
  nativeLanguage: string;
  listening: Level | null;
  reading: Level | null;
  overall: Level | null;
  /** 최근 배포 문제 점수. 아직 안 풀었으면 null */
  recentScore: { correct: number; total: number } | null;
  wrongCount: number | null;
};

export type ClassDashboard = {
  classId: string;
  className: string;
  studentCount: number;
  levelCounts: { 초급: number; 중급: number; 고급: number };
  pendingReviewCount: number;
  students: StudentRow[];
};

export type Material = { id: string; subject: Subject; unit: string; title: string; date: string; isNew?: boolean };

export type MaterialList = { mySubject: Subject; materials: Material[] };

export type StudentHome = {
  studentName: string;
  className: string;
  todoCount: number;
  myLevel: { listening: Level; reading: Level };
  newMaterials: Material[];
  questionSets: { id: string; title: string; subject: Subject; progress: number; status: '풀기 전' | '완료' | '다시 풀기'; retryCount?: number }[];
};
