import { Plus } from 'lucide-react';
import { api, type Material } from '../api';
import { Button, MaterialCard, PageHeader } from '../components';
import { useApi } from '../hooks';
import styles from './pages.module.css';

/** 교사 03 · 자료 목록 (피그마 node-id 10-100). 내 교과 구역이 맨 위 */
export function MaterialListPage({ classId, onNew, onOpen }: { classId: string; onNew: () => void; onOpen: (m: Material) => void }) {
  const { data } = useApi(() => api.getMaterials(classId), [classId]);
  if (!data) return <p className={styles.loading}>불러오는 중…</p>;
  const mine = data.materials.filter((m) => m.subject === data.mySubject);
  const others = data.materials.filter((m) => m.subject !== data.mySubject);
  return (
    <>
      <PageHeader title="자료 제작" actions={<Button icon={<Plus size={20} />} onClick={onNew}>새 자료 만들기</Button>} />
      <Section label={`${data.mySubject} · 내 교과`} items={mine} onOpen={onOpen} />
      {others.length > 0 && <Section label="다른 교과" items={others} onOpen={onOpen} />}
    </>
  );
}

function Section({ label, items, onOpen }: { label: string; items: Material[]; onOpen: (m: Material) => void }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionLabel}>{label}</h2>
      <div className={styles.grid}>
        {items.map((m) => <MaterialCard key={m.id} subject={m.subject} unit={m.unit} pageTitle={m.title} name={m.title} date={m.date} onClick={() => onOpen(m)} />)}
      </div>
    </section>
  );
}
