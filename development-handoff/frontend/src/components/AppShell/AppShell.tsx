import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

/** 화면 틀: 위 상단바, 아래 [사이드바 | 본문]. 사이드바 없이 쓰면 가운데 정렬 본문 */
export function AppShell({ topBar, sidebar, children }: { topBar: ReactNode; sidebar?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {topBar}
      <div className={styles.row}>
        {sidebar}
        <main className={[styles.main, !sidebar && styles.centered].filter(Boolean).join(' ')}>{children}</main>
      </div>
    </div>
  );
}

/** 본문 맨 위 제목줄: 제목(+보조 글) 왼쪽, 버튼 오른쪽 */
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className={styles.header}>
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        {sub && <span className={styles.sub}>{sub}</span>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
