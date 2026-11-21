import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { api, type StudentRow } from '../api';
import { Avatar, Button, Chip, LevelPill, PageHeader, ProgressBar, SummaryTile, TableCard } from '../components';
import table from '../components/TableCard/TableCard.module.css';
import { useApi } from '../hooks';
import type { Level, Tone } from '../types';
import styles from './pages.module.css';

const FILTERS: ('전체' | Level)[] = ['전체', '초급', '중급', '고급'];
const AVATAR_TONES: Tone[] = ['blue', 'yellow', 'green', 'orange', 'purple'];

/** 교사 02 · 클래스 대시보드 (피그마 node-id 10-51) */
export function TeacherDashboard({ classId, onOpenStudent }: { classId: string; onOpenStudent: (id: string) => void }) {
  const { data } = useApi(() => api.getClassDashboard(classId), [classId]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('전체');
  if (!data) return <p className={styles.loading}>불러오는 중…</p>;

  const rows = filter === '전체' ? data.students : data.students.filter((s) => s.overall === filter);

  return (
    <>
      <PageHeader title={data.className} sub={`학생 ${data.studentCount}명`} actions={<><Button variant="secondary">학생 초대</Button><Button variant="secondary">클래스 공유</Button></>} />
      <div className={styles.tiles}>
        <SummaryTile label="전체 학생" value={data.studentCount} unit="명" tone="blue" />
        <SummaryTile label="초급" value={data.levelCounts.초급} unit="명" tone="orange" />
        <SummaryTile label="중급" value={data.levelCounts.중급} unit="명" tone="yellow" />
        <SummaryTile label="고급" value={data.levelCounts.고급} unit="명" tone="green" />
      </div>
      <TableCard
        title="학생 명단"
        grow
        actions={<div className={styles.chips}>{FILTERS.map((f) => <Chip key={f} selected={f === filter} onClick={() => setFilter(f)}>{f}</Chip>)}</div>}
      >
        <table className={table.table}>
          <thead>
            <tr>
              <th>이름</th><th style={{ width: 110 }}>듣기</th><th style={{ width: 110 }}>읽기</th><th style={{ width: 110 }}>종합</th>
              <th style={{ width: 250 }}>최근 문제 풀이</th><th style={{ width: 90 }} className={table.right}>틀린 문제</th><th style={{ width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => <Row key={s.id} s={s} tone={AVATAR_TONES[i % AVATAR_TONES.length]} onClick={() => onOpenStudent(s.id)} />)}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

function Row({ s, tone, onClick }: { s: StudentRow; tone: Tone; onClick: () => void }) {
  const manyWrong = (s.wrongCount ?? 0) >= 4;
  return (
    <tr className={table.rowLink} onClick={onClick}>
      <td>
        <span className={styles.person}>
          <Avatar name={s.name} tone={tone} />
          <span className={styles.personText}><b>{s.name}</b><small>{s.nativeLanguage}</small></span>
        </span>
      </td>
      <td><LevelPill level={s.listening} /></td>
      <td><LevelPill level={s.reading} /></td>
      <td><LevelPill level={s.overall} /></td>
      <td>
        {s.recentScore ? (
          <span className={styles.score}>
            <ProgressBar value={s.recentScore.correct / s.recentScore.total} width={150} label="최근 문제 점수" />
            <span>{s.recentScore.correct} / {s.recentScore.total}</span>
          </span>
        ) : <b className={styles.alert}>아직 안 풂</b>}
      </td>
      <td className={table.right}><b className={manyWrong ? styles.alert : undefined}>{s.wrongCount ?? '–'}</b></td>
      <td className={table.right}><ChevronRight size={20} className={styles.chev} /></td>
    </tr>
  );
}
