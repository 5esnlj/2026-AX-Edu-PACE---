import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tone } from '../../types';
import styles from './NotchCard.module.css';

type Props = {
  tone: Tone;
  children: ReactNode;
  onClick?: () => void;
  /** 화살표 버튼의 스크린리더용 이름 */
  actionLabel?: string;
  className?: string;
  height?: number;
};

/**
 * 오른쪽 아래 모서리를 둥글게 파낸 카드(IBK 레퍼런스).
 * 카드 바탕만 CSS mask로 파내서, 어떤 배경 위에 놓여도 파인 자리가 자연스럽게 보인다.
 */
export function NotchCard({ tone, children, onClick, actionLabel = '열기', className, height }: Props) {
  return (
    <div className={[styles.card, onClick && styles.clickable, className].filter(Boolean).join(' ')} data-tone={tone} style={height ? { height } : undefined} onClick={onClick}>
      <div className={styles.content}>{children}</div>
      <button type="button" className={styles.arrow} aria-label={actionLabel} disabled={!onClick} title={!onClick ? '상세 화면은 다음 개발 단계입니다.' : undefined} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
        <ArrowUpRight size={24} strokeWidth={2.6} />
      </button>
    </div>
  );
}
