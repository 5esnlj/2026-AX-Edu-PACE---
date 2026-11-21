import type { ButtonHTMLAttributes } from 'react';
import styles from './Chip.module.css';

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean };

/** 필터·선택용 칩. 선택되면 차콜 바탕 흰 글씨 */
export function Chip({ selected, className, children, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={selected} className={[styles.chip, selected && styles.selected, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
