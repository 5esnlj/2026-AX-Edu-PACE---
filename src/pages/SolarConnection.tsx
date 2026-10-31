import { useState } from "react";
import { api, useAgentHealth } from "../api";
import { Notice } from "../components";

export function SolarConnection() {
  const { data, error, loading, reload } = useAgentHealth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);
  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ model: string; checked_at: string }>(
        "/agent/check",
        { method: "POST" },
      );
      setResult({
        connected: true,
        message: `${r.model} 호출 성공 · ${new Date(r.checked_at).toLocaleTimeString("ko-KR")}`,
      });
    } catch (e) {
      setResult({ connected: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Solar 연결 상태">
      <h2>Solar 연결 상태</h2>
      <p>
        {loading
          ? "설정을 확인하고 있어요…"
          : error
            ? "앱 서버의 상태를 확인하지 못했습니다. 실행 터미널을 확인해 주세요."
            : data?.provider !== "solar"
              ? "현재 규칙 기반 데모 모드입니다."
              : !data.configured
                ? "Solar 모드지만 API 키가 입력되지 않았습니다."
                : "Solar 키 입력 확인 · 실제 호출은 아래 버튼으로 확인하세요."}
      </p>
      {data?.provider === "solar" && (
        <p>
          선택한 모델: <strong>{data.model}</strong>
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="btn secondary small"
          disabled={busy || loading}
          onClick={() => {
            setResult(null);
            reload();
          }}
        >
          설정 새로고침
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={
            busy || loading || data?.provider !== "solar" || !data?.configured
          }
          onClick={check}
        >
          {busy ? "Solar 응답 확인 중…" : "Solar 실제 연결 확인"}
        </button>
      </div>
      <p className="muted">
        연결 확인은 수업 자료를 전송하지 않는 짧은 API 호출입니다. 소량의 API
        사용료가 발생할 수 있습니다.
      </p>
      {result && (
        <div role="status">
          <Notice tone={result.connected ? "positive" : ""}>
            {result.connected ? "연결 확인 성공: " : "연결 확인 실패: "}
            {result.message}
          </Notice>
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      <details className="evidence">
        <summary>Windows에서 Solar 설정하기</summary>
        <ol>
          <li>
            VS Code에서 package.json과 같은 폴더의 <code>.env</code> 파일을
            엽니다. 없다면 <code>.env.example</code>을 복사해 만듭니다.
          </li>
          <li>
            <code>IEUM_AGENT_PROVIDER=solar</code>,{" "}
            <code>UPSTAGE_API_KEY=본인의 실제 키</code>,{" "}
            <code>SOLAR_MODEL=solar-pro2</code>를 설정하고 저장합니다. 모델은
            Upstage 콘솔에서 사용할 수 있는 이름을 입력하세요.
          </li>
          <li>
            앱 실행 터미널에서 Ctrl+C 후 <code>npm.cmd run dev</code>를 다시
            실행합니다. 브라우저도 새로고침하세요.
          </li>
        </ol>
        <p>
          API 키는 이 화면이나 채팅에 입력하지 마세요. .env는 GitHub에 올라가지
          않으므로 PC별로 설정해야 합니다. Windows 환경 변수에 같은 항목이
          있다면 그 값이 .env보다 우선합니다.
        </p>
      </details>
    </section>
  );
}
