import { useEffect, useRef } from "react";
import { mountConvert, readingBand, type ConvertOptions } from "./engine";

// 민사 재판 예시 자료(원본 PDF가 이 경로)일 때만 원본 지면 변환 화면을 써요.
export const CIVIL_PDF = "/examples/civil-trial-source.pdf";
export function isCivilVariant(v?: {
  source_pdf_url?: string | null;
  reconstruction?: { document?: { source_pdf_url?: string | null } } | null;
}) {
  return (
    !!v &&
    (v.source_pdf_url || v.reconstruction?.document?.source_pdf_url) ===
      CIVIL_PDF
  );
}

type Props = Omit<ConvertOptions, "band"> & { reading: number };

export function ConvertPage(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<ReturnType<typeof mountConvert> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const knownKey = (props.known || []).join("|");
  useEffect(() => {
    if (!ref.current || props.reading <= 0) return;
    const p = latest.current;
    inst.current = mountConvert(ref.current, {
      ...p,
      band: readingBand(p.reading),
      onWord: (t, k) => latest.current.onWord?.(t, k),
      onChange: () => latest.current.onChange?.(),
    });
    return () => {
      inst.current?.destroy();
      inst.current = null;
    };
  }, [props.storageKey, props.mode, props.lang, props.reading]);
  useEffect(() => {
    inst.current?.update({
      scale: props.scale,
      showOriginal: props.showOriginal,
      known: latest.current.known,
    });
  }, [props.scale, props.showOriginal, knownKey]);
  if (props.reading <= 0) {
    return (
      <p>
        아직 읽기 진단 결과가 없어 수준별 변환 예시를 적용하지 않아요.{" "}
        <a href={CIVIL_PDF} target="_blank" rel="noreferrer">
          원본 PDF 보기
        </a>
      </p>
    );
  }
  return <div ref={ref} />;
}
