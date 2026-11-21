import { SUBJECT_TONE, type Subject } from '../../types';
import { NotchCard } from '../NotchCard/NotchCard';
import styles from './MaterialCard.module.css';

export type MaterialCardProps = {
  subject: Subject;
  /** 단원 번호(예: "03") */
  unit: string;
  /** 지면 미리보기에 들어가는 단원 제목 */
  pageTitle: string;
  /** 자료 이름(최대 2줄) */
  name: string;
  /** 날짜 또는 "새 자료" 같은 상태 */
  date: string;
  onClick?: () => void;
};

/** 자료 썸네일 카드(디지털교과서 지면 미리보기) */
export function MaterialCard({ subject, unit, pageTitle, name, date, onClick }: MaterialCardProps) {
  return (
    <NotchCard tone={SUBJECT_TONE[subject]} onClick={onClick} actionLabel={`${name} 열기`} height={300}>
      <div className={styles.thumb} aria-hidden>
        <div className={styles.page}>
          <div className={styles.unitRow}>
            <span className={styles.unit}>{unit}</span>
            <span className={styles.pageTitle}>{pageTitle}</span>
          </div>
          <span className={styles.line} />
          <span className={styles.line} />
          <span className={`${styles.line} ${styles.short}`} />
          <span className={styles.figure} />
        </div>
      </div>
      <div className={styles.info}>
        <span className={styles.subject}>{subject}</span>
        <span className={styles.name}>{name}</span>
        <span className={styles.date}>{date}</span>
      </div>
    </NotchCard>
  );
}
