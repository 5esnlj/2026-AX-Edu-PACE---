// 컴포넌트·페이지 코드에 색 값, 서버 주소, 직접 fetch가 들어갔는지 점검 (CLAUDE.md 5장)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src/components', 'src/pages', 'src/App.tsx', 'src/App.module.css'];
const rules = [
  { name: '색 값 직접 사용', re: /#[0-9a-fA-F]{3,8}\b|rgba?\(/ },
  { name: '서버 주소 직접 사용', re: /https?:\/\/(?!www\.figma\.com)/ },
  { name: 'api 폴더 밖 fetch', re: /\bfetch\(|axios/ },
];
const files = [];
const walk = (p) => { if (statSync(p).isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f))); else if (/\.(tsx?|css)$/.test(p) && !p.endsWith('.figma.tsx')) files.push(p); };
roots.forEach(walk);

let bad = 0;
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const r of rules) if (r.re.test(line)) { bad++; console.log(`✗ ${r.name}: ${f}:${i + 1}  ${line.trim()}`); }
  });
}
console.log(bad ? `\n${bad}곳을 고쳐주세요. 색은 tokens.css 변수, 서버 호출은 src/api/에서만.` : '✓ 하드코딩 없음');
process.exit(bad ? 1 : 0);
