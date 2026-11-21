import { SUBJECT_TONE, type Subject } from '../../types';
import styles from './FolderCard.module.css';

type Props = { subject: Subject; title: string; meta: string; badge?: { text: string; strong?: boolean }; onClick?: () => void };

/** 폴더 모양 카드(학생 대시보드 "새로 받은 자료") */
export function FolderCard({ subject, title, meta, badge, onClick }: Props) {
  return (
    <button type="button" className={styles.folder} data-tone={SUBJECT_TONE[subject]} onClick={onClick} disabled={!onClick} title={!onClick ? '자료 상세 화면은 다음 개발 단계입니다.' : undefined}>
      <span className={styles.tab} aria-hidden />
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.subject}>{subject}</span>
          {badge && <span className={[styles.badge, badge.strong && styles.strong].filter(Boolean).join(' ')}>{badge.text}</span>}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
      </span>
    </button>
  );
}
