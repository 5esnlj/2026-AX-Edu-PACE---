import {
  CheckCircle2,
  ClipboardCheck,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";
import { Notice, PageHeading, SectionTitle } from "../components";

export function About() {
  return (
    <>
      <PageHeading
        eyebrow="다름을 잇고, 배움을 넓히다"
        title="이음이 만드는 교실"
        description="함께 배울 수 있도록, 한국어와 교과 지식 사이에 디딤돌을 놓습니다."
      />
      <section className="about-hero">
        <Sprout size={37} />
        <h2>
          “한국어가 어려운 걸까,
          <br />
          아직 개념이 낯선 걸까?”
        </h2>
        <p>
          일상의 한국어와 학습의 한국어는 다를 수 있어요.
          <br />
          이음은 교사가 학생의 학습을 세심하게 이해하고,
          <br />
          학생에게 맞는 배움의 길을 함께 찾도록 돕습니다.
        </p>
      </section>
      <div className="about-grid">
        {[
          {
            icon: Users,
            title: "한 교실, 여러 속도",
            text: "모두 같은 핵심 개념을 배우되, 한국어 수준과 주 사용 언어에 따라 다른 도움을 제공해요.",
          },
          {
            icon: ShieldCheck,
            title: "교사의 판단을 중심에",
            text: "생성된 글과 번역은 교사 검토 후에만 배포돼요. 참고 신호를 확정 진단으로 사용하지 않아요.",
          },
          {
            icon: ClipboardCheck,
            title: "단서 대신 공정한 기회",
            text: "이해 확인에서는 정답 단서가 되는 병기·해설을 제출 전 제공하지 않아요.",
          },
        ].map((c) => (
          <section className="panel" key={c.title}>
            <c.icon size={25} />
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </section>
        ))}
      </div>
      <section className="panel">
        <SectionTitle title="이 데모에서 경험할 수 있어요" />
        <div className="capability-list">
          {[
            [
              "자료 준비",
              "텍스트 PDF 추출, 학생별 자료 생성, 교사 수정·검토·배포",
            ],
            [
              "학생의 학습",
              "브라우저 읽어주기, 확대·축소, 개념 카드, 단어장·메모 저장",
            ],
            [
              "배움의 확인",
              "정치 단원 예제 문항, 응답 비교 리포트, 자가 점검과 배움길",
            ],
            [
              "언어 지원",
              "5개 언어 예시 교과어 대역표, 번역 후보와 참고 대역 비교",
            ],
            [
              "교실 소통",
              "역할별 접근, 학급 학생 보기, 데모 메시지와 초대 코드",
            ],
          ].map(([title, description]) => (
            <div key={title}>
              <CheckCircle2 size={17} />
              <strong>{title}</strong>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </section>
      <Notice>
        현재는 규칙 기반 에이전트와 합성 학생 데이터로 작동하는 해커톤
        프레임워크입니다. 실제 AI 재구성·번역, 스캔본 OCR, 표준화 진단, 음성
        수행 평가, 실제 가입·인증 및 외부 초대 발송은 후속 연결이 필요합니다.
        실제 학생에게 사용하기 전에 번역·평가 타당성·개인정보 보호를 검토해야
        합니다.
      </Notice>
    </>
  );
}
