import type { Tone } from '../../types';
import styles from './Avatar.module.css';

/** 이름 첫 글자 원. tone을 안 주면 레드(상단바 프로필) */
export function Avatar({ name, tone, size = 40 }: { name: string; tone?: Tone; size?: number }) {
  return (
    <span className={[styles.avatar, !tone && styles.primary].filter(Boolean).join(' ')} data-tone={tone} style={{ width: size, height: size }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}
