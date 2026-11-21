import logo from '../../assets/logo-symbol.svg';
import styles from './Logo.module.css';

/** 로고 심볼 + "가나다계단" 글자 */
export function Logo({ withName = true, height = 35 }: { withName?: boolean; height?: number }) {
  return (
    <span className={styles.logo}>
      <img src={logo} alt={withName ? '' : '가나다계단'} height={height} width={(height * 216) / 160} />
      {withName && <span className={styles.name}>가나다계단</span>}
    </span>
  );
}
