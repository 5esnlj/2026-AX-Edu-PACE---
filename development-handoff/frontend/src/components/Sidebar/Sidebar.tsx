import { BarChart3, ChevronDown, ClipboardCheck, FileText, LayoutDashboard, Play, Plus, Target, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Role } from '../../types';
import styles from './Sidebar.module.css';

export type NavKey = 'dashboard' | 'materials' | 'questions' | 'levels' | 'diagnosis';

const NAV: Record<Role, { key: NavKey; label: string; icon: LucideIcon }[]> = {
  teacher: [
    { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { key: 'materials', label: '자료 제작', icon: FileText },
    { key: 'questions', label: '문항 생성', icon: ClipboardCheck },
    { key: 'levels', label: '학생 수준', icon: BarChart3 },
  ],
  student: [
    { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { key: 'materials', label: '받은 자료', icon: FileText },
    { key: 'questions', label: '내 문항', icon: ClipboardCheck },
    { key: 'diagnosis', label: '진단 결과', icon: Target },
  ],
};

const CTA: Record<Role, { label: string; icon: LucideIcon }> = {
  teacher: { label: '새 자료 만들기', icon: Plus },
  student: { label: '문제 풀러 가기', icon: Play },
};

type Props = {
  role: Role;
  className: string;
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  onCta?: () => void;
  onClassMenu?: () => void;
  /** 아래쪽 칸: 교사는 "검토 기다리는 문항", 학생은 "내 수준" */
  bottom?: ReactNode;
  enabledKeys?: NavKey[];
};

/** 왼쪽 사이드바. 지금 보는 메뉴(active)만 연한 분홍 + 레드 글씨 */
export function Sidebar({ role, className, active, onNavigate, onCta, onClassMenu, bottom, enabledKeys }: Props) {
  const Cta = CTA[role];
  return (
    <aside className={styles.sidebar}>
      <button type="button" className={styles.classSelect} onClick={onClassMenu} disabled={!onClassMenu} title="클래스 선택은 본문 위에서 할 수 있습니다.">
        <span>{className}</span>
        <ChevronDown size={20} />
      </button>
      <button type="button" className={styles.cta} onClick={onCta} disabled={!onCta} title={!onCta ? '해당 화면은 다음 개발 단계입니다.' : undefined}>
        <Cta.icon size={20} />
        {Cta.label}
      </button>
      <nav className={styles.nav}>
        {NAV[role].map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" className={[styles.item, key === active && styles.active].filter(Boolean).join(' ')} aria-current={key === active ? 'page' : undefined} onClick={() => onNavigate(key)} disabled={enabledKeys && !enabledKeys.includes(key)} title={enabledKeys && !enabledKeys.includes(key) ? '해당 화면은 다음 개발 단계입니다.' : undefined}>
            <Icon size={22} />
            {label}
          </button>
        ))}
      </nav>
      {bottom && <div className={styles.bottom}>{bottom}</div>}
    </aside>
  );
}
