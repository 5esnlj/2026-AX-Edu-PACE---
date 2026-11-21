import { api } from '../api';
import { Button, FolderCard, PageHeader, ProgressBar, TableCard } from '../components';
import table from '../components/TableCard/TableCard.module.css';
import { useApi } from '../hooks';
import styles from './pages.module.css';

/** 학생 03 · 내 대시보드 (피그마 node-id 11-278) */
export function StudentDashboard({ classId, onSolve, onOpenMaterial, onAllMaterials, onAllQuestions }: { classId: string; onSolve: (id: string) => void; onOpenMaterial: (id: string) => void; onAllMaterials: () => void; onAllQuestions: () => void }) {
  const { data } = useApi(() => api.getStudentHome(classId), [classId]);
  if (!data) return <p className={styles.loading}>불러오는 중…</p>;
  const todo = data.questionSets.find((q) => q.status === '풀기 전');
  const retry = data.questionSets.find((q) => q.status === '다시 풀기');
  return (
    <>
      <div className={styles.greetRow}>
        <div className={styles.greet}><PageHeader title={`안녕하세요, ${data.studentName}!`} /><p className={styles.sub}>오늘 풀 문제가 {data.todoCount}개 있어요</p></div>
        <div className={styles.todos}>
          {todo && (
            <div className={styles.todo} data-tone="red">
              <span><small>안 푼 문항</small><b>{todo.title}</b></span>
              <Button onClick={() => onSolve(todo.id)}>풀러 가기</Button>
            </div>
          )}
          {retry && (
            <div className={styles.todo} data-tone="yellow">
              <span><small>다시 풀 문제</small><b>틀린 문제 {retry.retryCount}개</b></span>
              <Button variant="secondary" onClick={() => onSolve(retry.id)}>다시 풀기</Button>
            </div>
          )}
        </div>
      </div>
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>새로 받은 자료</h2><button type="button" onClick={onAllMaterials}>전체보기 ›</button></div>
        <div className={styles.folders}>
          {data.newMaterials.map((m) => <FolderCard key={m.id} subject={m.subject} title={m.title} meta={m.date} badge={m.isNew ? { text: 'NEW', strong: true } : undefined} onClick={() => onOpenMaterial(m.id)} />)}
        </div>
      </section>
      <TableCard title="내 문항" onMore={onAllQuestions} grow>
        <table className={table.table}>
          <thead><tr><th>문항</th><th style={{ width: 120 }}>교과</th><th style={{ width: 260 }}>진행</th><th style={{ width: 150 }}>상태</th></tr></thead>
          <tbody>
            {data.questionSets.map((q) => (
              <tr key={q.id} className={table.rowLink} onClick={() => onSolve(q.id)}>
                <td><b>{q.title}</b></td>
                <td className={styles.sub}>{q.subject}</td>
                <td><span className={styles.score}><span className={styles.pct}>{Math.round(q.progress * 100)}%</span><ProgressBar value={q.progress} width={180} /></span></td>
                <td><b className={q.status === '풀기 전' ? styles.alert : q.status === '다시 풀기' ? styles.warn : styles.sub}>{q.status === '다시 풀기' ? `다시 풀 문제 ${q.retryCount}` : q.status}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
