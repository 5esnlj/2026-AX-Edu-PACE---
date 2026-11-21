import type { Level, Subject } from '../types';
import type { ClassDashboard, Material, MaterialList, StudentHome } from './types';
import type { AreaCode, LevelCode, SourceOut, StudentDashboardOut, TeacherDashboardOut } from './wire';
export const SUBJECT_LABELS: Record<AreaCode, Subject> = { korean: '국어', math: '수학', social: '사회', science: '과학', daily: '생활한국어' };
const LEVEL_LABELS: Record<LevelCode, Level> = { below_beginner: '초급 미달', beginner: '초급', intermediate: '중급', advanced: '고급' };
const LANGUAGES: Record<string, string> = { ko: '한국어', zh: '중국어', vi: '베트남어', mn: '몽골어', ru: '러시아어', uz: '우즈베크어', ja: '일본어', en: '영어' };
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '미배포'; }
export function adaptTeacherDashboard(raw: TeacherDashboardOut): ClassDashboard {
  return {
    classId: raw.classId, className: raw.className, selectedArea: raw.selectedArea, subject: SUBJECT_LABELS[raw.selectedArea], studentCount: raw.studentCount,
    levelCounts: { '초급 미달': raw.levelCounts.below_beginner, 초급: raw.levelCounts.beginner, 중급: raw.levelCounts.intermediate, 고급: raw.levelCounts.advanced, '진단 미완료': raw.levelCounts.not_diagnosed },
    pendingReviewCount: raw.pendingReviewQuizSetCount,
    students: raw.students.map((s) => ({
      id: s.studentMemberId, name: s.displayName, nativeLanguage: LANGUAGES[s.nativeLanguage] ?? s.nativeLanguage, diagnosticStatus: s.diagnosticStatus,
      listening: s.parts.find((p) => p.area === raw.selectedArea && p.skill === 'listening')?.level ? LEVEL_LABELS[s.parts.find((p) => p.area === raw.selectedArea && p.skill === 'listening')!.level] : null,
      reading: s.parts.find((p) => p.area === raw.selectedArea && p.skill === 'reading')?.level ? LEVEL_LABELS[s.parts.find((p) => p.area === raw.selectedArea && p.skill === 'reading')!.level] : null,
      overall: s.aggregate ? LEVEL_LABELS[s.aggregate.level] : null,
      recentScore: s.latestQuiz?.firstCorrectCount != null ? { correct: s.latestQuiz.firstCorrectCount, total: s.latestQuiz.questionCount } : null,
      recentStatus: !s.latestQuiz ? '배포 없음' : s.latestQuiz.status === 'completed' ? '완료' : s.latestQuiz.status === 'in_progress' ? '푸는 중' : '풀기 전',
      wrongCount: s.latestQuiz && s.latestQuiz.submittedQuestionCount > 0 ? s.latestQuiz.currentWrongCount : null,
    })),
  };
}
export function adaptSources(raw: SourceOut[], subject: AreaCode): MaterialList {
  return { mySubject: SUBJECT_LABELS[subject], materials: raw.filter((m) => m.subject === subject).map((m): Material => ({ id: m.id, subject: SUBJECT_LABELS[m.subject], unit: m.unit, title: m.title, date: dateLabel(m.createdAt) })) };
}
export function adaptStudentDashboard(raw: StudentDashboardOut): StudentHome {
  const listening = raw.parts.find((p) => p.area === raw.selectedArea && p.skill === 'listening');
  const reading = raw.parts.find((p) => p.area === raw.selectedArea && p.skill === 'reading');
  return {
    studentName: raw.displayName, className: raw.className, selectedArea: raw.selectedArea, subject: SUBJECT_LABELS[raw.selectedArea], todoCount: raw.unansweredQuestionCount,
    myLevel: { listening: listening ? LEVEL_LABELS[listening.level] : null, reading: reading ? LEVEL_LABELS[reading.level] : null, listeningScore: listening?.score ?? null, readingScore: reading?.score ?? null },
    newMaterials: raw.newMaterials.map((m) => ({ id: m.id, subject: SUBJECT_LABELS[m.subject], unit: m.unit, title: m.title, date: dateLabel(m.publishedAt), isNew: m.isRecentPublished })),
    questionSets: raw.quizzes.map((q) => ({ id: q.id, title: q.title, subject: SUBJECT_LABELS[q.subject], progress: q.progress.questionCount ? q.progress.submittedQuestionCount / q.progress.questionCount : 0, wrongCount: q.progress.currentWrongCount, unansweredCount: q.progress.unansweredQuestionCount, status: q.progress.status === 'not_started' ? '풀기 전' : q.progress.status === 'in_progress' ? '푸는 중' : q.progress.currentWrongCount > 0 ? '다시 풀기' : '완료' })),
  };
}
