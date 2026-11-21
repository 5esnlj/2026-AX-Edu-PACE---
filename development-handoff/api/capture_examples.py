"""Record synthetic HTTP response examples; does not call external services."""
from fastapi.testclient import TestClient
from copy import deepcopy
import json
import mock_server
from build_delivery import build_spec

def capture():
    mock_server.reset_state();examples=[];clients=[]
    def clean(v):
        if isinstance(v,dict):return {k:('CSRF_TOKEN_FROM_LOGIN_RESPONSE' if k=='csrfToken' else 'mock-request-example' if k=='requestId' else clean(x)) for k,x in v.items()}
        if isinstance(v,list):return [clean(x) for x in v]
        return v
    def req(client,name,method,path,expected=200,body=None,headers=None,files=None):
        r=client.request(method,'/api/v1'+path,json=body,headers=headers,files=files)
        assert r.status_code==expected,(name,r.status_code,r.text)
        example={'name':name,'method':method,'path':'/api/v1'+path,'status':r.status_code,'request':body,
                 'response':clean(r.json()) if r.content and 'json' in r.headers.get('content-type','') else None}
        if headers:example['headers']=headers
        if r.headers.get('etag'):example['responseHeaders']={'ETag':r.headers['etag']}
        if files:example['request']={'file':'multipart/form-data의 PDF 파일'}
        examples.append(example);return r
    def login(login_id):
        c=TestClient(mock_server.app);clients.append(c)
        r=req(c,'로그인 '+login_id,'POST','/auth/login',body={'loginId':login_id,'password':'mock-pass-123','role':'teacher' if login_id.startswith('t_') else 'student'})
        c.headers['X-CSRF-Token']=r.json()['csrfToken'];return c
    t=login('t_math')
    req(t,'기능 지원 여부','GET','/auth/me')
    req(t,'교사 클래스 목록','GET','/classes')
    req(t,'교사 대시보드 수학','GET','/classes/cls_1/dashboard?area=math')
    req(t,'교사 학생 수준표 5영역','GET','/classes/cls_1/students')
    req(t,'학생 B 진단 상세','GET','/classes/cls_1/students/mem_s_b/diagnostic')
    req(t,'자기 교과 원본 목록','GET','/classes/cls_1/sources')
    req(t,'다른 교과 자료 접근 거절','GET','/sources/src_science_1',expected=404)
    req(t,'교사 전환본 목록','GET','/classes/cls_1/materials')
    req(t,'교사 문제 검토 정답 포함','GET','/quizzes/quiz_a_math_1')
    inv=req(t,'학생 초대 발급','POST','/classes/cls_1/invitations',expected=201,body={'invitedRole':'student','maxUses':2,'expiresInHours':24}).json()
    new=login('s_new')
    req(new,'클래스 초대 수락','POST','/invitations/accept',body={'code':inv['code']})
    req(new,'최초 진단 시작','POST','/diagnostic/start',body={'classId':'cls_1'})
    pending=login('s_pending')
    nq=req(pending,'진단 다음 미제출 문항','GET','/diagnostic/next-question').json()
    req(pending,'모르겠어요 제출도 저장','POST','/diagnostic/answers',body={'questionId':nq['question']['id'],'selectedOptionId':None})
    req(pending,'진단 다음 문항으로 이어하기','GET','/diagnostic/next-question')
    a=login('s_a')
    req(a,'학생 대시보드 생활한국어','GET','/classes/cls_1/dashboard?area=daily')
    req(a,'학생 진단 결과 10파트와5종합','GET','/diagnostic/results')
    req(a,'학생에게 배포된 자료 목록','GET','/classes/cls_1/materials')
    req(a,'학생 전환본 상세','GET','/materials/mat_a_math_1')
    req(a,'다른 학생 초안 접근 거절','GET','/materials/mat_b_math_1',expected=404)
    q=req(a,'학생 문제 상세 정답 제외','GET','/quizzes/quiz_a_math_1').json()
    qid=q['id'];ids=[x['id'] for x in q['questions']]
    req(a,'제출 전 해설 거절','GET',f'/quizzes/{qid}/questions/{ids[0]}/explanation',expected=403)
    body={'questionId':ids[0],'selectedOptionId':'2'};h={'Idempotency-Key':'example-answer-1'}
    req(a,'첫 문제 오답 저장','POST',f'/quizzes/{qid}/answers',body=body,headers=h)
    req(a,'학생 대시보드 풀이 중','GET','/classes/cls_1/dashboard?area=daily')
    req(t,'교사 대시보드 학생 첫 풀이 중','GET','/classes/cls_1/dashboard')
    req(a,'같은 답안 재전송 중복 방지','POST',f'/quizzes/{qid}/answers',body=body,headers=h)
    for n,question_id in enumerate(ids[1:],2):req(a,'나머지 최초 답안 '+str(n),'POST',f'/quizzes/{qid}/answers',body={'questionId':question_id,'selectedOptionId':'1'},headers={'Idempotency-Key':f'example-answer-{n}'})
    req(a,'학생 대시보드 최초 풀이 완료 오답 남음','GET','/classes/cls_1/dashboard?area=math')
    req(a,'최초 성적 결과','GET',f'/quizzes/{qid}/results')
    req(a,'제출 후 해설','GET',f'/quizzes/{qid}/questions/{ids[0]}/explanation')
    req(a,'오답 재풀이 성공 최초점수 유지','POST',f'/quizzes/{qid}/answers',body={'questionId':ids[0],'selectedOptionId':'1'},headers={'Idempotency-Key':'example-retry-1'})
    req(t,'교사 대시보드 재풀이 후 최초 성적 보존','GET','/classes/cls_1/dashboard')
    req(a,'학생 대시보드 재풀이 후 현재 오답 해소','GET','/classes/cls_1/dashboard?area=math')
    req(t,'교사 최근 풀이 내역','GET','/classes/cls_1/activity')
    jobs=req(t,'여러 학생 전환 작업 접수','POST','/classes/cls_1/generation-jobs',expected=202,
        body={'sourceId':'src_math_1','studentMemberIds':['mem_s_a','mem_s_b'],'operation':'convert'},headers={'Idempotency-Key':'example-convert-1'}).json()['items']
    j=req(t,'학생 A 전환 작업 완료 mock','GET','/generation-jobs/'+jobs[0]['id']).json()
    req(t,'학생 B 독립 전환 작업 완료 mock','GET','/generation-jobs/'+jobs[1]['id'])
    mid=j['resultId'];mat=req(t,'생성 전환본 검토 전 초안','GET','/materials/'+mid).json()
    reviewed=req(t,'교사 전환본 검토 완료','POST','/materials/'+mid+'/review',headers={'If-Match':f'"{mat["version"]}"'}).json()
    req(t,'교사 전환본 배포','POST','/materials/'+mid+'/publish',headers={'If-Match':f'"{reviewed["version"]}"'})
    req(a,'학생이 새 배포 전환본 확인','GET','/materials/'+mid)
    jobs=req(t,'원본에서 학생별 T/F 생성','POST','/classes/cls_1/generation-jobs',expected=202,
        body={'sourceId':'src_math_1','studentMemberIds':['mem_s_a'],'operation':'generate_quiz','questionType':'true_false','questionCount':2},headers={'Idempotency-Key':'example-tf-1'}).json()['items']
    j=req(t,'T/F 작업 완료 mock','GET','/generation-jobs/'+jobs[0]['id']).json()
    tf=req(t,'생성된 T/F 검토 상세','GET','/quizzes/'+j['resultId']).json()
    reviewed=req(t,'T/F 검토 완료','POST','/quizzes/'+tf['id']+'/review',headers={'If-Match':f'"{tf["version"]}"'}).json()
    req(t,'T/F 학생 배포','POST','/quizzes/'+tf['id']+'/publish',headers={'If-Match':f'"{reviewed["version"]}"'})
    req(a,'학생 T/F 두 보기와 지문','GET','/quizzes/'+tf['id'])
    req(t,'마스킹된 교사 Solar 연결','GET','/ai-credentials')
    # Invitation codes in documentation are mock-only; still normalize to reproducible sample.
    for ex in examples:
        text=json.dumps(ex,ensure_ascii=False).replace(inv['code'],'MOCK-EXAMPLE-CODE')
        ex.clear();ex.update(json.loads(text))
    for c in clients:c.close()
    count=build_spec(mock_server.app,examples)
    print(json.dumps({'endpoints':count,'examples':len(examples)},ensure_ascii=False))

if __name__=='__main__':capture()
