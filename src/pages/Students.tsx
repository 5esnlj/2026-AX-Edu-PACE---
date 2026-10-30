import { ChevronRight, Copy, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useResource } from "../api";
import {
  Avatar,
  Badge,
  ErrorState,
  Loading,
  Modal,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import { languages, type Student } from "../types";

export function Students() {
  const { data, error, reload } = useResource<Student[]>("/students");
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState<{
    code: string;
    expires_at: string;
    notice: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function createInvite() {
    setBusy(true);
    try {
      setInvite(await api("/invitations", { method: "POST" }));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeading
        eyebrow="서로를 알아가는 교실"
        title="우리 반 학생"
        description="생활의 유창함 너머, 학생마다 다른 학습 한국어를 살펴봐요."
        action={
          <button className="btn" onClick={createInvite} disabled={busy}>
            <Plus size={17} />
            초대 코드 만들기
          </button>
        }
      />
      <div className="class-overview">
        <div>
          <Users size={25} />
          <span>
            <strong>1학년 3반</strong>
            <small>함께하는 학생 {data.length}명</small>
          </span>
        </div>
        <div className="class-languages">
          {Object.entries(languages).map(([id, name]) => (
            <Badge key={id} tone="neutral">
              {name} {data.filter((s) => s.language === id).length}명
            </Badge>
          ))}
        </div>
      </div>
      <div className="toolbar">
        <h2>
          학생 목록 <span className="count">{data.length}</span>
        </h2>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="학생 검색"
            placeholder="이름 또는 언어 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <section className="panel no-padding">
        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>주 사용 언어</th>
                <th>듣기</th>
                <th>말하기</th>
                <th>읽기</th>
                <th>쓰기</th>
                <th>기록 출처</th>
                <th>
                  <span className="sr-only">상세 보기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((s) =>
                  `${s.name}${languages[s.language]}`.includes(search),
                )
                .map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      <div className="student-name">
                        <Avatar name={s.name} index={i} />
                        <strong>{s.name}</strong>
                      </div>
                    </td>
                    <td>{languages[s.language]}</td>
                    {Object.values(s.levels).map((v, i) => (
                      <td key={i}>
                        <span
                          className={`level-pill ${v <= 2 ? "level-low" : ""}`}
                        >
                          {v}단계
                        </span>
                      </td>
                    ))}
                    <td>
                      <Badge tone="neutral">
                        {s.diagnostic_source === "self"
                          ? "자가 점검"
                          : "합성 예시"}
                      </Badge>
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/app/reports?student=${s.id}`}
                      >
                        리포트
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <Notice>
        설계안의 해커톤 미션에 따라 1~4단계 척도를 사용합니다. 현재 값은 합성
        예시 또는 학생의 자가 점검이며, 표준화된 한국어 진단평가 결과가
        아닙니다.
      </Notice>
      {invite && (
        <Modal title="학급 초대 코드" onClose={() => setInvite(null)}>
          <p className="muted">{invite.notice}</p>
          <div className="invite-code">{invite.code}</div>
          <p>
            만료:{" "}
            {new Date(invite.expires_at).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </p>
          <button
            className="btn full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invite.code);
                toast("초대 코드를 복사했어요.");
              } catch {
                toast(
                  "자동 복사를 지원하지 않아요. 코드를 선택해서 복사해 주세요.",
                  true,
                );
              }
            }}
          >
            <Copy size={17} />
            코드 복사
          </button>
        </Modal>
      )}
    </>
  );
}
