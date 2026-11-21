import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tone } from '../../types';
import styles from './SummaryTile.module.css';

type Props = { label: string; value: ReactNode; unit?: string; tone: Tone; onClick?: () => void };

/** 대시보드 요약 타일: 연한 색 + 색 제목 + 큰 숫자 */
export function SummaryTile({ label, value, unit, tone, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={styles.tile} data-tone={tone} onClick={onClick}>
      <span className={styles.top}>
        <span className={styles.label}>{label}</span>
        {onClick && <span className={styles.go}><ArrowUpRight size={16} strokeWidth={2.6} /></span>}
      </span>
      <span className={styles.value}>
        <span className={styles.number}>{value}</span>
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
    </Tag>
  );
}
