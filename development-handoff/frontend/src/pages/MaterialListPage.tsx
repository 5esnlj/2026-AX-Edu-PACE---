import { api } from '../api';
import type { AreaCode } from '../api/wire';
import { Button, MaterialCard, PageHeader } from '../components';
import { useApi } from '../hooks';
import styles from './pages.module.css';
export function MaterialListPage({ classId, subject }: { classId: string; subject: AreaCode }) {
  const { data, error, retry } = useApi(() => api.getMaterials(classId, subject), [classId, subject]);
  if (error) return <div role="alert"><p>{error.message}</p><Button onClick={retry}>다시 불러오기</Button></div>;
  if (!data) return <p className={styles.loading}>불러오는 중…</p>;
  return <>
    <PageHeader title="자료 제작" actions={<Button disabled title="업로드·생성 화면은 다음 개발 단계입니다.">새 자료 만들기</Button>} />
    <p className={styles.sub}>내 교과 원본 자료 목록입니다. 원본을 바탕으로 학생별 전환 자료와 문항을 만들게 됩니다. 자료 상세·생성 화면은 아직 연결하지 않았습니다.</p>
    <section className={styles.section}><h2 className={styles.sectionLabel}>{data.mySubject} · 내 교과</h2>
      {!data.materials.length && <p>등록된 원본 자료가 없습니다.</p>}
      <div className={styles.grid}>{data.materials.map((m) => <MaterialCard key={m.id} subject={m.subject} unit={m.unit} pageTitle={m.title} name={m.title} date={m.date} />)}</div>
    </section>
  </>;
}
