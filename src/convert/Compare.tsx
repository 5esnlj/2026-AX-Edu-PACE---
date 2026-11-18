import { CIVIL_PDF } from "./ConvertPage";

// 변환된 자료와 나란히 보여 줄 원본 자료.
// 민사 재판 예시는 원본 지면 그림, 그 밖의 자료는 교사가 넣은 원문 글을 보여 줘요.
export function OriginalSource({
  text,
  pdfUrl,
  fontSize,
}: {
  text: string;
  pdfUrl?: string | null;
  fontSize?: number;
}) {
  if (pdfUrl === CIVIL_PDF) {
    return (
      <div className="compare-pages">
        {[1, 2].map((page) => (
          <img
            key={page}
            src={`/examples/civil-trial-page-${page}.png`}
            alt={`원본 교과서 ${209 + page}쪽`}
            loading="lazy"
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className="original-text"
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {text
        .split("\n")
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}
