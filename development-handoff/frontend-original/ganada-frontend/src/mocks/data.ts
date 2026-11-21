import type { ClassDashboard, MaterialList, StudentHome } from '../api/types';

/** 예시 데이터(피그마 시안과 같은 값). config.USE_MOCK이 true일 때만 쓰인다 */
export const mockClassDashboard: ClassDashboard = {
  classId: 'c-302',
  className: '3학년 2반',
  studentCount: 12,
  levelCounts: { 초급: 5, 중급: 4, 고급: 3 },
  pendingReviewCount: 2,
  students: [
    { id: 's1', name: '아지즈', nativeLanguage: '우즈베크어', listening: '중급', reading: '초급', overall: '초급', recentScore: { correct: 8, total: 10 }, wrongCount: 2 },
    { id: 's2', name: '바트볼드', nativeLanguage: '몽골어', listening: '중급', reading: '중급', overall: '중급', recentScore: { correct: 5, total: 10 }, wrongCount: 5 },
    { id: 's3', name: '리나', nativeLanguage: '중국어', listening: '고급', reading: '고급', overall: '고급', recentScore: null, wrongCount: null },
    { id: 's4', name: '응우옌 안', nativeLanguage: '베트남어', listening: '초급', reading: '초급', overall: '초급', recentScore: { correct: 6, total: 10 }, wrongCount: 4 },
    { id: 's5', name: '사샤', nativeLanguage: '러시아어', listening: '고급', reading: '중급', overall: '중급', recentScore: { correct: 9, total: 10 }, wrongCount: 1 },
  ],
};

export const mockMaterialList: MaterialList = {
  mySubject: '사회',
  materials: [
    { id: 'm1', subject: '사회', unit: '03', title: '재판의 의미와 공정한 재판', date: '11.20' },
    { id: 'm2', subject: '사회', unit: '02', title: '일상생활과 법', date: '11.13' },
    { id: 'm3', subject: '사회', unit: '01', title: '법의 의미와 역할', date: '11.06' },
    { id: 'm4', subject: '수학', unit: '04', title: '분수의 덧셈', date: '11.18' },
    { id: 'm5', subject: '과학', unit: '02', title: '물의 순환', date: '11.10' },
  ],
};

export const mockStudentHome: StudentHome = {
  studentName: '아지즈',
  className: '3학년 2반',
  todoCount: 1,
  myLevel: { listening: '중급', reading: '초급' },
  newMaterials: [
    { id: 'm1', subject: '사회', unit: '03', title: '재판의 의미와 공정한 재판', date: '11.20 받음', isNew: true },
    { id: 'm4', subject: '수학', unit: '04', title: '분수의 덧셈', date: '11.18 받음' },
    { id: 'm2', subject: '사회', unit: '02', title: '일상생활과 법', date: '11.13 받음' },
  ],
  questionSets: [
    { id: 'q1', title: '재판의 의미 · 10문항', subject: '사회', progress: 0, status: '풀기 전' },
    { id: 'q2', title: '분수의 덧셈 · 8문항', subject: '수학', progress: 1, status: '다시 풀기', retryCount: 2 },
    { id: 'q3', title: '일상생활과 법 · 8문항', subject: '사회', progress: 0.62, status: '완료' },
  ],
};
