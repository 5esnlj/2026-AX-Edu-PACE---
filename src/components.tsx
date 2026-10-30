import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? "small" : ""}`}>
      <img
        src="/logo.svg"
        className="logo-mark"
        width="48"
        height="36"
        alt=""
      />
      <span>가나다계단</span>
      {!small && <small>배움의 다음 칸을 함께</small>}
    </div>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({
  name,
  index = 0,
  size = "",
}: {
  name: string;
  index?: number;
  size?: string;
}) {
  return (
    <span className={`avatar avatar-${index % 5} ${size}`}>
      {name.slice(0, 1)}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  detail,
  to,
  children,
}: {
  title: string;
  detail?: string;
  to?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          전체 보기 <ChevronRight size={15} />
        </Link>
      )}
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={24} className="spin" /> 교실을 준비하고 있어요…
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="empty error" role="alert">
      <AlertCircle size={30} />
      <h2>불러오지 못했어요</h2>
      <p>{message}</p>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-sprout">✧</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Notice({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`notice ${tone}`}>
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Stepper({ step }: { step: number }) {
  return (
    <div className="stepper">
      {["자료와 학생 선택", "맞춤 지원 설정", "교사 검토·배포"].map(
        (name, i) => (
          <div
            key={name}
            className={i + 1 === step ? "active" : i + 1 < step ? "done" : ""}
          >
            <span>{i + 1 < step ? <Check size={14} /> : i + 1}</span>
            {name}
            {i < 2 && <ChevronRight size={16} />}
          </div>
        ),
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    container.current?.querySelector<HTMLElement>("button, input")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select, textarea, a[href]",
        ) || [],
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={container}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
    id: number;
  } | null>(null);
  const show = (message: string, error?: boolean) => {
    const id = Date.now();
    setToast({ message, error, id });
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 6000);
  };
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function ArrowLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="btn" to={to}>
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}
