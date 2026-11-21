import { useState } from 'react';
import type { ClassDashboard } from '../api';
import { Avatar, Button, Chip, LevelPill, PageHeader, ProgressBar, SummaryTile, TableCard } from '../components';
import table from '../components/TableCard/TableCard.module.css';
import type { Level, Tone } from '../types';
import styles from './pages.module.css';
const FILTERS: ('전체' | '진단 미완료' | Level)[] = ['전체', '초급 미달', '초급', '중급', '고급', '진단 미완료'];
const AVATAR_TONES: Tone[] = ['blue', 'yellow', 'green', 'orange', 'purple'];
export function TeacherDashboard({ data }: { data: ClassDashboard }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('전체');
  const rows = filter === '전체' ? data.students : data.students.filter((s) => filter === '진단 미완료' ? s.overall === null : s.overall === filter);
  return <>
    <PageHeader title={data.className} sub={`학생 ${data.studentCount}명 · ${data.subject} 수준`} actions={<><Button variant="secondary" disabled title="초대 화면은 다음 개발 단계입니다.">학생 초대</Button><Button variant="secondary" disabled title="클래스 공유 화면은 다음 개발 단계입니다.">클래스 공유</Button></>} />
    <div className={styles.tiles}>
      <SummaryTile label="전체 학생" value={data.studentCount} unit="명" tone="blue" />
      {(['초급 미달', '초급', '중급', '고급', '진단 미완료'] as const).map((level, i) => <SummaryTile key={level} label={level} value={data.levelCounts[level]} unit="명" tone={AVATAR_TONES[i]} />)}
    </div>
    <p className={styles.sub}>듣기·읽기·종합은 {data.subject} 영역의 진단 결과입니다. 최근 문제 풀이는 가장 최근 배포된 내 교과 문항 묶음의 최초 정답 수이며, 틀린 문제는 재풀이를 반영합니다.</p>
    <TableCard title="학생 명단" grow actions={<div className={styles.chips}>{FILTERS.map((f) => <Chip key={f} selected={f === filter} onClick={() => setFilter(f)}>{f}</Chip>)}</div>}>
      <table className={table.table}><thead><tr><th>이름</th><th>듣기</th><th>읽기</th><th>종합</th><th>최근 문제 풀이</th><th>틀린 문제</th></tr></thead><tbody>
        {rows.map((s, i) => <tr key={s.id}>
          <td><span className={styles.person}><Avatar name={s.name} tone={AVATAR_TONES[i % AVATAR_TONES.length]} /><span className={styles.personText}><b>{s.name}</b><small>{s.nativeLanguage}{s.diagnosticStatus === 'in_progress' ? ' · 진단 진행 중' : s.diagnosticStatus === 'not_started' ? ' · 진단 전' : ''}</small></span></span></td>
          <td><LevelPill level={s.listening} /></td><td><LevelPill level={s.reading} /></td><td><LevelPill level={s.overall} /></td>
          <td>{s.recentScore ? <span className={styles.score}><ProgressBar value={s.recentScore.total ? s.recentScore.correct / s.recentScore.total : 0} width={120} label="최초 정답 비율" /><span>{s.recentScore.correct} / {s.recentScore.total}</span></span> : s.recentStatus}</td>
          <td>{s.wrongCount ?? '–'}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan={6}>해당 조건의 학생이 없습니다.</td></tr>}
      </tbody></table>
    </TableCard>
  </>;
}
