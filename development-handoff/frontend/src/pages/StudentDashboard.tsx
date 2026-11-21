import type { StudentHome } from '../api';
import { Button, FolderCard, PageHeader, ProgressBar, TableCard } from '../components';
import table from '../components/TableCard/TableCard.module.css';
import styles from './pages.module.css';
export function StudentDashboard({ data }: { data: StudentHome }) {
  const todo = data.questionSets.find((q) => q.unansweredCount > 0);
  const retry = data.questionSets.find((q) => q.wrongCount > 0);
  return <>
    <div className={styles.greetRow}>
      <div className={styles.greet}><PageHeader title={`안녕하세요, ${data.studentName}!`} /><p className={styles.sub}>아직 풀지 않은 문항이 {data.todoCount}개 있어요.</p></div>
      <div className={styles.todos}>
        {todo && <div className={styles.todo} data-tone="red"><span><small>안 푼 문항</small><b>{todo.title}</b></span><Button disabled title="문제 풀이 화면은 다음 개발 단계입니다.">풀러 가기</Button></div>}
        {retry && <div className={styles.todo} data-tone="yellow"><span><small>다시 풀 문제</small><b>틀린 문항 {retry.wrongCount}개</b></span><Button variant="secondary" disabled title="재풀이 화면은 다음 개발 단계입니다.">다시 풀기</Button></div>}
      </div>
    </div>
    <p className={styles.sub}>현재는 대시보드 조회를 연결했습니다. 자료 열기와 문제 풀이 화면은 다음 개발 단계입니다.</p>
    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>최근 받은 자료</h2><button type="button" disabled title="자료 전체 목록 화면은 다음 개발 단계입니다.">전체보기 ›</button></div>
      {!data.newMaterials.length && <p>아직 전달받은 자료가 없습니다.</p>}
      <div className={styles.folders}>{data.newMaterials.map((m) => <FolderCard key={m.id} subject={m.subject} title={m.title} meta={m.date} badge={m.isNew ? { text: 'NEW', strong: true } : undefined} />)}</div>
      <small className={styles.sub}>NEW는 최근 7일 이내에 배포된 자료를 뜻합니다.</small>
    </section>
    <TableCard title="내 문항" grow><table className={table.table}>
      <thead><tr><th>문항</th><th>교과</th><th>제출 진행</th><th>상태</th><th>현재 틀린 문항</th></tr></thead>
      <tbody>{data.questionSets.map((q) => <tr key={q.id}><td><b>{q.title}</b></td><td>{q.subject}</td><td><span className={styles.score}><span className={styles.pct}>{Math.round(q.progress * 100)}%</span><ProgressBar value={q.progress} width={150} label="제출 진행률" /></span></td><td>{q.status}</td><td>{q.wrongCount}</td></tr>)}
      {!data.questionSets.length && <tr><td colSpan={5}>아직 전달받은 문항이 없습니다.</td></tr>}</tbody>
    </table></TableCard>
  </>;
}
