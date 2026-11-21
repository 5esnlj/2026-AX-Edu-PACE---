"""Build a reproducible API document from the running mock contract and responses."""
from pathlib import Path
import json, re, html

ROOT = Path(__file__).parent

def dump(name, value):
    (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def build_spec(app, examples):
    spec=app.openapi()
    dump('openapi.json',spec)
    dump('examples.json',examples)
    models=spec.get('components',{}).get('schemas',{})
    def typename(s):
        if '$ref' in s:return s['$ref'].split('/')[-1]
        if 'anyOf' in s:return ' / '.join(typename(x) for x in s['anyOf'])
        if 'enum' in s:return 'enum: '+', '.join(str(x) for x in s['enum'])
        if s.get('type')=='array':return 'array<'+typename(s.get('items',{}))+'>'
        return s.get('type','object')
    lines=['# 가나다계단 API 명세 초안', '',
      '버전: '+spec['info'].get('version','1.0.0')+' · 기준일 2026-11-21 · 실제 React FE 검토 반영 / MariaDB DML 기반 mock', '',
      '**이 문서는 mock 서버의 OpenAPI와 실제 HTTP 응답 예시에서 생성했습니다.** 실제 DB·Solar를 사용하는 운영 백엔드는 아직 구현하지 않았습니다. 이번 1.1판은 첨부 React + TypeScript + Vite 소스의 실제 3개 화면과 기존 HANDOFF의19개 화면 설명을 대조했습니다. Figma 캔버스 자체를 직접 열어 시각적으로 비교한 것은 아닙니다. 수정된 FE 연결본과 변경 요약은 상위 폴더의 frontend/ 및 API_CHANGES.md를 참고하세요.', '',
      '## 읽는 순서', '',
      '상위 폴더 API_CHANGES.md에서 1.1 변경을 확인한 뒤 screen-map.md에서 화면을 찾고 아래 메서드/경로를 확인합니다. 요청 DTO 필드는 뒤의 스키마 목록에서, 실제 응답 예시는 examples.json과 이 문서 마지막에서 확인합니다. OpenAPI 전체 구조는 openapi.json을 사용합니다.', '',
      '## 공통 계약', '',
      '- 기본 주소: `http://127.0.0.1:8081/api/v1`. `/docs`는 Swagger UI, `/openapi.json`은 기계가 읽는 명세입니다.',
      '- JSON camelCase. ID는 문자열입니다. mock ID는 읽기 쉬운 접두어이며 실제 DB BIGINT도 응답에서는 문자열로 직렬화합니다.',
      '- 단건은 객체, 목록은 `{items: [...], nextCursor: null}`입니다. mock은 작은 고정목록 전체 반환이며 실제 대용량 운영에서는 cursor 페이지네이션을 구현해야 합니다.',
      '- 로그인 역할 탭은 실제 계정 역할과 일치해야 합니다. 인증은 HttpOnly 세션 쿠키입니다.',
      '- 로그인 응답의 csrfToken을 인증된 쓰기 요청의 X-CSRF-Token 헤더에 넣습니다. 생성/답안에는 Idempotency-Key, 수정/검토/배포에는 If-Match 버전이 필요합니다.',
      '- 원본·전환본·문제·파일·풀이 직접 접근에도 교사 클래스+교과 제한/학생 본인배정+배포조건을 적용합니다. UI에서 숨기는 것으로 대체하지 않습니다.',
      '- 진단 미완료 학생은 클래스가입/진단 외 학습 흐름으로 넘어가지 않습니다. 진단은 계정당1회, 완료결과는 파트10개·영역종합5개입니다.',
      '- 공개된 문항의 정답/해설은 학생의 첫 제출 전 응답에 포함하지 않습니다. 교사 검토용 응답과 구분합니다.',
      '- 상태·오류·숫자의 의미 및 UI와의 차이는 decisions.md에 기록했습니다. actual mock limitations는 README에 기록했습니다.', '',
      '| HTTP | 의미 |', '|---|---|',
      '| 200 / 201 / 202 / 204 | 조회·처리 성공 / 생성 / 생성작업 접수 / 응답 본문 없는 성공 |',
      '| 401 | 로그인 없음·만료·잘못된 로그인 |',
      '| 403 / 404 | 역할·CSRF 등 거절 / 없거나 현재 사용자가 접근할 수 없는 리소스 |',
      '| 409 | 순서·상태·중복키의 다른내용·완료된진단·정답후재풀이 등 충돌 |',
      '| 412 / 428 | 오래된 버전 / 필요한 If-Match 없음 |',
      '| 413 / 415 / 422 | 파일크기 / 파일형식 / 요청값 검증 실패 |', '',
      '오류는 `{code, message, requestId, details}`입니다. 같은 멱등키로 다른 내용을 보내면 기존 성공 응답을 반환하지 않고 충돌 처리합니다. 수정 이후에는 새 버전을 다시 읽습니다.', '',
      '## 엔드포인트 목록', '',
      '| 메서드 | 경로 | 동작 | 요청 본문 | 정상응답 / 응답 DTO |', '|---|---|---|---|---|']
    count=0
    for path,methods in spec['paths'].items():
      for method,op in methods.items():
        if method not in ['get','post','put','patch','delete']:continue
        count+=1
        body=op.get('requestBody',{}).get('content',{})
        schema=next(iter(body.values()),{}).get('schema',{})
        response=', '.join(k+' '+typename(v.get('content',{}).get('application/json',{}).get('schema',{})) for k,v in op.get('responses',{}).items() if k.startswith('2'))
        lines.append(f"| {method.upper()} | `{path}` | {op.get('summary',op.get('operationId',''))} | {typename(schema) if body else '없음'} | {response} |")
    lines+=['',f'엔드포인트 총 {count}개. 로그인·자료 업로드·진단·생성·검토·배포·풀이를 포함합니다.', '', '## 경로·쿼리·헤더 매개변수', '']
    for path,methods in spec['paths'].items():
      for method,op in methods.items():
        if method not in ['get','post','put','patch','delete'] or not op.get('parameters'):continue
        lines += [f'### {method.upper()} {path}','','| 이름 | 위치 | 필수 | 형식 / 설명 |','|---|---|---|---|']
        for p in op['parameters']:
          lines.append(f"| `{p['name']}` | {p['in']} | {'예' if p.get('required') else '아니오'} | {typename(p.get('schema',{}))} {p.get('description','').replace('|','/')} |")
        lines+=['']
    lines+=['## 요청과 응답 스키마','']
    for name,schema in models.items():
      lines+=['### '+name,'']
      if schema.get('description'):lines+=[schema['description'],'']
      if 'enum' in schema:lines+=[str(schema['enum']),''];continue
      props=schema.get('properties',{})
      if not props:lines+=['```json',json.dumps(schema,ensure_ascii=False,indent=2),'```',''];continue
      lines+=['| 필드 | 형식 | 필수 | 설명/기본값 |','|---|---|---|---|']
      for field,f in props.items():
        info=f.get('description','')
        if 'default' in f:info+=' 기본값: '+json.dumps(f['default'],ensure_ascii=False)
        lines.append(f"| `{field}` | {typename(f)} | {'예' if field in schema.get('required',[]) else '아니오'} | {info.replace('|','/')} |")
      lines+=['']
    lines+=['## 실제 mock 요청·응답 예시','','모두 가상 데이터입니다. csrfToken은 전달용 문서에서 대체 표시했습니다. 전체 예시는 examples.json을 참고합니다.','']
    for ex in examples:
      lines+=['### '+ex['name'],'',f"`{ex['method']} {ex['path']}` → {ex['status']}",'']
      if ex.get('request') is not None:lines+=['요청:','```json',json.dumps(ex['request'],ensure_ascii=False,indent=2),'```','']
      response=ex.get('response')
      # Avoid duplicating large quiz/diagnosis payloads; complete example is in JSON.
      if len(json.dumps(response,ensure_ascii=False))>5000:
        lines+=['응답 전문은 examples.json의 같은 이름을 참고하세요.',''];continue
      lines+=['응답:','```json',json.dumps(response,ensure_ascii=False,indent=2),'```','']
    lines+=['## 백엔드 구현 연결','','DML88개와 기존DDL은 baseline/에 보존했습니다. 세션→users/user_sessions, 클래스→classes/class_memberships/class_invitations, 진단→진단6테이블, 생성→ai_credentials/ai_requests, 자료→files/source_materials/student_materials, 문제→quizzes/quiz_questions, 풀이→quiz_submissions/quiz_answer_attempts로 연결합니다.','',
      '교사 초대의 지정교과를 실제DB에 저장하려면 class_invitations의 교과컬럼을 추가하는 제안이 필요합니다. 이 파일묶음은 DB마이그레이션을 실행하지 않습니다. 진단70문항·PDF본문·AI응답은 합성 mock이며 공식문항/Solar응답으로 오인하지 않습니다.','']
    md='\n'.join(lines)
    (ROOT/'API_SPEC.md').write_text(md,encoding='utf-8')
    # A self-contained, offline readable document; no external script/CDN dependency.
    content=html.escape(md)
    page='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>가나다계단 API 명세</title><style>body{margin:0;background:#faf9f6;color:#242838;font-family:system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:32px}h1{color:#c73e37}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 ui-monospace,monospace;background:white;padding:24px;border:1px solid #ddd;border-radius:12px}input{width:80%;padding:12px;margin:8px 0}</style><main><h1>가나다계단 API 명세</h1><p>오프라인 열람용 문서입니다. 브라우저의 Ctrl+F로 경로나 필드를 검색할 수 있습니다. 실행형 명세는 mock 서버의 /docs에서 확인하세요.</p><pre>'+content+'</pre></main></html>'
    (ROOT/'API_SPEC.html').write_text(page,encoding='utf-8')
    return count

if __name__=='__main__':
    import mock_server
    examples=json.loads((ROOT/'examples.json').read_text()) if (ROOT/'examples.json').exists() else []
    print('documented endpoints:',build_spec(mock_server.app,examples))
