import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './UploadBox.module.css';

/** PDF 올리기 칸(끌어 놓기 + 눌러서 선택) */
export function UploadBox({ onFiles, accept = 'application/pdf' }: { onFiles: (files: File[]) => void; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={[styles.box, over && styles.over].filter(Boolean).join(' ')}
      role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <Upload size={40} strokeWidth={2} className={styles.icon} />
      <span className={styles.label}>PDF 올리기</span>
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
    </div>
  );
}
