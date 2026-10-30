import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { api, useResource } from "../api";
import {
  Avatar,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import { useSession } from "../session";
import { languages, type Message, type Student } from "../types";

export function Messages() {
  const { user } = useSession();
  const isTeacher = user!.role === "teacher";
  const roster = useResource<Student[]>(isTeacher ? "/students" : null);
  const [selected, setSelected] = useState("std-1");
  const sid = isTeacher ? selected : user!.student!.id;
  const { data, error, reload } = useResource<Message[]>(
    `/messages?student_id=${sid}`,
  );
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function send() {
    setBusy(true);
    try {
      await api("/messages", {
        method: "POST",
        body: JSON.stringify({ student_id: sid, content }),
      });
      setContent("");
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error || roster.error)
    return (
      <ErrorState
        message={error || roster.error}
        retry={() => {
          reload();
          roster.reload();
        }}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="마음을 잇는 대화"
        title={isTeacher ? "학생과 이야기" : "선생님과 이야기"}
        description="궁금한 점도, 작은 응원도 편안하게 나눠요."
      />
      <Notice>
        같은 데모 교실에 저장되는 메시지입니다. 외부 메신저·이메일로 발송되지
        않으며, 새 메시지는 ‘새로고침’으로 확인합니다.
      </Notice>
      <div className="message-layout">
        {isTeacher && (
          <aside className="panel message-roster">
            <h3>우리 반</h3>
            {roster.data?.map((s, i) => (
              <button
                key={s.id}
                className={sid === s.id ? "active" : ""}
                onClick={() => {
                  setSelected(s.id);
                  setContent("");
                }}
              >
                <Avatar name={s.name} index={i} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{languages[s.language]}</small>
                </span>
              </button>
            ))}
          </aside>
        )}
        <section className="panel conversation">
          <div className="conversation-heading">
            <div>
              <MessageCircle size={19} />
              <strong>
                {isTeacher
                  ? `${roster.data?.find((s) => s.id === sid)?.name || ""} 학생`
                  : "김하늘 선생님"}
              </strong>
            </div>
            <button className="text-link" onClick={reload}>
              새로고침
            </button>
          </div>
          <div className="message-bubbles">
            {!data ? (
              <Loading />
            ) : !data.length ? (
              <Empty
                title="첫 이야기를 건네 보세요"
                description="이 대화는 해당 학생과 선생님이 함께 확인할 수 있어요."
              />
            ) : (
              data.map((m) => (
                <div
                  className={`message ${m.sender === user!.role ? "mine" : ""}`}
                  key={m.id}
                >
                  <small>
                    {m.sender === "teacher"
                      ? "김하늘 선생님"
                      : roster.data?.find((s) => s.id === sid)?.name ||
                        user!.name}
                  </small>
                  <p>{m.content}</p>
                  <time>
                    {new Date(m.created_at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))
            )}
          </div>
          <form
            className="message-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="message-content">
              메시지 내용
            </label>
            <textarea
              id="message-content"
              placeholder="나누고 싶은 이야기를 적어 주세요"
              maxLength={2000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              className="btn"
              disabled={busy || !content.trim()}
              type="submit"
            >
              <Send size={17} />
              <span>보내기</span>
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
