import type { ReactNode } from 'react';
import styles from './TableCard.module.css';

type Props = { title: string; actions?: ReactNode; onMore?: () => void; children: ReactNode; grow?: boolean };

/** 흰 카드 + 제목줄(오른쪽에 필터/전체보기) + 표. 표는 children으로 <table className={tableStyles.table}> */
export function TableCard({ title, actions, onMore, children, grow }: Props) {
  return (
    <section className={[styles.card, grow && styles.grow].filter(Boolean).join(' ')}>
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {actions}
        {onMore && <button type="button" className={styles.more} onClick={onMore}>전체보기 ›</button>}
      </header>
      {children}
    </section>
  );
}
