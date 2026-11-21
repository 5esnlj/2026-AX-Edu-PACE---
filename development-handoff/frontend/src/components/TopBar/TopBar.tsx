import { Bell, Search } from 'lucide-react';
import { Avatar } from '../Avatar/Avatar';
import { Logo } from '../Logo/Logo';
import styles from './TopBar.module.css';

type Props = { userName: string; onSearch?: (q: string) => void; onLogoClick?: () => void };

/** 상단바: 로고 · 검색 · 알림 · 사용자 */
export function TopBar({ userName, onSearch, onLogoClick }: Props) {
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <button type="button" className={styles.logoBtn} onClick={onLogoClick} disabled={!onLogoClick} aria-label="처음 화면으로">
          <Logo />
        </button>
        <label className={styles.search}>
          <Search size={20} />
          <input disabled={!onSearch} title={!onSearch ? '검색은 현재 개발 범위에 없습니다.' : undefined} placeholder="자료·문항 검색" onKeyDown={(e) => e.key === 'Enter' && onSearch?.((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div className={styles.right}>
        <button type="button" className={styles.icon} aria-label="알림 (현재 개발 범위에 없음)" disabled title="알림은 현재 개발 범위에 없습니다."><Bell size={24} /></button>
        <span className={styles.user}>{userName}</span>
        <Avatar name={userName} size={44} />
      </div>
    </header>
  );
}
