import styles from './ProgressBar.module.css';

/** value: 0~1. width를 안 주면 부모 너비에 맞춤 */
export function ProgressBar({ value, width, label }: { value: number; width?: number; label?: string }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <span className={styles.track} style={width ? { width } : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <span className={styles.fill} style={{ width: `${v * 100}%` }} />
    </span>
  );
}
