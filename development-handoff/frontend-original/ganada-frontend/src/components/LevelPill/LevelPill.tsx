import { LEVEL_TONE, type Level } from '../../types';
import styles from './LevelPill.module.css';

/** 수준 표시(루브릭 기준 4단계). 생활한국어처럼 기준이 없으면 level을 비우면 "–" */
export function LevelPill({ level }: { level?: Level | null }) {
  if (!level) return <span className={styles.empty}>–</span>;
  const tone = LEVEL_TONE[level];
  return (
    <span className={[styles.pill, !tone && styles.below].filter(Boolean).join(' ')} data-tone={tone ?? undefined}>
      {level}
    </span>
  );
}
