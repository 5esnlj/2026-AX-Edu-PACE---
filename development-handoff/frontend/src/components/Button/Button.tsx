import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary: 레드 주요 버튼 / secondary: 흰 바탕 보조 버튼 */
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
  block?: boolean;
};

export function Button({ variant = 'primary', icon, block, className, children, ...rest }: ButtonProps) {
  const cls = [styles.button, styles[variant], block && styles.block, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}
