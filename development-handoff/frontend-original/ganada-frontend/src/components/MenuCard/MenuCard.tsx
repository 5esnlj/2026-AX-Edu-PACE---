import type { ReactNode } from 'react';
import type { Tone } from '../../types';
import { NotchCard } from '../NotchCard/NotchCard';
import styles from './MenuCard.module.css';

/** 큰 메뉴 카드(클래스 목록 등): 색 제목 + 흰 아이콘 타일 + 파인 모서리 화살표 */
export function MenuCard({ title, icon, tone, onClick, height = 300 }: { title: string; icon: ReactNode; tone: Tone; onClick?: () => void; height?: number }) {
  return (
    <NotchCard tone={tone} onClick={onClick} actionLabel={`${title} 열기`} height={height}>
      <div className={styles.inner}>
        <h3 className={styles.title}>{title}</h3>
        <span className={styles.icon}>{icon}</span>
      </div>
    </NotchCard>
  );
}
