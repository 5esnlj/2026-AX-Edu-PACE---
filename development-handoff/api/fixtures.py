"""Synthetic fixture data only: not an official assessment or real student data."""
from datetime import datetime, timezone

AREAS = ['korean', 'math', 'social', 'science', 'daily']
SKILLS = ['listening', 'reading']
PASSWORD = 'mock-pass-123'

def timestamp():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def questions():
    result = []
    for area in AREAS:
        for skill in SKILLS:
            for i, weight in enumerate([5,5,15,15,15,15,30]):
                result.append(dict(id=f'dq_{len(result)+1:03}', sequence=len(result)+1,
                    area=area, skill=skill, tier=['beginner','beginner','intermediate','intermediate','advanced','advanced','advanced'][i],
                    gateSlot=(i%2+1) if i<6 else None, maxPoints=weight,
                    prompt=f'[가상 진단] {area} {skill} 문제 {i+1}. 예시 설명과 일치하는 보기를 고르세요.',
                    options=[dict(id=str(n),text=f'예시 보기 {n}') for n in range(1,5)],
                    correctOptionId='1', audioUrl=None, stimulusText='가상 듣기 지문입니다. 실제 음원과 공식 문항은 별도로 등록해야 합니다.'))
    return result

def diagnosis_results(score=100):
    # Complete seed users answered every mock question correctly; consistent with rubric.
    return dict(formId='form_mock_v1', isSynthetic=True,
        parts=[dict(area=a,skill=s,score=100,maxScore=100,level='advanced') for a in AREAS for s in SKILLS],
        areas=[dict(area=a,score=200,maxScore=200,level='advanced') for a in AREAS])

def quiz_question(quiz_id, position, kind='multiple_choice_4'):
    choices=[dict(id='1',text='맞아요'),dict(id='2',text='아니에요')] if kind=='true_false' else [dict(id=str(i),text=f'예시 보기 {i}') for i in range(1,5)]
    return dict(id=f'{quiz_id}_q{position}',position=position,questionType=kind,
        prompt=f'[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? ({position})', choices=choices,
        correctOptionId='1',explanation='가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.',
        sourceSentenceIds=['s1'],maxPoints=1)

def initial_state():
    now=timestamp()
    users={}
    for login,role,language in [('t_math','teacher','ko'),('t_science','teacher','ko'),('t_outside','teacher','ko'),('s_a','student','zh'),('s_b','student','vi'),('s_pending','student','mn'),('s_new','student','ru'),('s_outside','student','ru')]:
        uid='usr_'+login
        users[uid]=dict(id=uid,loginId=login,role=role,displayName={'s_a':'학생 A (가상)','s_b':'학생 B (가상)'}.get(login,login+' (가상)'),nativeLanguage=language,status='active',verified=role=='teacher')
    classes={'cls_1':dict(id='cls_1',name='가상 3학년 2반',gradeLabel='중3',academicYear=2026,ownerId='usr_t_math',status='active'),
             'cls_2':dict(id='cls_2',name='가상 다른 반',gradeLabel='중2',academicYear=2026,ownerId='usr_t_outside',status='active')}
    memberships={}
    for user,cls,subject in [('t_math','cls_1','math'),('t_science','cls_1','science'),('t_outside','cls_2','math'),('s_a','cls_1',None),('s_b','cls_1',None),('s_pending','cls_1',None),('s_outside','cls_2',None)]:
        mid='mem_'+user
        memberships[mid]=dict(id=mid,classId=cls,userId='usr_'+user,role=users['usr_'+user]['role'],teacherSubject=subject,status='active')
    sources={}
    files={}
    for sid,cls,teacher,subject in [('src_math_1','cls_1','usr_t_math','math'),('src_science_1','cls_1','usr_t_science','science'),('src_outside_1','cls_2','usr_t_outside','math')]:
        fid='file_'+sid
        sources[sid]=dict(id=sid,classId=cls,createdBy=teacher,fileId=fid,title={'math':'비와 비율','science':'물질의 상태'}[subject]+' (가상)',subject=subject,unit='1단원',unitNumber=None,thumbnailUrl=None,
            sourceText='자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.',sentences=[dict(id='s1',text='자료의 첫 문장입니다.')],createdAt=now,archived=False)
        files[fid]=dict(id=fid,classId=cls,createdBy=teacher,subject=subject,name='mock.pdf',size=100,mimeType='application/pdf',isSynthetic=True)
    materials={}
    for mid,sid,student,status in [('mat_a_math_1','src_math_1','mem_s_a','published'),('mat_b_math_1','src_math_1','mem_s_b','draft'),('mat_a_science_1','src_science_1','mem_s_a','published')]:
        source=sources[sid]
        materials[mid]=dict(id=mid,classId=source['classId'],sourceId=sid,studentMemberId=student,subject=source['subject'],title=source['title'],status=status,version=1,revision=1,createdBy=source['createdBy'],
            content=dict(paragraphs=[dict(id='s1',text='쉽게 바꾼 가상 학습자료입니다.')],translations=[]),createdAt=now,publishedAt=now if status=='published' else None,reviewedAt=now if status=='published' else None,thumbnailUrl=None,unitNumber=None)
    quizzes={}
    for qid,sid,student,status in [('quiz_a_math_1','src_math_1','mem_s_a','published'),('quiz_b_math_1','src_math_1','mem_s_b','draft'),('quiz_a_science_1','src_science_1','mem_s_a','published'),('quiz_outside_1','src_outside_1','mem_s_outside','draft')]:
        source=sources[sid]
        quizzes[qid]=dict(id=qid,classId=source['classId'],sourceId=sid,studentMemberId=student,inputMaterialId=None,subject=source['subject'],title=source['title']+' 확인문제',questionType='multiple_choice_4',status=status,version=1,generationNo=1,createdBy=source['createdBy'],createdAt=now,
            publishedAt=now if status=='published' else None,reviewedAt=now if status=='published' else None,questions=[quiz_question(qid,i) for i in range(1,4)])
    diagnostics={}
    for uid in ['usr_s_a','usr_s_b','usr_s_outside']:
        diagnostics[uid]=dict(formId='form_mock_v1',status='completed',answers={q['id']:'1' for q in questions()},results=diagnosis_results(),completedAt=now)
    diagnostics['usr_s_pending']=dict(formId='form_mock_v1',status='in_progress',answers={},results=None,completedAt=None)
    credentials={}
    for uid in ['usr_t_math','usr_t_science','usr_t_outside']:
        cid='cred_'+uid.removeprefix('usr_')
        credentials[cid]=dict(id=cid,teacherId=uid,label='가상 Solar 연결',maskedSuffix='demo',status='active',provider='solar',isMock=True)
    return dict(users=users,classes=classes,memberships=memberships,sources=sources,files=files,materials=materials,quizzes=quizzes,diagnostics=diagnostics,
        credentials=credentials,sessions={},invitations={},jobs={},attempts={},submissions={},idempotency={},counters={})
