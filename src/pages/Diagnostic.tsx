import { ArrowRight, Check, CheckCircle2, Sprout } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Notice, PageHeading, useToast } from "../components";
import { useSession } from "../session";
import { levelNames, skillLabels } from "../types";

export function Diagnostic() {
  const { user, refresh } = useSession();
  const student = user!.student!;
  const [values, setValues] = useState({
    ...student.levels,
    everyday: student.everyday,
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const prompts = {
    listening: "선생님의 수업 설명을 들으면 얼마나 이해할 수 있나요?",
    speaking: "수업에서 배운 내용을 한국어로 얼마나 말할 수 있나요?",
    reading: "교과서의 글을 읽으면 얼마나 이해할 수 있나요?",
    writing: "배운 내용을 한국어 문장으로 얼마나 쓸 수 있나요?",
    everyday: "친구와 일상적인 대화는 얼마나 편하게 할 수 있나요?",
  };
  async function save() {
    setBusy(true);
    try {
      await api("/diagnostic", {
        method: "POST",
        body: JSON.stringify(values),
      });
      await refresh();
      setSaved(true);
      toast("자가 점검을 저장했어요. 나의 배움길에 반영했어요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="나의 출발점 알아보기"
        title="한국어, 나는 이만큼 편해요"
        description="잘하고 못하는 시험이 아니에요. 지금 나에게 편한 정도를 알려 주세요."
      />
      <Notice>
        자가 점검 데모입니다. 듣기·말하기를 녹음하거나 실제 수행을 평가하지
        않습니다. 결과는 1~4단계로 저장되며 표준화 진단을 대신하지 않습니다.
      </Notice>
      <div className="diagnostic-layout">
        <section className="panel diagnostic-panel">
          {Object.entries(prompts).map(([key, prompt], i) => (
            <fieldset key={key}>
              <legend>
                <span className="question-index">0{i + 1}</span>
                <span>
                  <strong>
                    {key === "everyday"
                      ? "생활 한국어"
                      : skillLabels[key as keyof typeof skillLabels]}
                  </strong>
                  <small>{prompt}</small>
                </span>
              </legend>
              <div className="diagnostic-options">
                {levelNames.map((label, index) => (
                  <label
                    className={
                      values[key as keyof typeof values] === index + 1
                        ? "selected"
                        : ""
                    }
                    key={label}
                  >
                    <input
                      type="radio"
                      name={key}
                      value={index + 1}
                      checked={values[key as keyof typeof values] === index + 1}
                      onChange={() => {
                        setValues({ ...values, [key]: index + 1 });
                        setSaved(false);
                      }}
                    />
                    <span>{index + 1}</span>
                    <strong>{label}</strong>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button className="btn" onClick={save} disabled={busy}>
            <Check size={17} />
            {busy ? "저장 중…" : "나의 자가 점검 저장하기"}
          </button>
        </section>
        <aside>
          <div className="insight-card">
            <span className="insight-icon">
              <Sprout size={24} />
            </span>
            <h3>
              지금의 모습은
              <br />
              성장의 시작점이에요.
            </h3>
            <p>
              한국어가 익숙해지는 속도는 모두 달라요. 어려운 부분을 알면, 더
              편안한 배움길을 찾을 수 있어요.
            </p>
          </div>
          {saved && (
            <section className="panel success-card">
              <CheckCircle2 size={30} />
              <h3>나의 출발점을 기록했어요!</h3>
              <p>
                새 결과는 다음에 생성하는 맞춤 자료와 배움길에 반영돼요. 이미
                배포된 자료는 그대로예요.
              </p>
              <Link className="btn full" to="/app/roadmap">
                나의 배움길 보기
                <ArrowRight size={16} />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
