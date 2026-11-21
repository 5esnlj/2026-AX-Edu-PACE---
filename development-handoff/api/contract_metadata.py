"""OpenAPI descriptions for headers and dynamic role-specific response DTOs."""
from copy import deepcopy

def ref(name):return {'$ref':'#/components/schemas/'+name}
def arr(schema):return {'type':'array','items':schema}
def nullable(schema):return {'anyOf':[schema,{'type':'null'}]}
S={'type':'string'}; I={'type':'integer'}; B={'type':'boolean'}
def obj(props,required=None):return {'type':'object','properties':props,'required':list(props) if required is None else required}
def lst(schema):return obj({'items':arr(schema),'nextCursor':nullable(S)})

def install_contract(app):
    base=app.openapi
    def schema():
        document=base()
        if document.get('x-ganada-contract-headers'):return document
        document=deepcopy(document)
        document['x-ganada-contract-headers']=True
        document['servers']=[{'url':'http://127.0.0.1:8081','description':'로컬 mock; 실제 서버 주소는 배포 시 교체'}]
        components=document.setdefault('components',{})
        components['securitySchemes']={'CookieSession':{'type':'apiKey','in':'cookie','name':'ganada_session','description':'POST /api/v1/auth/login이 설정하는 HttpOnly 쿠키. /docs 로그인 실행 후 같은 브라우저에서 사용.'}}
        models=components.setdefault('schemas',{})
        models['HealthOut']=obj({'status':S,'mode':S,'databaseConnected':B,'solarConnected':B,'isSynthetic':B})
        models['MembershipOut']=obj({'id':S,'classId':S,'userId':S,'role':ref('RoleCode'),'teacherSubject':nullable(ref('AreaCode')),'status':S})
        models['RoleCode']={'type':'string','enum':['teacher','student']}
        models['AreaCode']={'type':'string','enum':['korean','math','social','science','daily']}
        models['DiagnosticStateCode']={'type':'string','enum':['not_started','in_progress','completed']}
        models['InviteOut']=obj({'id':S,'classId':S,'createdBy':S,'code':S,'invitedRole':ref('RoleCode'),'teacherSubject':nullable(ref('AreaCode')),'maxUses':I,'usedCount':I,'expiresAt':S,'revoked':B})
        models['InviteAcceptedOut']=obj({'membership':ref('MembershipOut'),'alreadyMember':B,'nextAction':S})
        models['DiagnosticAnswerOut']=obj({'progress':ref('DiagnosticStatus'),'replayed':B})
        models['StudentRow']=obj({'id':S,'userId':S,'displayName':S,'nativeLanguage':S,'diagnosticStatus':ref('DiagnosticStateCode'),'partResults':arr(ref('PartResult')),'areaResults':arr(ref('AreaResult'))})
        models['StudentList']=lst(ref('StudentRow'))
        models['StudentDiagnosticOut']=obj({'studentMemberId':S,'status':ref('DiagnosticStateCode'),'results':nullable(ref('DiagnosticResults'))})
        models['UploadOut']=obj({'id':S,'classId':S,'createdBy':S,'subject':ref('AreaCode'),'name':S,'size':I,'mimeType':S,'isSynthetic':B,'extractionStatus':S,'notice':S})
        models['ExplanationOut']=obj({'questionId':S,'correctOptionId':S,'explanation':S})
        models['ActivityRow']=obj({'quizId':S,'title':S,'studentMemberId':S,'publishedAt':S,'lastAnsweredAt':nullable(S),'results':ref('ScoreResults')})
        models['ActivityList']=lst(ref('ActivityRow'))
        models['DashboardStudentRow']=obj({'studentMemberId':S,'displayName':S,'nativeLanguage':S,'diagnosticStatus':ref('DiagnosticStateCode'),'selectedArea':ref('AreaCode'),'parts':arr(ref('PartResult')),'aggregate':nullable(ref('AreaResult')),'latestQuiz':nullable(ref('ScoreResults'))})
        models['TeacherDashboard']=obj({'classId':S,'className':S,'selectedArea':ref('AreaCode'),'teacherSubject':ref('AreaCode'),'studentCount':I,'levelCounts':obj({x:I for x in ['below_beginner','beginner','intermediate','advanced','not_diagnosed']}),'pendingReviewQuizSetCount':I,'students':arr(ref('DashboardStudentRow'))})
        models['StudentDashboardQuiz']=obj({'id':S,'title':S,'subject':ref('AreaCode'),'progress':ref('ScoreResults')})
        models['StudentDashboard']=obj({'classId':S,'className':S,'displayName':S,'selectedArea':ref('AreaCode'),'parts':arr(ref('PartResult')),'aggregate':ref('AreaResult'),'unansweredQuestionCount':I,'retryQuestionCount':I,'assignedQuizSetCount':I,'newMaterials':arr(ref('MaterialOut')),'quizzes':arr(ref('StudentDashboardQuiz'))})
        extra={
          ('get','/health'):'HealthOut',('post','/classes/{classId}/invitations'):'InviteOut',
          ('post','/invitations/accept'):'InviteAcceptedOut',('post','/diagnostic/answers'):'DiagnosticAnswerOut',
          ('get','/classes/{classId}/students'):'StudentList',('get','/classes/{classId}/students/{memberId}/diagnostic'):'StudentDiagnosticOut',
          ('post','/classes/{classId}/files'):'UploadOut',('get','/quizzes/{quizId}/questions/{questionId}/explanation'):'ExplanationOut',
          ('get','/classes/{classId}/activity'):'ActivityList'}
        summaries={
          ('get','/health'):'mock 실행 상태',('post','/auth/login'):'역할을 확인한 로그인',('get','/auth/me'):'현재 사용자·다음 이동·지원 기능',('post','/auth/logout'):'로그아웃',
          ('get','/classes'):'내 클래스 목록',('post','/classes'):'교사의 클래스 개설',('post','/classes/{classId}/invitations'):'교사 공유·학생 초대 발급',('post','/invitations/accept'):'초대 수락',
          ('get','/diagnostic'):'최초 진단 진행 상태',('post','/diagnostic/start'):'최초 진단 시작 또는 기존 상태 반환',('get','/diagnostic/next-question'):'다음 미제출 진단 문항',('post','/diagnostic/answers'):'진단 답안 저장·완료 채점',('get','/diagnostic/results'):'본인 진단10파트·5종합 결과',
          ('get','/classes/{classId}/students'):'학생 목록과 전체영역 수준표',('get','/classes/{classId}/students/{memberId}/diagnostic'):'교사의 개별 학생 진단 상세',
          ('post','/classes/{classId}/files'):'교사 PDF 업로드 mock',('get','/files/{fileId}/download'):'권한 확인 후 가상 PDF 다운로드',('post','/classes/{classId}/sources'):'자기 교과 원본 등록',('get','/classes/{classId}/sources'):'자기 교과 원본 목록',('get','/sources/{sourceId}'):'교사 원본 상세',
          ('post','/classes/{classId}/generation-jobs'):'학생별 AI 생성 작업 접수 mock',('get','/generation-jobs/{jobId}'):'내 생성 작업 상태·결과',
          ('get','/classes/{classId}/materials'):'역할별 허용 전환본 목록',('get','/materials/{materialId}'):'역할별 허용 전환본 상세',('patch','/materials/{materialId}'):'초안 수정·검토 해제',('post','/materials/{materialId}/review'):'전환본 검토 완료',('post','/materials/{materialId}/publish'):'학생별 전환본 배포',
          ('get','/classes/{classId}/quizzes'):'역할별 허용 문제 묶음 목록',('get','/quizzes/{quizId}'):'문제 상세·학생 정답 제외',('patch','/quizzes/{quizId}/questions/{questionId}'):'문항·정답·해설 수정',('post','/quizzes/{quizId}/review'):'문제 묶음 검토 완료',('post','/quizzes/{quizId}/publish'):'학생별 문제 묶음 배포',
          ('post','/quizzes/{quizId}/answers'):'최초 답안 또는 오답 재풀이 제출',('get','/quizzes/{quizId}/results'):'최초 성적·현재 정오·재풀이 수',('get','/quizzes/{quizId}/questions/{questionId}/explanation'):'제출 이후 문항 해설',
          ('get','/classes/{classId}/activity'):'교사 자기 교과 최근 배포·풀이',('get','/classes/{classId}/dashboard'):'교사·학생 대시보드',
          ('get','/ai-credentials'):'본인 Solar 연결 목록·마스킹',('post','/ai-credentials'):'가상 키 등록 mock',('post','/ai-credentials/{credentialId}/check'):'가상 연결 확인 mock',('delete','/ai-credentials/{credentialId}'):'본인 연결 해제'}
        for path,methods in document['paths'].items():
          short=path.removeprefix('/api/v1')
          for method,op in methods.items():
            if method not in ['get','post','patch','put','delete']:continue
            op['summary']=summaries.get((method,short),op.get('summary',''))
            public=short in ['/health','/auth/login']
            op['security']=[] if public else [{'CookieSession':[]}]
            headers=[]
            if method in ['post','patch','put','delete'] and not public:
              headers.append(('X-CSRF-Token','로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요.'))
            if method=='patch' or (method=='post' and short.endswith(('/review','/publish'))):
              headers.append(('If-Match','조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412.'))
            if method=='post' and (short.endswith('/generation-jobs') or (short.startswith('/quizzes/') and short.endswith('/answers'))):
              headers.append(('Idempotency-Key','논리 요청 식별자. 같은 내용 재전송에 같은 키, 다른 내용 재사용은409.'))
            if headers:
              op.setdefault('parameters',[]).extend({'name':name,'in':'header','required':True,'schema':{'type':'string'},'description':desc} for name,desc in headers)
            name=extra.get((method,short))
            for code,response in op.get('responses',{}).items():
              if not code.startswith('2') or code=='204':continue
              if name:response.setdefault('content',{})['application/json']={'schema':ref(name)}
              if short=='/classes/{classId}/dashboard':response.setdefault('content',{})['application/json']={'schema':{'oneOf':[ref('TeacherDashboard'),ref('StudentDashboard')]}}
              if 'materials/{materialId}' in short or 'quizzes/{quizId}' in short and not short.endswith(('/answers','/results','/explanation')):
                response.setdefault('headers',{})['ETag']={'description':'현재 콘텐츠 버전. 수정·검토·배포 시 If-Match로 전달.','schema':S}
              if short=='/files/{fileId}/download':
                response['content']={'application/pdf':{'schema':{'type':'string','format':'binary'}}}
        app.openapi_schema=document
        return document
    app.openapi=schema
