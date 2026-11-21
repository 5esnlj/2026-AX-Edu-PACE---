"""가나다계단 API contract mock. In-memory, synthetic data, no Solar/DB calls.
Run: python -m uvicorn mock_server:app --host 127.0.0.1 --port 8081
"""
import asyncio
import hashlib
import json
import secrets
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from typing import Any, Literal

from fastapi import FastAPI, Request, Response, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

from fixtures import AREAS, PASSWORD, initial_state, questions, quiz_question, timestamp

Area = Literal['korean','math','social','science','daily']
Role = Literal['teacher','student']
Kind = Literal['true_false','multiple_choice_4']
Level = Literal['below_beginner','beginner','intermediate','advanced']
STATE = initial_state()
LOCK = asyncio.Lock()
PREFIX = '/api/v1'

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')
class Output(BaseModel):
    model_config = ConfigDict(extra='allow')
class UserOut(Output):
    id: str; loginId: str; role: Role; displayName: str; nativeLanguage: str
class SessionOut(Output):
    user: UserOut; csrfToken: str; nextAction: Literal['classes','diagnostic','join_class']
class ClassOut(Output):
    id: str; name: str; gradeLabel: str; academicYear: int; ownerId: str; status: str
    membershipId: str | None = None; teacherSubject: Area | None = None
class ClassList(Output):
    items: list[ClassOut]; nextCursor: str | None = None
class ErrorOut(BaseModel):
    code: str; message: str; requestId: str; details: Any = None
class Option(Input):
    id: str = Field(min_length=1,max_length=32); text: str = Field(min_length=1,max_length=1000)
class QuestionOut(Output):
    id: str; position: int; questionType: Kind; prompt: str; choices: list[Option]; maxPoints: float
    correctOptionId: str | None = None; explanation: str | None = None
    sourceSentenceIds: list[str] | None = None
class MaterialOut(Output):
    id: str; classId: str; sourceId: str; studentMemberId: str; subject: Area; title: str; unit: str
    status: Literal['draft','reviewed','published','withdrawn']; version: int; revision: int
    content: dict[str,Any]; createdAt: str; publishedAt: str | None; reviewedAt: str | None
    isRecentPublished: bool = False; unitNumber: str | None = None; thumbnailUrl: str | None = None
    originalContent: str | None = None
class MaterialList(Output):
    items: list[MaterialOut]; nextCursor: str | None = None
class QuizOut(Output):
    id: str; classId: str; sourceId: str; studentMemberId: str; subject: Area; title: str
    status: Literal['draft','reviewed','published','withdrawn']; version: int; questionType: Kind
    questions: list[QuestionOut]; questionCount: int; publishedAt: str | None = None
    progress: 'ScoreResults | None' = None; passage: dict[str,Any] | None = None
class QuizList(Output):
    items: list[QuizOut]; nextCursor: str | None = None
class PartResult(BaseModel):
    area: Area; skill: Literal['listening','reading']; score: float; maxScore: int = 100; level: Level
class AreaResult(BaseModel):
    area: Area; score: float; maxScore: int = 200; level: Level
class DiagnosticResults(Output):
    formId: str; isSynthetic: bool; parts: list[PartResult]; areas: list[AreaResult]
class DiagnosticStatus(Output):
    status: Literal['not_started','in_progress','completed']; formId: str | None
    totalQuestions: int; completedQuestions: int; nextQuestionId: str | None
class DiagnosticQuestion(Output):
    id: str; sequence: int; area: Area; skill: Literal['listening','reading']; prompt: str
    options: list[Option]; audioUrl: str | None; stimulusText: str; isSynthetic: bool
class DiagnosticNext(Output):
    progress: DiagnosticStatus; question: DiagnosticQuestion | None
class JobOut(Output):
    id: str; classId: str; sourceId: str; studentMemberId: str
    credentialId: str
    operation: Literal['convert','generate_quiz']; status: Literal['queued','running','succeeded','failed','unknown']
    resultId: str | None; resultType: str | None
class JobList(Output):
    items: list[JobOut]; nextCursor: str | None = None
class ScoreResults(Output):
    quizId: str; questionCount: int; submittedQuestionCount: int
    status: Literal['not_started','in_progress','completed']; firstScore: float | None
    maxScore: float; firstCorrectCount: int | None; latestCorrectCount: int
    currentWrongCount: int; unansweredQuestionCount: int; retryCounts: dict[str,int]
    wrongQuestions: list[dict[str,Any]]
class AnswerOut(Output):
    questionId: str; attemptNo: int; isCorrect: bool; points: float; retryCount: int
    replayed: bool; results: ScoreResults
class CredentialOut(Output):
    id: str; teacherId: str; label: str; maskedSuffix: str; status: str; provider: str; isMock: bool
class CredentialList(Output):
    items: list[CredentialOut]; nextCursor: str | None = None
class SourceOut(Output):
    id: str; classId: str; createdBy: str; fileId: str; title: str; subject: Area; unit: str
    unitNumber: str | None; thumbnailUrl: str | None; sourceText: str; sentences: list[dict[str,str]]
    createdAt: str
class SourceList(Output):
    items: list[SourceOut]; nextCursor: str | None = None

class Login(Input):
    loginId: str = Field(min_length=1,max_length=100); password: SecretStr; role: Role
class ClassCreate(Input):
    name: str = Field(min_length=1,max_length=150)
    gradeLabel: str = Field(default='중1',min_length=1,max_length=80)
    academicYear: int = Field(default=2026,ge=2000,le=2200)
    teacherSubject: Area
class InviteCreate(Input):
    invitedRole: Role; teacherSubject: Area | None = None
    maxUses: int = Field(default=1,ge=1,le=100)
    expiresInHours: int = Field(default=24,ge=1,le=168)
    @model_validator(mode='after')
    def subject(self):
        if self.invitedRole=='teacher' and not self.teacherSubject: raise ValueError('교사 초대에는 소유자가 지정한 teacherSubject가 필요합니다.')
        if self.invitedRole=='student' and self.teacherSubject: raise ValueError('학생 초대에 teacherSubject를 지정할 수 없습니다.')
        return self
class AcceptInvite(Input):
    code: str = Field(min_length=1,max_length=100)
class DiagnosticStart(Input):
    classId: str
class DiagnosticAnswer(Input):
    questionId: str; selectedOptionId: str | None
class SourceCreate(Input):
    fileId: str; title: str = Field(min_length=1,max_length=200); unit: str = Field(default='',max_length=150)
class Generate(Input):
    sourceId: str; studentMemberIds: list[str] = Field(min_length=1,max_length=30)
    operation: Literal['convert','generate_quiz']; inputMaterialId: str | None = None
    questionType: Kind | None = None; questionCount: int | None = Field(default=None,ge=1,le=20)
    @model_validator(mode='after')
    def combination(self):
        if len(set(self.studentMemberIds))!=len(self.studentMemberIds): raise ValueError('studentMemberIds 중복은 허용하지 않습니다.')
        if self.operation=='convert' and any(x is not None for x in [self.inputMaterialId,self.questionType,self.questionCount]): raise ValueError('전환에는 문제 생성 설정을 지정하지 않습니다.')
        if self.operation=='generate_quiz' and (self.questionType is None or self.questionCount is None): raise ValueError('questionType과 questionCount가 필요합니다.')
        if self.inputMaterialId and len(self.studentMemberIds)!=1: raise ValueError('학생별 전환본 입력은 해당 학생 한 명에게만 사용합니다.')
        return self
class Paragraph(Input):
    id: str = Field(min_length=1,max_length=64); text: str = Field(min_length=1,max_length=10000)
class Content(Input):
    paragraphs: list[Paragraph] = Field(min_length=1,max_length=100)
    translations: list[dict[str,str]] = Field(default_factory=list)
    @model_validator(mode='after')
    def ids(self):
        if len({x.id for x in self.paragraphs})!=len(self.paragraphs): raise ValueError('문장 ID가 중복되었습니다.')
        return self
class MaterialPatch(Input):
    content: Content
class QuestionPatch(Input):
    prompt: str = Field(min_length=1,max_length=10000)
    choices: list[Option] = Field(min_length=2,max_length=4)
    correctOptionId: str; explanation: str = Field(min_length=1,max_length=10000)
    sourceSentenceIds: list[str] = Field(min_length=1)
    maxPoints: float = Field(default=1,gt=0,le=100)
class QuizAnswer(Input):
    questionId: str; selectedOptionId: str
class CredentialCreate(Input):
    label: str = Field(default='가상 Solar 연결',min_length=1,max_length=100)
    apiKey: SecretStr

COMMON_ERRORS={s:{'model':ErrorOut,'description':desc} for s,desc in {400:'잘못된 요청',401:'로그인 필요',403:'역할/CSRF/진단 상태 제한',404:'리소스 없음 또는 접근 불가',409:'상태/중복 요청 충돌',412:'오래된 버전',413:'업로드 크기 초과',415:'PDF 형식 필요',422:'입력 검증 실패',428:'If-Match 필요'}.items()}
app=FastAPI(title='가나다계단 API · 실행 가능한 mock',version='1.1.0',description='19개 화면 및 확정 DML 기반 계약 초안. 모든 데이터는 가상이며 DB/Solar/PDF 추출 기능을 수행하지 않습니다.',responses=COMMON_ERRORS)
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173','http://127.0.0.1:5173'],allow_credentials=True,allow_methods=['GET','POST','PATCH','DELETE','OPTIONS'],allow_headers=['Content-Type','X-CSRF-Token','If-Match','Idempotency-Key'],expose_headers=['ETag'])

class APIError(Exception):
    def __init__(self,status,code,message,details=None): self.status,self.code,self.message,self.details=status,code,message,details
def fail(status,code,message,details=None): raise APIError(status,code,message,details)
@app.exception_handler(APIError)
async def error_handler(request,exc):
    return JSONResponse(status_code=exc.status,content=dict(code=exc.code,message=exc.message,requestId='mock-'+secrets.token_hex(6),details=exc.details))
@app.exception_handler(RequestValidationError)
async def validation_handler(request,exc):
    details=[dict(field='.'.join(map(str,x['loc'])),message=x['msg'],type=x['type']) for x in exc.errors()]
    return JSONResponse(status_code=422,content=dict(code='VALIDATION_ERROR',message='입력값을 확인해 주세요.',requestId='mock-'+secrets.token_hex(6),details=details))
@app.middleware('http')
async def serial_mock(request,call_next):
    # Single-process fixture mock atomicity only, not a production transaction mechanism.
    async with LOCK: return await call_next(request)

def reset_state():
    global STATE
    STATE=initial_state()
    # Show all four PART levels using real grading of synthetic answers.
    patterns={'korean':[0,0,0,0,0,0,0], 'math':[1,1,1,1,0,0,0],
              'social':[1,1,1,1,1,1,1], 'science':[1,0,1,0,1,1,1], 'daily':[1,0,0,0,0,0,0]}
    d=STATE['diagnostics']['usr_s_b']
    d['answers']={q['id']:'1' if patterns[q['area']][(q['sequence']-1)%7] else '2' for q in questions()}
    d['results']=grade_diagnostic(d)
def new_id(prefix):
    STATE['counters'][prefix]=STATE['counters'].get(prefix,100)+1
    return f'{prefix}_{STATE["counters"][prefix]}'
def listing(items): return dict(items=items,nextCursor=None)
def auth(request,role=None,learning=False):
    session=STATE['sessions'].get(request.cookies.get('ganada_session'))
    if not session: fail(401,'UNAUTHENTICATED','로그인이 필요합니다.')
    user=STATE['users'][session['userId']]
    if user['status']!='active' or (user['role']=='teacher' and not user['verified']): fail(401,'SESSION_INVALID','활성 계정이 아닙니다.')
    if request.method not in ['GET','HEAD','OPTIONS'] and request.headers.get('X-CSRF-Token')!=session['csrfToken']: fail(403,'CSRF_INVALID','CSRF 토큰을 확인해 주세요.')
    if role and user['role']!=role: fail(403,'ROLE_FORBIDDEN','이 역할로 사용할 수 없습니다.')
    if learning and user['role']=='student' and STATE['diagnostics'].get(user['id'],{}).get('status')!='completed': fail(403,'DIAGNOSTIC_REQUIRED','최초 진단을 완료해 주세요.')
    return user
def membership(user,cid,role=None):
    cls=STATE['classes'].get(cid)
    m=next((m for m in STATE['memberships'].values() if m['userId']==user['id'] and m['classId']==cid and m['status']=='active'),None)
    if not cls or cls['status']!='active' or not m or (role and m['role']!=role): fail(404,'NOT_FOUND','클래스 또는 자료를 찾을 수 없습니다.')
    return m
def source_permission(user,sid):
    s=STATE['sources'].get(sid)
    if not s or s['archived']: fail(404,'NOT_FOUND','자료를 찾을 수 없습니다.')
    m=membership(user,s['classId'],'teacher')
    if m['teacherSubject']!=s['subject']: fail(404,'NOT_FOUND','자료를 찾을 수 없습니다.')
    return s
def resource_permission(user,kind,rid,edit=False):
    r=STATE[kind].get(rid)
    if not r: fail(404,'NOT_FOUND','자료를 찾을 수 없습니다.')
    s=STATE['sources'][r['sourceId']]
    if s['archived']: fail(404,'NOT_FOUND','자료를 찾을 수 없습니다.')
    m=membership(user,r['classId'])
    if user['role']=='teacher':
        source_permission(user,r['sourceId'])
        if edit and user['id'] not in [r['createdBy'],STATE['classes'][r['classId']]['ownerId']]: fail(403,'EDIT_FORBIDDEN','작성자 또는 클래스 소유자만 수정할 수 있습니다.')
    else:
        if m['id']!=r['studentMemberId'] or r['status']!='published': fail(404,'NOT_FOUND','자료를 찾을 수 없습니다.')
        if kind=='quizzes' and r.get('inputMaterialId') and STATE['materials'][r['inputMaterialId']]['status']!='published': fail(404,'NOT_FOUND','출처 전환본이 배포되지 않았습니다.')
    return r
def version_check(request,r):
    value=request.headers.get('If-Match')
    if value is None: fail(428,'VERSION_REQUIRED','If-Match에 현재 ETag를 전달해 주세요.')
    if value!=f'"{r["version"]}"': fail(412,'VERSION_CONFLICT','다른 변경이 있습니다. 다시 조회해 주세요.')
def bump(r): r['version']+=1; r['updatedAt']=timestamp()
def etag(response,r): response.headers['ETag']=f'"{r["version"]}"'
def clean_user(u): return {k:u[k] for k in ['id','loginId','role','displayName','nativeLanguage']}
def next_action(u):
    if u['role']=='teacher': return 'classes'
    if not any(m['userId']==u['id'] and m['status']=='active' for m in STATE['memberships'].values()): return 'join_class'
    return 'classes' if STATE['diagnostics'].get(u['id'],{}).get('status')=='completed' else 'diagnostic'
def active_student_membership(mid,cid):
    """Current roster counts exclude departed members and inactive student accounts."""
    m=STATE['memberships'].get(mid)
    u=STATE['users'].get(m['userId']) if m else None
    return bool(m and m['classId']==cid and m['role']=='student' and m['status']=='active'
                and u and u['role']=='student' and u['status']=='active')
def student_member(mid,cid):
    if not active_student_membership(mid,cid): fail(404,'NOT_FOUND','대상 학생을 찾을 수 없습니다.')
    return STATE['memberships'][mid]
def quiz_results(q):
    attempts=STATE['attempts'].get(q['id'],{})
    first=[a[0] for a in attempts.values() if a]
    latest=[a[-1] for a in attempts.values() if a]
    n=len(q['questions']); completed=len(first)==n
    sub=STATE['submissions'].get(q['id'],{})
    wrong=[dict(questionId=qq['id'],position=qq['position'],retryCount=len(attempts[qq['id']])-1) for qq in q['questions'] if attempts.get(qq['id']) and not attempts[qq['id']][-1]['isCorrect']]
    return dict(quizId=q['id'],questionCount=n,submittedQuestionCount=len(first),status='completed' if completed else ('in_progress' if first else 'not_started'),
        firstScore=sub.get('firstScore'),maxScore=sum(x['maxPoints'] for x in q['questions']),firstCorrectCount=sub.get('firstCorrectCount'),
        latestCorrectCount=sum(a['isCorrect'] for a in latest),currentWrongCount=len(wrong),unansweredQuestionCount=n-len(first),
        retryCounts={qq['id']:max(0,len(attempts.get(qq['id'],[]))-1) for qq in q['questions']},wrongQuestions=wrong)
def quiz_public(q,user):
    out=deepcopy(q); out['questionCount']=len(q['questions'])
    if user['role']=='student':
        out['questions']=[{k:v for k,v in qq.items() if k not in ['correctOptionId','explanation','sourceSentenceIds']} for qq in out['questions']]
        out['progress']=quiz_results(q)
        out['passage']=STATE['materials'][q['inputMaterialId']]['content'] if q.get('inputMaterialId') else dict(paragraphs=STATE['sources'][q['sourceId']]['sentences'])
    return out
def recent(value):
    return bool(value and datetime.fromisoformat(value.replace('Z','+00:00'))>=datetime.now(timezone.utc)-timedelta(days=7))
def material_public(m,user):
    r=deepcopy(m); r['isRecentPublished']=recent(m['publishedAt'])
    r['unit']=STATE['sources'][m['sourceId']]['unit']
    if user['role']=='teacher': r['originalContent']=STATE['sources'][m['sourceId']]['sourceText']
    return r
def diag_status(uid):
    d=STATE['diagnostics'].get(uid)
    pending=next((q['id'] for q in questions() if not d or q['id'] not in d['answers']),None)
    return dict(status=d['status'] if d else 'not_started',formId=d['formId'] if d else None,totalQuestions=len(questions()),completedQuestions=len(d['answers']) if d else 0,nextQuestionId=pending)
def diag_access(user):
    if not any(m['userId']==user['id'] and m['role']=='student' and m['status']=='active' and STATE['classes'][m['classId']]['status']=='active' for m in STATE['memberships'].values()): fail(403,'CLASS_REQUIRED','먼저 클래스 초대를 수락해 주세요.')
def grade_diagnostic(d):
    parts=[]
    for a in AREAS:
        for skill in ['listening','reading']:
            qs=[q for q in questions() if q['area']==a and q['skill']==skill]
            score=sum(q['maxPoints'] for q in qs if d['answers'][q['id']]==q['correctOptionId'])
            passed={tier:sum(q['gateSlot'] is not None and d['answers'][q['id']]==q['correctOptionId'] for q in qs if q['tier']==tier) for tier in ['beginner','intermediate','advanced']}
            level='below_beginner' if passed['beginner']<1 else ('advanced' if score>=70 and passed['intermediate']==2 and passed['advanced']==2 else ('intermediate' if score>=40 and passed['intermediate']==2 else 'beginner'))
            parts.append(dict(area=a,skill=skill,score=score,maxScore=100,level=level))
    aggregates=[]
    for a in AREAS:
        scores=[p['score'] for p in parts if p['area']==a]; total=sum(scores)
        level='beginner' if min(scores)<30 or total<80 else ('intermediate' if total<140 else 'advanced')
        aggregates.append(dict(area=a,score=total,maxScore=200,level=level))
    return dict(formId=d['formId'],isSynthetic=True,parts=parts,areas=aggregates)
def idempotency(request,user,scope,body):
    key=request.headers.get('Idempotency-Key')
    if not key or len(key)>64: fail(400,'IDEMPOTENCY_KEY_REQUIRED','1~64자 Idempotency-Key가 필요합니다.')
    composite=(user['id'],scope,key); digest=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
    existing=STATE['idempotency'].get(composite)
    if existing and existing['digest']!=digest: fail(409,'IDEMPOTENCY_CONFLICT','같은 요청키로 다른 내용을 보낼 수 없습니다.')
    return composite,digest,existing
def save_idem(key,digest,response): STATE['idempotency'][key]=dict(digest=digest,response=deepcopy(response))

@app.get(PREFIX+'/health',tags=['공통'])
def health(): return dict(status='ok',mode='mock',databaseConnected=False,solarConnected=False,isSynthetic=True)
@app.post(PREFIX+'/auth/login',response_model=SessionOut,tags=['인증'])
def login(body:Login,response:Response):
    user=next((u for u in STATE['users'].values() if u['loginId']==body.loginId),None)
    if not user or body.password.get_secret_value()!=PASSWORD or user['role']!=body.role or user['status']!='active' or (user['role']=='teacher' and not user['verified']): fail(401,'INVALID_CREDENTIALS','로그인 정보 또는 역할을 확인해 주세요.')
    token=secrets.token_urlsafe(24); csrf=secrets.token_urlsafe(24)
    STATE['sessions'][token]=dict(userId=user['id'],csrfToken=csrf)
    response.set_cookie('ganada_session',token,httponly=True,samesite='lax',secure=False)
    return dict(user=clean_user(user),csrfToken=csrf,nextAction=next_action(user))
@app.get(PREFIX+'/auth/me',response_model=SessionOut,tags=['인증'])
def me(request:Request):
    user=auth(request); session=STATE['sessions'][request.cookies.get('ganada_session')]
    return dict(user=clean_user(user),csrfToken=session['csrfToken'],nextAction=next_action(user),capabilities=dict(search=False,notifications=False,vocabulary=False,notes=False,tts=False))
@app.post(PREFIX+'/auth/logout',status_code=204,tags=['인증'])
def logout(request:Request):
    auth(request); STATE['sessions'].pop(request.cookies.get('ganada_session'),None)
    r=Response(status_code=204);r.delete_cookie('ganada_session');return r
@app.get(PREFIX+'/classes',response_model=ClassList,tags=['클래스'])
def classes(request:Request):
    user=auth(request)
    return listing([dict(STATE['classes'][m['classId']],membershipId=m['id'],teacherSubject=m['teacherSubject']) for m in STATE['memberships'].values() if m['userId']==user['id'] and m['status']=='active' and STATE['classes'][m['classId']]['status']=='active'])
@app.post(PREFIX+'/classes',response_model=ClassOut,status_code=201,tags=['클래스'])
def create_class(body:ClassCreate,request:Request):
    user=auth(request,'teacher');cid=new_id('cls');mid=new_id('mem')
    cls=dict(id=cid,name=body.name,gradeLabel=body.gradeLabel,academicYear=body.academicYear,ownerId=user['id'],status='active');STATE['classes'][cid]=cls
    STATE['memberships'][mid]=dict(id=mid,classId=cid,userId=user['id'],role='teacher',teacherSubject=body.teacherSubject,status='active')
    return dict(cls,membershipId=mid,teacherSubject=body.teacherSubject)
@app.post(PREFIX+'/classes/{classId}/invitations',status_code=201,tags=['클래스'])
def create_invite(classId:str,body:InviteCreate,request:Request):
    user=auth(request,'teacher');membership(user,classId,'teacher')
    if body.invitedRole=='teacher' and STATE['classes'][classId]['ownerId']!=user['id']: fail(403,'OWNER_REQUIRED','교사 초대는 클래스 소유자만 발급합니다.')
    code='MOCK-'+secrets.token_hex(4).upper();iid=new_id('inv')
    inv=dict(id=iid,classId=classId,createdBy=user['id'],code=code,invitedRole=body.invitedRole,teacherSubject=body.teacherSubject,maxUses=body.maxUses,usedCount=0,expiresAt=(datetime.now(timezone.utc)+timedelta(hours=body.expiresInHours)).isoformat(),revoked=False)
    STATE['invitations'][code]=inv
    return inv
@app.post(PREFIX+'/invitations/accept',tags=['클래스'])
def accept_invite(body:AcceptInvite,request:Request):
    user=auth(request);inv=STATE['invitations'].get(body.code)
    if not inv or inv['revoked'] or datetime.fromisoformat(inv['expiresAt'])<=datetime.now(timezone.utc) or STATE['classes'][inv['classId']]['status']!='active': fail(404,'INVITATION_INVALID','유효한 초대가 아닙니다.')
    if user['role']!=inv['invitedRole']: fail(403,'INVITATION_ROLE_MISMATCH','초대의 역할이 계정 역할과 다릅니다.')
    old=next((m for m in STATE['memberships'].values() if m['classId']==inv['classId'] and m['userId']==user['id']),None)
    if old:
        if old['status']!='active': fail(409,'MEMBERSHIP_REAPPROVAL_REQUIRED','소유자의 재가입 승인이 필요합니다.')
        return dict(membership=old,alreadyMember=True,nextAction=next_action(user))
    if inv['usedCount']>=inv['maxUses']: fail(409,'INVITATION_EXHAUSTED','초대 사용 횟수가 소진되었습니다.')
    mid=new_id('mem');m=dict(id=mid,classId=inv['classId'],userId=user['id'],role=user['role'],teacherSubject=inv['teacherSubject'],status='active')
    STATE['memberships'][mid]=m;inv['usedCount']+=1
    return dict(membership=m,alreadyMember=False,nextAction=next_action(user))

@app.get(PREFIX+'/diagnostic',response_model=DiagnosticStatus,tags=['진단'])
def diagnostic(request:Request): return diag_status(auth(request,'student')['id'])
@app.post(PREFIX+'/diagnostic/start',response_model=DiagnosticStatus,tags=['진단'])
def diagnostic_start(body:DiagnosticStart,request:Request):
    user=auth(request,'student');membership(user,body.classId,'student')
    STATE['diagnostics'].setdefault(user['id'],dict(formId='form_mock_v1',status='in_progress',answers={},results=None,completedAt=None))
    return diag_status(user['id'])
@app.get(PREFIX+'/diagnostic/next-question',response_model=DiagnosticNext,tags=['진단'])
def next_question(request:Request):
    user=auth(request,'student');diag_access(user);status=diag_status(user['id'])
    if status['status']=='not_started': fail(409,'DIAGNOSTIC_NOT_STARTED','진단을 시작해 주세요.')
    q=next((q for q in questions() if q['id']==status['nextQuestionId']),None)
    public={k:q[k] for k in ['id','sequence','area','skill','prompt','options','audioUrl','stimulusText']} if q else None
    if public:public['isSynthetic']=True
    return dict(progress=status,question=public)
@app.post(PREFIX+'/diagnostic/answers',tags=['진단'])
def diagnostic_answer(body:DiagnosticAnswer,request:Request):
    user=auth(request,'student');diag_access(user);d=STATE['diagnostics'].get(user['id'])
    if not d: fail(409,'DIAGNOSTIC_NOT_STARTED','진단을 시작해 주세요.')
    if body.questionId in d['answers']:
        if d['answers'][body.questionId]!=body.selectedOptionId: fail(409,'ANSWER_IMMUTABLE','제출한 진단 답안은 바꿀 수 없습니다.')
        return dict(progress=diag_status(user['id']),replayed=True)
    if d['status']=='completed': fail(409,'DIAGNOSTIC_COMPLETED','이미 완료한 진단입니다.')
    if body.questionId!=diag_status(user['id'])['nextQuestionId']: fail(409,'QUESTION_OUT_OF_ORDER','다음 미제출 문제부터 답해 주세요.')
    q=next(q for q in questions() if q['id']==body.questionId)
    if body.selectedOptionId is not None and body.selectedOptionId not in [o['id'] for o in q['options']]: fail(422,'OPTION_INVALID','문제의 보기를 선택해 주세요.')
    d['answers'][body.questionId]=body.selectedOptionId
    if len(d['answers'])==len(questions()):d.update(status='completed',results=grade_diagnostic(d),completedAt=timestamp())
    return dict(progress=diag_status(user['id']),replayed=False)
@app.get(PREFIX+'/diagnostic/results',response_model=DiagnosticResults,tags=['진단'])
def diagnostic_results(request:Request):
    user=auth(request,'student');d=STATE['diagnostics'].get(user['id'])
    if not d or d['status']!='completed':fail(409,'DIAGNOSTIC_INCOMPLETE','진단이 아직 완료되지 않았습니다.')
    return d['results']

@app.get(PREFIX+'/classes/{classId}/students',tags=['학생 수준'])
def students(classId:str,request:Request):
    user=auth(request,'teacher');membership(user,classId,'teacher');out=[]
    for m in STATE['memberships'].values():
        if active_student_membership(m['id'],classId):
            u=STATE['users'][m['userId']];d=STATE['diagnostics'].get(u['id']);res=d['results'] if d and d['status']=='completed' else None
            out.append(dict(id=m['id'],userId=u['id'],displayName=u['displayName'],nativeLanguage=u['nativeLanguage'],diagnosticStatus=diag_status(u['id'])['status'],partResults=res['parts'] if res else [],areaResults=res['areas'] if res else []))
    return listing(out)
@app.get(PREFIX+'/classes/{classId}/students/{memberId}/diagnostic',tags=['학생 수준'])
def student_diagnostic(classId:str,memberId:str,request:Request):
    user=auth(request,'teacher');membership(user,classId,'teacher');m=student_member(memberId,classId);d=STATE['diagnostics'].get(m['userId'])
    return dict(studentMemberId=memberId,status=diag_status(m['userId'])['status'],results=d['results'] if d else None)

@app.post(PREFIX+'/classes/{classId}/files',status_code=201,tags=['파일'])
async def upload_file(classId:str,request:Request,file:UploadFile=File(...)):
    user=auth(request,'teacher');m=membership(user,classId,'teacher');data=await file.read(10*1024*1024+1)
    if len(data)>10*1024*1024:fail(413,'FILE_TOO_LARGE','PDF는 최대 10 MiB입니다.')
    if file.content_type!='application/pdf' or not data.startswith(b'%PDF-'):fail(415,'PDF_REQUIRED','PDF 파일을 올려 주세요.')
    fid=new_id('file');r=dict(id=fid,classId=classId,createdBy=user['id'],subject=m['teacherSubject'],name=file.filename or 'upload.pdf',size=len(data),mimeType='application/pdf',isSynthetic=True)
    STATE['files'][fid]=r;return dict(r,extractionStatus='mock_ready',notice='실제 PDF 추출 없이 가상 본문을 사용합니다.')
@app.post(PREFIX+'/classes/{classId}/sources',response_model=SourceOut,status_code=201,tags=['원본 자료'])
def create_source(classId:str,body:SourceCreate,request:Request):
    user=auth(request,'teacher');m=membership(user,classId,'teacher');f=STATE['files'].get(body.fileId)
    if not f or f['classId']!=classId or f['createdBy']!=user['id'] or f['subject']!=m['teacherSubject']:fail(404,'NOT_FOUND','업로드 파일을 찾을 수 없습니다.')
    sid=new_id('src');r=dict(id=sid,classId=classId,createdBy=user['id'],fileId=body.fileId,title=body.title,subject=m['teacherSubject'],unit=body.unit,unitNumber=None,thumbnailUrl=None,sourceText='[가상 추출] 자료의 첫 문장입니다.',sentences=[dict(id='s1',text='자료의 첫 문장입니다.')],createdAt=timestamp(),archived=False)
    STATE['sources'][sid]=r;return r
@app.get(PREFIX+'/classes/{classId}/sources',response_model=SourceList,tags=['원본 자료'])
def sources(classId:str,request:Request,subject:Area|None=None):
    user=auth(request,'teacher');m=membership(user,classId,'teacher')
    return listing([s for s in STATE['sources'].values() if s['classId']==classId and s['subject']==m['teacherSubject'] and (not subject or s['subject']==subject) and not s['archived']])
@app.get(PREFIX+'/sources/{sourceId}',response_model=SourceOut,tags=['원본 자료'])
def source(sourceId:str,request:Request):return source_permission(auth(request,'teacher'),sourceId)
@app.get(PREFIX+'/files/{fileId}/download',tags=['파일'],responses={200:{'content':{'application/pdf':{}},'description':'권한 확인 후 가상 PDF'}})
def download_file(fileId:str,request:Request):
    user=auth(request,learning=True);f=STATE['files'].get(fileId)
    if not f:fail(404,'NOT_FOUND','파일을 찾을 수 없습니다.')
    m=membership(user,f['classId']);allowed=False
    if user['role']=='teacher':
        allowed=m['teacherSubject']==f['subject'] and any(s['fileId']==fileId and s['classId']==f['classId'] and s['subject']==m['teacherSubject'] and not s['archived'] for s in STATE['sources'].values())
    else:
        for q in STATE['quizzes'].values():
            if q['studentMemberId']==m['id'] and q['status']=='published' and q['inputMaterialId'] is None and STATE['sources'][q['sourceId']]['fileId']==fileId and not STATE['sources'][q['sourceId']]['archived']:allowed=True
    if not allowed:fail(404,'NOT_FOUND','파일을 찾을 수 없습니다.')
    # Minimal valid synthetic PDF, never the uploaded user's original bytes.
    stream=b'BT /F1 12 Tf 50 700 Td (Synthetic mock PDF - not uploaded content) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    data=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{x:010} 00000 n \n'.encode() for x in offsets)+f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
    return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="mock.pdf"'})

@app.post(PREFIX+'/classes/{classId}/generation-jobs',response_model=JobList,status_code=202,tags=['AI 생성'])
def generate(classId:str,body:Generate,request:Request):
    user=auth(request,'teacher');membership(user,classId,'teacher');s=source_permission(user,body.sourceId)
    if s['classId']!=classId:fail(404,'NOT_FOUND','원본 자료를 찾을 수 없습니다.')
    key,digest,old=idempotency(request,user,'generation:'+classId,body.model_dump())
    if old:return old['response']
    credential=next((c for c in STATE['credentials'].values() if c['teacherId']==user['id'] and c['status']=='active'),None)
    if not credential:fail(409,'AI_CREDENTIAL_REQUIRED','본인의 활성 Solar 연결이 필요합니다.')
    for mid in body.studentMemberIds:
        m=student_member(mid,classId)
        if STATE['diagnostics'].get(m['userId'],{}).get('status')!='completed':fail(409,'STUDENT_DIAGNOSTIC_REQUIRED','대상 학생의 진단이 미완료입니다.',dict(studentMemberId=mid))
    if body.inputMaterialId:
        mat=resource_permission(user,'materials',body.inputMaterialId)
        if mat['status']!='published' or mat['sourceId']!=s['id'] or mat['studentMemberId']!=body.studentMemberIds[0]:fail(409,'INPUT_MATERIAL_INVALID','배포된 같은 학생·원본의 전환본을 선택하세요.')
    jobs=[]
    for mid in body.studentMemberIds:
        jid=new_id('job');j=dict(id=jid,classId=classId,sourceId=s['id'],studentMemberId=mid,credentialId=credential['id'],operation=body.operation,status='queued',resultId=None,resultType=None,createdBy=user['id'],inputMaterialId=body.inputMaterialId,questionType=body.questionType,questionCount=body.questionCount,isMock=True)
        STATE['jobs'][jid]=j;jobs.append(deepcopy(j))
    response=listing(jobs);save_idem(key,digest,response);return response
@app.get(PREFIX+'/generation-jobs/{jobId}',response_model=JobOut,tags=['AI 생성'])
def job(jobId:str,request:Request):
    user=auth(request,'teacher');j=STATE['jobs'].get(jobId)
    if not j:fail(404,'NOT_FOUND','작업을 찾을 수 없습니다.')
    s=source_permission(user,j['sourceId'])
    if j['createdBy']!=user['id']:fail(404,'NOT_FOUND','작업을 찾을 수 없습니다.')
    if j['status']=='queued':
        student_member(j['studentMemberId'],j['classId'])
        credential=STATE['credentials'].get(j['credentialId'])
        if not credential or credential['teacherId']!=user['id'] or credential['status']!='active':j.update(status='failed',errorCode='AI_CREDENTIAL_REQUIRED');return j
        now=timestamp()
        if j['operation']=='convert':
            rid=new_id('mat');rev=1+max([m['revision'] for m in STATE['materials'].values() if m['sourceId']==s['id'] and m['studentMemberId']==j['studentMemberId']] or [0])
            STATE['materials'][rid]=dict(id=rid,classId=j['classId'],sourceId=s['id'],studentMemberId=j['studentMemberId'],subject=s['subject'],title=s['title'],status='draft',version=1,revision=rev,createdBy=user['id'],content=dict(paragraphs=[dict(id='s1',text='[가상 전환] 쉽게 읽는 학생별 자료입니다.')],translations=[]),createdAt=now,publishedAt=None,reviewedAt=None,unitNumber=None,thumbnailUrl=None)
            j.update(resultId=rid,resultType='material',status='succeeded')
        else:
            if j['inputMaterialId'] and STATE['materials'][j['inputMaterialId']]['status']!='published':j.update(status='failed',errorCode='INPUT_MATERIAL_UNPUBLISHED');return j
            rid=new_id('quiz');gen=1+max([q['generationNo'] for q in STATE['quizzes'].values() if q['sourceId']==s['id'] and q['studentMemberId']==j['studentMemberId']] or [0])
            STATE['quizzes'][rid]=dict(id=rid,classId=j['classId'],sourceId=s['id'],studentMemberId=j['studentMemberId'],inputMaterialId=j['inputMaterialId'],subject=s['subject'],title=s['title']+' 확인문제',questionType=j['questionType'],status='draft',version=1,generationNo=gen,createdBy=user['id'],createdAt=now,publishedAt=None,reviewedAt=None,questions=[quiz_question(rid,i,j['questionType']) for i in range(1,j['questionCount']+1)])
            j.update(resultId=rid,resultType='quiz',status='succeeded')
    return j

@app.get(PREFIX+'/classes/{classId}/materials',response_model=MaterialList,tags=['전환 자료'])
def materials(classId:str,request:Request,subject:Area|None=None):
    user=auth(request,learning=True);m=membership(user,classId);items=[]
    for item in STATE['materials'].values():
        if item['classId']!=classId or (subject and item['subject']!=subject):continue
        try:resource_permission(user,'materials',item['id']);items.append(material_public(item,user))
        except APIError:pass
    return listing(items)
@app.get(PREFIX+'/materials/{materialId}',response_model=MaterialOut,tags=['전환 자료'])
def material(materialId:str,request:Request,response:Response):
    user=auth(request,learning=True);r=resource_permission(user,'materials',materialId);etag(response,r);return material_public(r,user)
@app.patch(PREFIX+'/materials/{materialId}',response_model=MaterialOut,tags=['전환 자료'])
def patch_material(materialId:str,body:MaterialPatch,request:Request,response:Response):
    user=auth(request,'teacher');r=resource_permission(user,'materials',materialId,True);version_check(request,r)
    if r['status'] not in ['draft','reviewed'] or r['publishedAt']:fail(409,'PUBLISHED_IMMUTABLE','배포된 자료는 새 버전으로 만드세요.')
    r.update(content=body.content.model_dump(),status='draft',reviewedAt=None,reviewedBy=None);bump(r);etag(response,r);return material_public(r,user)
def transition(kind,rid,request,response,target):
    user=auth(request,'teacher');r=resource_permission(user,kind,rid,True);version_check(request,r)
    expected='draft' if target=='reviewed' else 'reviewed'
    if r['status']!=expected:fail(409,'STATE_CONFLICT',f'{expected} 상태에서만 처리할 수 있습니다.')
    student_member(r['studentMemberId'],r['classId'])
    if kind=='quizzes' and r.get('inputMaterialId') and STATE['materials'][r['inputMaterialId']]['status']!='published':fail(409,'INPUT_MATERIAL_UNPUBLISHED','입력 전환본을 먼저 배포하세요.')
    r['status']=target;r['reviewedAt' if target=='reviewed' else 'publishedAt']=timestamp();r['reviewedBy' if target=='reviewed' else 'publishedBy']=user['id'];bump(r);etag(response,r)
    return material_public(r,user) if kind=='materials' else quiz_public(r,user)
@app.post(PREFIX+'/materials/{materialId}/review',response_model=MaterialOut,tags=['전환 자료'])
def review_material(materialId:str,request:Request,response:Response):return transition('materials',materialId,request,response,'reviewed')
@app.post(PREFIX+'/materials/{materialId}/publish',response_model=MaterialOut,tags=['전환 자료'])
def publish_material(materialId:str,request:Request,response:Response):return transition('materials',materialId,request,response,'published')

@app.get(PREFIX+'/classes/{classId}/quizzes',response_model=QuizList,response_model_exclude_unset=True,tags=['학습 문제'])
def quizzes(classId:str,request:Request,subject:Area|None=None):
    user=auth(request,learning=True);membership(user,classId);items=[]
    for q in STATE['quizzes'].values():
        if q['classId']!=classId or (subject and q['subject']!=subject):continue
        try:resource_permission(user,'quizzes',q['id']);items.append(quiz_public(q,user))
        except APIError:pass
    return listing(items)
@app.get(PREFIX+'/quizzes/{quizId}',response_model=QuizOut,response_model_exclude_unset=True,tags=['학습 문제'])
def quiz(quizId:str,request:Request,response:Response):
    user=auth(request,learning=True);q=resource_permission(user,'quizzes',quizId);etag(response,q);return quiz_public(q,user)
@app.patch(PREFIX+'/quizzes/{quizId}/questions/{questionId}',response_model=QuizOut,response_model_exclude_unset=True,tags=['학습 문제'])
def patch_question(quizId:str,questionId:str,body:QuestionPatch,request:Request,response:Response):
    user=auth(request,'teacher');q=resource_permission(user,'quizzes',quizId,True);version_check(request,q)
    if q['status'] not in ['draft','reviewed'] or q['publishedAt']:fail(409,'PUBLISHED_IMMUTABLE','배포 문제는 새 묶음으로 만드세요.')
    qq=next((qq for qq in q['questions'] if qq['id']==questionId),None)
    if not qq:fail(404,'NOT_FOUND','문항을 찾을 수 없습니다.')
    ids=[o.id for o in body.choices];n=2 if q['questionType']=='true_false' else 4
    source_ids=[p['id'] for p in STATE['materials'][q['inputMaterialId']]['content']['paragraphs']] if q['inputMaterialId'] else [p['id'] for p in STATE['sources'][q['sourceId']]['sentences']]
    if len(ids)!=n or len(set(ids))!=n or body.correctOptionId not in ids or any(sid not in source_ids for sid in body.sourceSentenceIds):fail(422,'QUESTION_INVALID','보기 수, 정답, 출처 문장 ID를 확인하세요.')
    qq.update(body.model_dump());q.update(status='draft',reviewedAt=None,reviewedBy=None);bump(q);etag(response,q);return quiz_public(q,user)
@app.post(PREFIX+'/quizzes/{quizId}/review',response_model=QuizOut,response_model_exclude_unset=True,tags=['학습 문제'])
def review_quiz(quizId:str,request:Request,response:Response):return transition('quizzes',quizId,request,response,'reviewed')
@app.post(PREFIX+'/quizzes/{quizId}/publish',response_model=QuizOut,response_model_exclude_unset=True,tags=['학습 문제'])
def publish_quiz(quizId:str,request:Request,response:Response):return transition('quizzes',quizId,request,response,'published')
@app.post(PREFIX+'/quizzes/{quizId}/answers',response_model=AnswerOut,tags=['학습 풀이'])
def answer_quiz(quizId:str,body:QuizAnswer,request:Request):
    user=auth(request,'student',True);q=resource_permission(user,'quizzes',quizId);key,digest,old=idempotency(request,user,'answer:'+quizId,body.model_dump())
    if old:return dict(old['response'],replayed=True)
    qq=next((qq for qq in q['questions'] if qq['id']==body.questionId),None)
    if not qq:fail(404,'NOT_FOUND','문항을 찾을 수 없습니다.')
    if body.selectedOptionId not in [o['id'] for o in qq['choices']]:fail(422,'OPTION_INVALID','보기 중 하나를 선택하세요.')
    attempts=STATE['attempts'].setdefault(quizId,{}).setdefault(qq['id'],[])
    if attempts and attempts[-1]['isCorrect']:fail(409,'ALREADY_CORRECT','이미 맞힌 문제는 오답 재풀이 대상이 아닙니다.')
    correct=body.selectedOptionId==qq['correctOptionId'];a=dict(questionId=qq['id'],attemptNo=len(attempts)+1,selectedOptionId=body.selectedOptionId,isCorrect=correct,points=qq['maxPoints'] if correct else 0,answeredAt=timestamp())
    attempts.append(a)
    all_attempts=STATE['attempts'][quizId]
    if len(all_attempts)==len(q['questions']) and quizId not in STATE['submissions']:
        STATE['submissions'][quizId]=dict(firstScore=sum(a[0]['points'] for a in all_attempts.values()),firstCorrectCount=sum(a[0]['isCorrect'] for a in all_attempts.values()),firstSubmittedAt=timestamp())
    response=dict(questionId=qq['id'],attemptNo=a['attemptNo'],isCorrect=correct,points=a['points'],retryCount=len(attempts)-1,replayed=False,results=quiz_results(q));save_idem(key,digest,response);return response
@app.get(PREFIX+'/quizzes/{quizId}/results',response_model=ScoreResults,tags=['학습 풀이'])
def results(quizId:str,request:Request):
    user=auth(request,learning=True);return quiz_results(resource_permission(user,'quizzes',quizId))
@app.get(PREFIX+'/quizzes/{quizId}/questions/{questionId}/explanation',tags=['학습 풀이'])
def explanation(quizId:str,questionId:str,request:Request):
    user=auth(request,learning=True);q=resource_permission(user,'quizzes',quizId);qq=next((qq for qq in q['questions'] if qq['id']==questionId),None)
    if not qq:fail(404,'NOT_FOUND','문항을 찾을 수 없습니다.')
    if user['role']=='student' and not STATE['attempts'].get(quizId,{}).get(questionId):fail(403,'ANSWER_REQUIRED','먼저 이 문제에 답해 주세요.')
    return dict(questionId=questionId,correctOptionId=qq['correctOptionId'],explanation=qq['explanation'])

@app.get(PREFIX+'/classes/{classId}/activity',tags=['대시보드'])
def activity(classId:str,request:Request):
    user=auth(request,'teacher');m=membership(user,classId,'teacher');items=[]
    for q in STATE['quizzes'].values():
        if q['classId']==classId and q['subject']==m['teacherSubject'] and q['status']=='published' and not STATE['sources'][q['sourceId']]['archived'] and active_student_membership(q['studentMemberId'],classId):
            answered=[a['answeredAt'] for attempts in STATE['attempts'].get(q['id'],{}).values() for a in attempts]
            items.append(dict(quizId=q['id'],title=q['title'],studentMemberId=q['studentMemberId'],publishedAt=q['publishedAt'],lastAnsweredAt=max(answered) if answered else None,results=quiz_results(q)))
    return listing(sorted(items,key=lambda x:x['publishedAt'],reverse=True))
@app.get(PREFIX+'/classes/{classId}/dashboard',tags=['대시보드'])
def dashboard(classId:str,request:Request,area:Area|None=None):
    user=auth(request,learning=True);m=membership(user,classId);selected=area or (m['teacherSubject'] if user['role']=='teacher' else 'daily')
    if user['role']=='teacher':
        rows=[];counts={x:0 for x in ['below_beginner','beginner','intermediate','advanced','not_diagnosed']}
        for sm in STATE['memberships'].values():
            if not active_student_membership(sm['id'],classId):continue
            su=STATE['users'][sm['userId']];d=STATE['diagnostics'].get(su['id']);res=d['results'] if d and d['status']=='completed' else None
            ar=next((a for a in res['areas'] if a['area']==selected),None) if res else None
            ps=[p for p in res['parts'] if p['area']==selected] if res else []
            counts[ar['level'] if ar else 'not_diagnosed']+=1
            assigned=[q for q in STATE['quizzes'].values() if q['classId']==classId and q['subject']==m['teacherSubject'] and q['studentMemberId']==sm['id'] and q['status']=='published' and not STATE['sources'][q['sourceId']]['archived']]
            latest=max(assigned,key=lambda q:q['publishedAt']) if assigned else None
            rows.append(dict(studentMemberId=sm['id'],displayName=su['displayName'],nativeLanguage=su['nativeLanguage'],diagnosticStatus=diag_status(su['id'])['status'],selectedArea=selected,parts=ps,aggregate=ar,latestQuiz=quiz_results(latest) if latest else None))
        pending=sum(q['classId']==classId and q['subject']==m['teacherSubject'] and q['status']=='draft' and not STATE['sources'][q['sourceId']]['archived'] and active_student_membership(q['studentMemberId'],classId) for q in STATE['quizzes'].values())
        return dict(classId=classId,className=STATE['classes'][classId]['name'],selectedArea=selected,teacherSubject=m['teacherSubject'],studentCount=len(rows),levelCounts=counts,pendingReviewQuizSetCount=pending,students=rows)
    qs=[];mats=[]
    for q in STATE['quizzes'].values():
        if q['classId']==classId:
            try:resource_permission(user,'quizzes',q['id']);qs.append(q)
            except APIError:pass
    for mat in STATE['materials'].values():
        if mat['classId']==classId:
            try:resource_permission(user,'materials',mat['id']);mats.append(material_public(mat,user))
            except APIError:pass
    progress=[quiz_results(q) for q in qs];res=STATE['diagnostics'][user['id']]['results']
    return dict(classId=classId,className=STATE['classes'][classId]['name'],displayName=user['displayName'],selectedArea=selected,parts=[p for p in res['parts'] if p['area']==selected],aggregate=next(a for a in res['areas'] if a['area']==selected),
        unansweredQuestionCount=sum(p['unansweredQuestionCount'] for p in progress),retryQuestionCount=sum(p['currentWrongCount'] for p in progress),assignedQuizSetCount=len(qs),newMaterials=sorted(mats,key=lambda x:x['publishedAt'],reverse=True)[:3],quizzes=[dict(id=q['id'],title=q['title'],subject=q['subject'],progress=quiz_results(q)) for q in qs])

@app.get(PREFIX+'/ai-credentials',response_model=CredentialList,tags=['Solar 연결'])
def credentials(request:Request):
    user=auth(request,'teacher');return listing([c for c in STATE['credentials'].values() if c['teacherId']==user['id']])
@app.post(PREFIX+'/ai-credentials',response_model=CredentialOut,status_code=201,tags=['Solar 연결'])
def credential_create(body:CredentialCreate,request:Request):
    user=auth(request,'teacher');secret=body.apiKey.get_secret_value()
    if not secret.startswith('mock-'):fail(422,'MOCK_KEY_ONLY','이 mock 서버에는 mock-로 시작하는 가상 키만 입력하세요.')
    cid=new_id('cred');c=dict(id=cid,teacherId=user['id'],label=body.label,maskedSuffix=secret[-4:],status='pending',provider='solar',isMock=True);STATE['credentials'][cid]=c;return c
def own_credential(user,cid):
    c=STATE['credentials'].get(cid)
    if not c or c['teacherId']!=user['id']:fail(404,'NOT_FOUND','연결 정보를 찾을 수 없습니다.')
    return c
@app.post(PREFIX+'/ai-credentials/{credentialId}/check',response_model=CredentialOut,tags=['Solar 연결'])
def credential_check(credentialId:str,request:Request):
    c=own_credential(auth(request,'teacher'),credentialId)
    if c['status']=='revoked':fail(409,'CREDENTIAL_REVOKED','해제된 연결입니다.')
    c.update(status='active',lastCheckedAt=timestamp());return c
@app.delete(PREFIX+'/ai-credentials/{credentialId}',status_code=204,tags=['Solar 연결'])
def credential_delete(credentialId:str,request:Request):
    c=own_credential(auth(request,'teacher'),credentialId);c['status']='revoked';return Response(status_code=204)

reset_state()
from contract_metadata import install_contract
install_contract(app)
