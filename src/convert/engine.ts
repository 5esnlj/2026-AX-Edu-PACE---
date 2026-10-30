// @ts-nocheck
/* 변환 예시(민사 재판) 화면 엔진.
   public/convert/view.html의 로직을 그대로 옮겨, 가나다 계단 화면 안에서 원본 지면을 그려요.
   - 학생: 밑줄 표현(누르면 원래 표현), 교과 개념어 '설명', 모국어 병기, 쉬운 표현·그림 펼침, 듣기, 드래그로 단어 찾기
   - 교사: 펼친 곳의 '수정하기', 원문으로 되돌리기, 지면 글자를 드래그해 밑줄·설명·시각 자료 추가
   교사가 고친 내용은 이 브라우저에 저장돼요(ganada-convert:자료id:학생id). */
import "./convert.css";

export type ConvertOptions = {
  mode: "teacher" | "student";
  band: "l2" | "l4" | "l5";
  lang: string;
  langName: string;
  name: string;
  storageKey: string;
  scale?: number;
  showOriginal?: boolean;
  known?: string[];
  onWord?: (term: string, kind: "known" | "unknown") => void;
  onChange?: () => void;
};

export function readingBand(reading: number): "l2" | "l4" | "l5" {
  // 진단 전(0)이면 중간 단계(읽기 3~4용)로 보여 줘요.
  if (!reading) return "l4";
  return reading <= 2 ? "l2" : reading <= 4 ? "l4" : "l5";
}

export function mountConvert(root: HTMLElement, opts: ConvertOptions) {
  const IMG = Object.fromEntries(["story","kid1","kid2","court","step1","step2","step3","step4","step5"].map(k => [k, "/convert/img/" + k + ".jpg"]));
  const STU = { cur: { name: opts.name, lang: opts.lang, ln: opts.langName, band: opts.band, lv: "" } };
  const BAND = g => (STU[g] || {}).band || g;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const $ = id => root.querySelector("#" + id);
  const lang = () => STU[st.stu].lang;
  const TM = false;
  const TIER_NAME = {"1":"생활 한국어","2-1":"학습 도구(교실 어휘)","2-2":"학습 도구(사고 도구)","2-3":"학습 도구(범용 지식 어휘)","3":"교과 적응 한국어"};
const T = {
 "민사 재판":{easy:"개인과 개인 사이의 다툼을 해결하는 재판", zh:"民事审判", uz:"fuqarolik sudi", mn:"иргэний хэргийн шүүх"},
 "원고":{easy:"법원에 먼저 재판을 부탁한 사람", zh:"原告", uz:"da’vogar", mn:"нэхэмжлэгч"},
 "피고":{easy:"재판을 당한 사람", zh:"被告", uz:"javobgar", mn:"хариуцагч"},
 "판사":{easy:"재판을 진행하고 판결을 내리는 사람", zh:"法官", uz:"sudya", mn:"шүүгч"},
 "판결":{easy:"판사가 누구의 주장이 옳은지 정하는 것", zh:"判决", uz:"sud qarori", mn:"шийдвэр"},
 "소송 대리인":{easy:"원고나 피고를 대신해 재판에서 일하는 사람", zh:"诉讼代理人", uz:"sudda vakil", mn:"төлөөлөгч"},
 "변호사":{easy:"법을 잘 알고 다른 사람을 법적으로 도와주는 사람", zh:"律师", uz:"advokat", mn:"өмгөөлөгч"},
 "소장":{easy:"원고가 소송을 걸며 법원에 내는 문서", zh:"起诉状", uz:"da’vo arizasi", mn:"нэхэмжлэл"},
 "답변서":{easy:"피고가 소장을 읽고 자기 입장을 써서 내는 문서", zh:"答辩状", uz:"e’tiroz", mn:"хариу тайлбар"},
 "증거":{easy:"내 주장이 맞다는 것을 보여 주는 것", zh:"证据", uz:"dalil", mn:"нотлох баримт"},
 "변론":{easy:"법정에서 양쪽이 자기 주장을 말하는 것", zh:"辩论", uz:"muhokama", mn:"мэтгэлцээн"},
 "권리":{easy:"법이 지켜 주는 나의 몫이나 자격", zh:"权利", uz:"huquq", mn:"эрх"}
};

const SW_TIER = {"다툰다면":"1","영감에게서":"1","밭을 갈던":"1","발견하였다":"2-1","당장 돌려주게":"1","항아리이니":"1","의미와":"2-1","역할을":"2-1","개인 사이의 다툼":"2-3","소송을 제기한 사람":"3","소송을 당한 사람":"3","양측의":"2-2","법률 지식이 부족하여":"2-3","자신의 주장을 펼치기":"2-2","법률적인 도움":"2-3","그 역할을 맡는다":"2-1","당사자를 대신하여":"3","작성하고":"2-1","제출하며":"2-1","당사자의 주장을 펼친다":"2-2","주장을 펼친다":"2-2","소송을 제기하며":"3","문서로":"2-1","요구하는지":"2-2","자신의 입장":"2-2","문서이다":"2-1","입장을 밝힌다":"2-2","양측이":"2-2","주장을 뒷받침할":"2-2","각자의 주장을 펼친다":"2-2","판단한다":"2-2","당사자를 대신해":"3","법률 지식이 부족한 사람":"2-3","알맞은 용어":"2-1","소송을 제기한다면":"3"};

const OFFICIAL = {
 "원고":{vi:"nguyên cáo", zh:"原告", ru:"истец", ja:"原告", mn:"нэхэмжлэгч"},
 "피고":{vi:"bị cáo", zh:"被告", ru:"ответчик", ja:"被告", mn:"хэрэгтэн"},
 "소송 대리인":{vi:"người đại diện trong tố tụng", zh:"诉讼代理人", ru:"иск представитель", ja:"訴訟代理人", mn:"нэхэмжлэл орлогч"}
};

const D = {
 "다툼":{easy:"서로 자기가 맞다고 싸우는 일",zh:"争执",uz:"nizo",mn:"маргаан"},
 "다투다":{easy:"서로 자기가 맞다고 싸우다",zh:"争吵",uz:"janjallashmoq",mn:"маргалдах"},
 "해결":{easy:"문제를 풀어서 끝내는 것",zh:"解决",uz:"hal qilish",mn:"шийдвэрлэх"},
 "재판":{easy:"법원에서 누가 옳은지 정하는 일",zh:"审判",uz:"sud",mn:"шүүх хурал"},
 "법원":{easy:"재판을 하는 곳",zh:"法院",uz:"sud",mn:"шүүх"},
 "법정":{easy:"법원 안에서 재판을 하는 방",zh:"法庭",uz:"sud zali",mn:"шүүх хурлын танхим"},
 "법률":{easy:"나라에서 정한 법",zh:"法律",uz:"qonun",mn:"хууль"},
 "지식":{easy:"배우거나 겪어서 아는 것",zh:"知识",uz:"bilim",mn:"мэдлэг"},
 "부족":{easy:"모자라는 것",zh:"不足",uz:"yetishmaslik",mn:"дутагдал"},
 "소송":{easy:"법원에 재판을 해 달라고 하는 것",zh:"诉讼",uz:"da’vo",mn:"шүүхэд хандах"},
 "제기":{easy:"문제나 요구를 내놓는 것",zh:"提起",uz:"qo‘zg‘atish",mn:"гаргах"},
 "양측":{easy:"서로 맞선 두 쪽",zh:"双方",uz:"ikki tomon",mn:"хоёр тал"},
 "주장":{easy:"자기 생각이 맞다고 내세우는 말",zh:"主张",uz:"fikr",mn:"санал"},
 "당사자":{easy:"어떤 일을 직접 하는 사람. 재판에서는 원고와 피고",zh:"当事人",uz:"tomon",mn:"оролцогч тал"},
 "대리인":{easy:"다른 사람 대신 일을 하는 사람",zh:"代理人",uz:"vakil",mn:"төлөөлөгч"},
 "작성":{easy:"글이나 서류를 쓰는 것",zh:"撰写",uz:"yozish",mn:"бичих"},
 "제출":{easy:"서류나 물건을 내는 것",zh:"提交",uz:"topshirish",mn:"ирүүлэх"},
 "서류":{easy:"어떤 일에 필요한 내용을 적은 종이",zh:"文件",uz:"hujjat",mn:"бичиг баримт"},
 "문서":{easy:"글로 적어 둔 종이",zh:"文件",uz:"hujjat",mn:"баримт бичиг"},
 "요구":{easy:"해 달라고 하는 것",zh:"要求",uz:"talab",mn:"шаардлага"},
 "입장":{easy:"어떤 일에 대한 자기 생각",zh:"立场",uz:"pozitsiya",mn:"байр суурь"},
 "뒷받침":{easy:"뒤에서 받쳐 도와주는 것",zh:"支持",uz:"qo‘llab-quvvatlash",mn:"дэмжих"},
 "판단":{easy:"생각해서 정하는 것",zh:"判断",uz:"baholash",mn:"дүгнэх"},
 "역할":{easy:"맡아서 하는 일",zh:"作用",uz:"vazifa",mn:"үүрэг"},
 "의미":{easy:"말이나 일의 뜻",zh:"意义",uz:"ma’no",mn:"утга"},
 "요술":{easy:"신기한 일을 일으키는 재주",zh:"魔法",uz:"sehr",mn:"ид шид"},
 "항아리":{easy:"배가 볼록한 큰 그릇",zh:"缸",uz:"ko‘za",mn:"ваар"},
 "영감":{easy:"나이 많은 남자를 부르는 말",zh:"老头",uz:"chol",mn:"өвгөн"},
 "욕심":{easy:"무언가를 너무 많이 가지고 싶은 마음",zh:"贪心",uz:"ochko‘zlik",mn:"шунал"},
 "발견":{easy:"몰랐던 것을 찾아내는 것",zh:"发现",uz:"topish",mn:"олох"},
 "밭":{easy:"채소나 곡식을 기르는 땅",zh:"田地",uz:"dala",mn:"тариалангийн талбай"},
 "농부":{easy:"농사를 짓는 사람",zh:"农夫",uz:"dehqon",mn:"тариачин"},
 "과정":{easy:"일이 진행되는 순서",zh:"过程",uz:"jarayon",mn:"явц"},
 "덕분":{easy:"도움을 받아서 좋게 된 까닭",zh:"多亏",uz:"tufayli",mn:"ачаар"},
 "행위":{easy:"사람이 하는 일이나 행동",zh:"行为",uz:"harakat",mn:"үйлдэл"}
};

const JOSA = ["으로부터","에서는","에게서","으로","에서","에게","이다","하여","하고","하며","하는","하던","하다","한다","했다","하였다","할","한","된","은","는","이","가","을","를","의","에","와","과","로","도","만","적인","적"];

function lookup(raw){
  const w = raw.replace(/[\s.,!?'"“”‘’「」()·~:;]/g,"");
  if (!w) return null;
  const tryKey = k => T[k] ? {key:k, d:T[k], term:true} : (D[k] ? {key:k, d:D[k]} : null);
  let r = tryKey(w) || tryKey(raw.trim());
  if (r) return r;
  for (const j of JOSA){ if (w.length > j.length && w.endsWith(j)){ r = tryKey(w.slice(0,-j.length)); if (r) return r; } }
  const keys = [...Object.keys(T), ...Object.keys(D)].map(k=>k.replace(/ /g,"")).sort((a,b)=>b.length-a.length);
  for (const k of keys){ if (w.startsWith(k)){ const orig = Object.keys(T).find(x=>x.replace(/ /g,"")===k) || k; r = tryKey(orig); if (r) return r; } }
  return null;
}

const P = {
 conn:{o:"항아리를 두고 다툰다면, 누가 도와줄 수 있을까요?", sw:[["다툰다면","싸운다면",["l2"]]]},
 s1:{o:"옛날 어느 마을의 가난한 농부가 욕심 많은 영감에게서 밭을 샀다.", sw:[["영감에게서","영감(나이 많은 할아버지)에게서",["l2","l4"]]]},
 s2:{o:"어느 날 밭을 갈던 농부는 무엇이든 넣으면 똑같은 물건이 계속 나오는 요술 항아리를 발견하였다.", sw:[["밭을 갈던","밭에서 일하던",["l2"]],["발견하였다","찾았다",["l2"]]]},
 bOld:{o:"밭은 팔았어도 항아리까지 판 적은 없네! 당장 돌려주게.", sw:[["당장 돌려주게","빨리 돌려줘",["l2"]]]},
 bFarm:{o:"제가 산 밭에서 나온 항아리이니 제 것입니다.", sw:[["항아리이니","항아리니까",["l2"]]]},
 bSt1:{o:"재판을 한다면 누가 원고이고, 누가 피고가 될까?", sw:[]},
 bSt2:{o:"두 사람 모두 법을 잘 모르는 것 같은데, 누가 도와줄 수 있을까?", sw:[]},
 goal:{o:"민사 재판의 의미와 소송 대리인의 역할을 설명할 수 있다.", sw:[["의미와","뜻과",["l2"]],["역할을","하는 일을",["l2"]]]},
 c:{o:"[[민사 재판]]은 개인 사이의 다툼을 해결하기 위한 재판이다. 소송을 제기한 사람을 [[원고]], 소송을 당한 사람을 [[피고]]라고 하며, [[판사]]는 양측의 주장을 듣고 누구의 주장이 옳은지 [[판결]]을 내린다.",
   sw:[["개인 사이의 다툼","사람과 사람 사이의 다툼",["l2"]],["소송을 제기한 사람","법원에 먼저 재판을 부탁한 사람",["l2","l4"]],["소송을 당한 사람","재판을 당한 사람",["l2"]],["양측의","두 사람의",["l2","l4"]]],
   more:{l2:"두 사람이 다툴 때 법원에서 해결해요. 이것이 민사 재판이에요. 먼저 재판을 부탁한 사람은 원고, 재판을 당한 사람은 피고예요. 판사는 두 사람의 말을 듣고 누가 맞는지 정해요. 이것을 판결이라고 해요.",
         l4:"민사 재판에는 원고, 피고, 판사가 있다. 원고는 소송을 건 사람, 피고는 소송을 당한 사람, 판사는 판결을 내리는 사람이다."}},
 d:{o:"그런데 원고와 피고는 법률 지식이 부족하여 스스로 자신의 주장을 펼치기 어려운 경우가 많다. 이때 원고나 피고의 편에 서서 법률적인 도움을 주는 사람을 [[소송 대리인]]이라고 하며, 주로 [[변호사]]가 그 역할을 맡는다. 소송 대리인은 당사자를 대신하여 [[소장]]이나 [[답변서]]를 작성하고, [[증거]]를 제출하며, 법정에서 당사자의 주장을 펼친다.",
   sw:[["법률 지식이 부족하여","법을 잘 몰라서",["l2","l4"]],["자신의 주장을 펼치기","자기 생각을 말하기",["l2"]],["법률적인 도움","법에 대한 도움",["l2"]],["그 역할을 맡는다","그 일을 한다",["l2"]],["당사자를 대신하여","원고나 피고를 대신하여",["l2","l4"]],["작성하고","쓰고",["l2"]],["제출하며","내며",["l2"]],["당사자의 주장을 펼친다","원고나 피고의 주장을 대신 말한다",["l2"]],["당사자를 대신하여","당사자(재판을 직접 하는 원고나 피고)를 대신하여",["l5"]]],
   more:{l2:"법을 잘 모르면 재판에서 말하기 어려워요. 그래서 소송 대리인이 도와줘요. 보통 변호사가 소송 대리인이에요. 소송 대리인은 서류(소장, 답변서)를 쓰고, 증거를 내고, 법정에서 대신 말해요.",
         l4:"소송 대리인이 하는 일은 세 가지이다. ① 소장이나 답변서 쓰기 ② 증거 내기 ③ 법정에서 주장 말하기"},
   vis:true},
 law:{o:"법률에 따라 재판상 행위를 할 수 있는 대리인 외의 소송대리인은 변호사가 아니면 될 수 없다.", sw:[],
   more:{l2:"법이 따로 정한 경우가 아니면, 소송 대리인은 변호사만 될 수 있어요.", l4:"법이 따로 정한 경우가 아니면, 소송 대리인은 변호사만 될 수 있다.", l5:"즉, 법이 따로 허락한 경우를 빼면 변호사만 소송 대리인이 될 수 있다는 뜻이다."}},
 cap:{o:"원고와 피고, 각자의 소송 대리인이 판사 앞에서 주장을 펼친다.", sw:[["주장을 펼친다","자기 생각을 말한다",["l2"]]]},
 w1:{o:"원고가 소송을 제기하며 법원에 내는 문서로, 무엇을 요구하는지와 그 이유를 적는다.", sw:[["소송을 제기하며","재판을 부탁하며",["l2","l4"]],["문서로","문서(종이)로",["l2"]],["요구하는지","원하는지",["l2","l4"]]]},
 w2:{o:"피고가 소장의 내용에 대한 자신의 입장을 적어 법원에 내는 문서이다.", sw:[["자신의 입장","자기 생각",["l2","l4"]],["문서이다","문서(종이)이다",["l2"]]]},
 st1:{o:"원고가 법원에 소장을 낸다.", sw:[]},
 st2:{o:"피고가 답변서로 입장을 밝힌다.", sw:[["입장을 밝힌다","자기 생각을 말한다",["l2","l4"]]]},
 st3:{o:"양측이 주장을 뒷받침할 증거를 낸다.", sw:[["양측이","두 사람이",["l2","l4"]],["주장을 뒷받침할","자기 말이 맞다고 보여 줄",["l2"]]]},
 st4:{o:"법정에서 양측이 각자의 주장을 펼친다.", sw:[["양측이","두 사람이",["l2","l4"]],["각자의 주장을 펼친다","각자 자기 생각을 말한다",["l2"]]]},
 st5:{o:"판사가 누구의 주장이 옳은지 판단한다.", sw:[["판단한다","정한다",["l2"]]]},
 sum:{o:"소송 대리인은 ①~④의 과정에서 당사자를 대신해 서류를 작성하고 증거를 내며, 법정에서 당사자의 주장을 펼친다. 덕분에 법률 지식이 부족한 사람도 재판에서 자신의 [[권리]]를 지킬 수 있다.",
   sw:[["당사자를 대신해","원고나 피고를 대신해",["l2","l4"]],["작성하고","쓰고",["l2"]],["당사자의 주장을 펼친다","대신 주장을 말한다",["l2"]],["법률 지식이 부족한 사람","법을 잘 모르는 사람",["l2","l4"]]]},
 q1:{o:"이야기를 읽고 빈칸에 들어갈 알맞은 용어를 써 보자.", sw:[["알맞은 용어","알맞은 말",["l2"]]]},
 q1b:{o:"은/는 개인 사이의 다툼을 해결하기 위한 재판이다.", sw:[]},
 q2:{o:"영감이 항아리를 돌려 달라며 소송을 제기한다면, 원고와 피고는 각각 누구인지 써 보자.", sw:[["소송을 제기한다면","법원에 재판을 부탁한다면",["l2","l4"]]]},
 q3:{o:"두 사람이 법을 잘 모른다면 누구에게 어떤 도움을 받을 수 있을지 친구들과 이야기하고 써 보자.", sw:[]}
};


function termHTML(t){
  const d = T[t]; if (!d) return `<b>${esc(t)}</b>`;
  const g = glossOf(t, lang());
  const inner = (st.gloss && !st.raw && g && (st.view!=="student" || !st.known.has(t))) ? `<ruby>${esc(t)}<rt>${esc(g)}</rt></ruby>` : esc(t);
  const sayb = st.raw ? "" : `<button type="button" class="say" data-say="${esc(t)}" aria-label="${esc(t)} 듣기"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg></button>`;
  return `<button type="button" class="tm" data-term="${esc(t)}">${inner}</button>${sayb}`;
}

function txt(key){
  const p = P[key]; let s = p.o; const toks = [];
  if (!st.raw) for (const [o,e0,lv] of p.sw){
    if (!lv.includes(BAND(st.stu))) continue;
    const rid = st.stu+"|"+key+"|"+o;
    const rev = st.reverted.has(rid);
    if (rev && st.view!=="make") continue;
    const e = st.edits[rid] || e0;
    const i = s.indexOf(o); if (i < 0) continue;
    toks.push([o,e,rid,rev,!!st.edits[rid], isNote(o,e)]); s = s.slice(0,i) + "\u0001" + (toks.length-1) + "\u0002" + s.slice(i+o.length);
  }
  const cx = [];
  if (!st.raw) for (const a of (st.ann[st.stu]||[]).filter(a=>a.key===key)){
    let i = s.indexOf(a.phrase), len = a.phrase.length, isTerm = false;
    if (i < 0){ i = s.indexOf("[["+a.phrase+"]]"); len = a.phrase.length + 4; isTerm = true; }
    if (i < 0) continue;
    cx.push([a, isTerm]); s = s.slice(0,i) + "\u0003" + (cx.length-1) + "\u0004" + s.slice(i+len);
  }
  let h = esc(s).replace(/\[\[(.+?)\]\]/g, (m,t) => termHTML(t));
  h = h.replace(/\u0003(\d+)\u0004/g, (m,n) => cxHTML(cx[+n][0], cx[+n][1]));
  h = h.replace(/\u0001(\d+)\u0002/g, (m,n) => { const [o,e,rid,rev,ed,note] = toks[+n]; const id = key+"-"+n;
    if (note && !rev) return `<span class="nt${st.open.has(id)?" open":""}" data-nt="${id}" data-rid="${esc(rid)}" tabindex="0" role="button" aria-label="${esc(o)}, 추가 설명 보기"><span><span class="ph">${esc(o)}</span><span class="nb">설명</span></span><span class="nx">${esc(noteText(o,e))}${st.view==="make"?`<button type="button" class="edbtn" data-edrid="${esc(rid)}">수정하기</button>`:""}</span></span>`;
    if (rev) return `<span class="swap rev" data-sw="${id}" data-rid="${esc(rid)}" tabindex="0" role="button" title="원문으로 되돌림">${esc(o)}${st.view==="make"?`<button type="button" class="edbtn" data-edrid="${esc(rid)}">수정하기</button>`:""}</span>`;
    return `<span class="swap${st.open.has(id)?" open":""}${ed?" edited":""}" data-sw="${id}" data-rid="${esc(rid)}" tabindex="0" role="button" aria-label="${esc(e)}, 원래 표현 ${esc(o)}"><span class="e">${esc(e)}</span><span class="o">${esc(o)}${st.view==="make"?`<button type="button" class="edbtn" data-edrid="${esc(rid)}">수정하기</button>`:""}</span></span>`; });
  return `<span data-blk="${key}">${h}</span>`;
}

function cxHTML(a, isTerm){
  const oO = st.open.has("cxo-"+a.id), oN = st.open.has("cxn-"+a.id), oV = st.open.has("cxv-"+a.id);
  const main = isTerm ? termHTML(a.phrase) : (a.swap ? `<span class="cxs" data-cxo="${a.id}" role="button" tabindex="0"><span class="e">${esc(a.swap)}</span></span>` : `<span class="cxph">${esc(a.phrase)}</span>`);
  const chips = (a.note?`<button type="button" class="nb2${oN?" on":""}" data-cxn="${a.id}">설명</button>`:"") + (a.vis?`<button type="button" class="nb2${oV?" on":""}" data-cxv="${a.id}">그림</button>`:"");
  const eb = st.view==="make" ? `<button type="button" class="edbtn" data-edcx="${a.id}">수정하기</button>` : "";
  const panels = (a.swap && !isTerm && oO ? `<span class="cxp o">${esc(a.phrase)}${eb}</span>` : "") + (a.note && oN ? `<span class="cxp n">${esc(a.note)}${eb}</span>` : "") + (a.vis && oV ? `<span class="cxp v">${visMini(a.vis)}${eb?`<span class="edrow">${eb}</span>`:""}</span>` : "");
  return `<span class="cx${panels?" open":""}${oO&&a.swap&&!isTerm?" oo":""}" data-cx="${a.id}"><span>${main}${chips}</span>${panels}</span>`;
}

function visMini(v){
  const items = v.items.filter(Boolean);
  const title = v.title ? `<span class="vt2">${esc(v.title)}</span>` : "";
  if (v.kind === "seq") return `<span class="vm">${title}${items.map(x=>`<span class="bx">${esc(x)}</span>`).join('<span class="ar">→</span>')}</span>`;
  if (v.kind === "list") return `<span class="vm">${title}<ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></span>`;
  return `<span class="vm">${title}<span class="ct">${esc(v.center||"")}</span>${items.map(x=>`<span class="ar">—</span><span class="bx">${esc(x)}</span>`).join("")}</span>`;
}

function blkSource(key, g){
  let s = P[key].o;
  for (const [o,e0,lv] of P[key].sw){ if (!lv.includes(BAND(g))) continue; const i = s.indexOf(o); if (i>=0) s = s.slice(0,i) + "\u0001".repeat(o.length) + s.slice(i+o.length); }
  for (const a of (st.ann[g]||[]).filter(a=>a.key===key)){ const i = s.indexOf(a.phrase); if (i>=0) s = s.slice(0,i) + "\u0003".repeat(a.phrase.length) + s.slice(i+a.phrase.length); }
  return s;
}

function openAnnSheet(opt){
  const g = st.mkG; const a = opt.id ? st.ann[g].find(x=>x.id===opt.id) : null;
  const phrase = a ? a.phrase : opt.phrase, key = a ? a.key : opt.key;
  const isTerm = !!T[phrase] && P[key].o.includes("[["+phrase+"]]");
  const on = f => a ? !!a[f] : opt.preset===f;
  const v = (a && a.vis) || {kind:"rel", title:"", items:[], center:phrase};
  $("sheetIn").innerHTML = `<div class="t"><span>${a?"상호작용 고치기":"상호작용 추가"}</span><button type="button" class="x" id="sheetX" aria-label="닫기">✕</button></div>
   <div class="selq">${esc(phrase)}</div><span class="note">${STU[g].name} 그룹 · 여러 기능을 함께 추가할 수 있어요</span>
   <div class="fx"><label><input type="checkbox" id="fxSwap" ${on("swap")?"checked":""} ${isTerm?"disabled":""}>밑줄 추가 · 쉬운 표현으로 바꾸기</label>
     <div class="body">${isTerm?`<span class="note">교과 개념어는 바꾸지 않아요. 설명이나 시각 자료를 추가해 주세요.</span>`:`<input class="editin" id="fxSwapT" placeholder="학생에게 보일 쉬운 표현" value="${esc(a&&a.swap||"")}"><span class="note">학생은 쉬운 표현을 보고, 누르면 아래에 원문이 나와요.</span>`}</div></div>
   <div class="fx"><label><input type="checkbox" id="fxNote" ${on("note")?"checked":""}>설명 추가</label>
     <div class="body"><input class="editin" id="fxNoteT" placeholder="'설명' 버튼을 누르면 나올 짧은 설명" value="${esc(a&&a.note||"")}"><span class="note">원문은 그대로 두고 옆에 '설명' 버튼이 붙어요.</span></div></div>
   <div class="fx"><label><input type="checkbox" id="fxVis" ${on("vis")?"checked":""}>시각 자료 추가</label>
     <div class="body"><select id="fxVisK" aria-label="시각 자료 종류"><option value="rel" ${v.kind==="rel"?"selected":""}>관계 (가운데 말 + 연결된 말)</option><option value="seq" ${v.kind==="seq"?"selected":""}>흐름도 (순서)</option><option value="list" ${v.kind==="list"?"selected":""}>목록</option></select>
       <input class="editin" id="fxVisTitle" placeholder="제목 (선택)" value="${esc(v.title||"")}">
       <input class="editin" id="fxVisItems" placeholder="항목을 쉼표로 구분 (예: 소장 제출, 답변서 제출, 판결)" value="${esc(v.items.join(", "))}">
       <span class="note">'그림' 버튼을 누르면 표현 아래에 간단한 도식이 나와요.</span></div></div>
   <div class="row"><button type="button" class="cvb p" id="fxSave">저장</button>${a?`<button type="button" class="cvb s" id="fxDel">모두 지우기</button>`:""}<button type="button" class="cvb s" id="fxCancel">취소</button></div>`;
  $("sheet").hidden = false; $("sheetX").onclick = $("fxCancel").onclick = closeSheet;
  const focusOn = {swap:"fxSwapT", note:"fxNoteT", vis:"fxVisItems"}[opt.preset]; if (focusOn && $(focusOn)) setTimeout(()=>{ try{ $(focusOn).focus(); }catch(err){} }, 50);
  $("fxSave").onclick = () => {
    const swOn = $("fxSwap").checked && !isTerm, nOn = $("fxNote").checked, vOn = $("fxVis").checked;
    const sw = swOn ? $("fxSwapT").value.trim() : "", nt = nOn ? $("fxNoteT").value.trim() : "";
    const items = vOn ? $("fxVisItems").value.split(/[,，、]/).map(x=>x.trim()).filter(Boolean) : [];
    if (!swOn && !nOn && !vOn){ toast("추가할 기능을 하나 이상 골라 주세요"); return; }
    if (swOn && !sw){ toast("쉬운 표현을 입력해 주세요"); return; }
    if (nOn && !nt){ toast("설명을 입력해 주세요"); return; }
    if (vOn && !items.length){ toast("시각 자료 항목을 입력해 주세요"); return; }
    const rec = a || {id:"a"+(++st.annSeq), key, phrase};
    rec.swap = sw || null; rec.note = nt || null;
    rec.vis = vOn ? {kind:$("fxVisK").value, title:$("fxVisTitle").value.trim(), items, center:phrase} : null;
    if (!a){ st.ann[g] = st.ann[g] || []; st.ann[g].push(rec); }
    st.approved.delete(g); closeSheet(); render(); toast(a?"상호작용을 고쳤어요":"상호작용을 추가했어요");
  };
  const del = $("fxDel"); if (del) del.onclick = () => { st.ann[g] = st.ann[g].filter(x=>x!==a); st.approved.delete(g); closeSheet(); render(); toast("상호작용을 지웠어요"); };
}

function openMoreEdit(key){
  const g = st.mkG, mk = g+"|"+key, base = (P[key].more && P[key].more[BAND(g)]) || "", cur = (mk in st.moreEdits) ? st.moreEdits[mk] : base;
  $("sheetIn").innerHTML = `<div class="t"><span>쉬운 표현 수정</span><button type="button" class="x" id="sheetX" aria-label="닫기">✕</button></div>
   <span class="note">${STU[g].name} 그룹 · '쉬운 표현' 버튼을 누르면 나오는 문장</span>
   <textarea class="editin" id="meT" rows="5">${esc(cur)}</textarea>
   <div class="row"><button type="button" class="cvb p" id="meSave">저장</button>${base?`<button type="button" class="cvb s" id="meReset">에이전트 초안으로</button>`:""}<button type="button" class="cvb s" id="meDel">쉬운 표현 빼기</button></div>`;
  $("sheet").hidden = false; $("sheetX").onclick = closeSheet;
  const done = m => { st.approved.delete(g); closeSheet(); render(); toast(m); };
  $("meSave").onclick = () => { const v = $("meT").value.trim(); if (!v){ toast("문장을 입력해 주세요"); return; } st.moreEdits[mk] = v; st.open.add("more-"+key); done("쉬운 표현을 고쳤어요"); };
  $("meDel").onclick = () => { st.moreEdits[mk] = ""; done("쉬운 표현을 뺐어요"); };
  const r = $("meReset"); if (r) r.onclick = () => { delete st.moreEdits[mk]; done("에이전트 초안으로 되돌렸어요"); };
}

function openVisEdit(key){
  const g = st.mkG, mk = g+"|"+key, cur = (st.visEdits[mk] && !st.visEdits[mk].removed) ? st.visEdits[mk] : {kind:"rel", title:"민사 재판의 사람들", center:"판사", items:["원고","피고","소송 대리인"]};
  $("sheetIn").innerHTML = `<div class="t"><span>그림 수정</span><button type="button" class="x" id="sheetX" aria-label="닫기">✕</button></div>
   <span class="note">${STU[g].name} 그룹 · 저장하면 간단한 도식으로 바뀌어요</span>
   <select class="editin" id="veK" aria-label="그림 종류"><option value="rel" ${cur.kind==="rel"?"selected":""}>관계 (가운데 말 + 연결된 말)</option><option value="seq" ${cur.kind==="seq"?"selected":""}>흐름도 (순서)</option><option value="list" ${cur.kind==="list"?"selected":""}>목록</option></select>
   <input class="editin" id="veTitle" placeholder="제목" value="${esc(cur.title||"")}">
   <input class="editin" id="veCenter" placeholder="가운데 말 (관계일 때)" value="${esc(cur.center||"")}">
   <input class="editin" id="veItems" placeholder="항목을 쉼표로 구분" value="${esc(cur.items.join(", "))}">
   <div class="row"><button type="button" class="cvb p" id="veSave">저장</button><button type="button" class="cvb s" id="veReset">에이전트 초안으로</button><button type="button" class="cvb s" id="veDel">그림 빼기</button></div>`;
  $("sheet").hidden = false; $("sheetX").onclick = closeSheet;
  const done = m => { st.approved.delete(g); closeSheet(); render(); toast(m); };
  $("veSave").onclick = () => { const items = $("veItems").value.split(/[,，、]/).map(x=>x.trim()).filter(Boolean); if (!items.length){ toast("항목을 입력해 주세요"); return; } st.visEdits[mk] = {kind:$("veK").value, title:$("veTitle").value.trim(), center:$("veCenter").value.trim(), items}; st.open.add("vis-"+key); done("그림을 고쳤어요"); };
  $("veReset").onclick = () => { delete st.visEdits[mk]; done("에이전트 초안으로 되돌렸어요"); };
  $("veDel").onclick = () => { st.visEdits[mk] = {removed:true}; done("그림을 뺐어요"); };
}

function isNote(o,e){ return SW_TIER[o]==="3" || /\(/.test(e); }

function noteText(o,e){ const m = e.match(/\(([^)]+)\)/); return m ? m[1] : e; }

function moreHTML(key){
  const p = P[key]; if (st.raw || TM) return "";
  const mk = st.stu+"|"+key;
  const m = (mk in st.moreEdits) ? st.moreEdits[mk] : (p.more && p.more[BAND(st.stu)]);
  const ve = st.visEdits[mk];
  const v = (p.vis && BAND(st.stu) !== "l5" && !(ve && ve.removed)) || (ve && !ve.removed);
  if (!m && !v) return "";
  const edm = st.view==="make";
  const mo = st.open.has("more-"+key), vo = st.open.has("vis-"+key);
  return `<div class="more"><div class="row" style="gap:6px">
    ${m?`<button type="button" class="morebtn" data-tg="more-${key}" aria-expanded="${mo}">쉬운 표현</button>`:""}
    ${v?`<button type="button" class="morebtn" data-tg="vis-${key}" aria-expanded="${vo}">그림으로 보기</button>`:""}</div>
    ${m&&mo?`<div class="morebox"><span class="ml">쉬운 표현으로 다시 쓴 문장</span>${esc(m)}${edm?`<div class="edrow"><button type="button" class="edbtn" data-edmore="${key}">수정하기</button></div>`:""}</div>`:""}
    ${v&&vo?`${ve&&!ve.removed?`<div class="vis">${visMini(ve)}</div>`:visPeople()}${edm?`<div class="edrow"><button type="button" class="edbtn" data-edvis="${key}">수정하기</button></div>`:""}`:""}</div>`;
}

function visPeople(){
  return `<div class="vis"><svg viewBox="0 0 560 210" role="img" aria-label="판사 앞에서 원고와 피고가 각자의 소송 대리인과 함께 주장하는 관계도">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#4A525A"/></marker></defs>
  <rect x="215" y="8" width="130" height="50" rx="10" fill="#2B3138"/><text x="280" y="30" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">판사</text><text x="280" y="48" text-anchor="middle" font-size="11" fill="#fff">듣고 판결해요</text>
  <rect x="10" y="130" width="115" height="54" rx="10" fill="#D2ECEB"/><text x="67" y="154" text-anchor="middle" font-size="16" font-weight="800" fill="#2B3138">원고</text><text x="67" y="172" text-anchor="middle" font-size="11" fill="#4A525A">재판을 부탁한 사람</text>
  <rect x="140" y="130" width="120" height="54" rx="10" fill="#fff" stroke="#1E8C86" stroke-width="1.5"/><text x="200" y="154" text-anchor="middle" font-size="14" font-weight="800" fill="#2B3138">소송 대리인</text><text x="200" y="172" text-anchor="middle" font-size="11" fill="#4A525A">원고 편 변호사</text>
  <rect x="300" y="130" width="120" height="54" rx="10" fill="#fff" stroke="#1E8C86" stroke-width="1.5"/><text x="360" y="154" text-anchor="middle" font-size="14" font-weight="800" fill="#2B3138">소송 대리인</text><text x="360" y="172" text-anchor="middle" font-size="11" fill="#4A525A">피고 편 변호사</text>
  <rect x="435" y="130" width="115" height="54" rx="10" fill="#FDF4D8"/><text x="492" y="154" text-anchor="middle" font-size="16" font-weight="800" fill="#2B3138">피고</text><text x="492" y="172" text-anchor="middle" font-size="11" fill="#4A525A">재판을 당한 사람</text>
  <line x1="125" y1="157" x2="140" y2="157" stroke="#1E8C86" stroke-width="2"/><line x1="420" y1="157" x2="435" y2="157" stroke="#1E8C86" stroke-width="2"/>
  <path d="M200 128 L258 64" stroke="#4A525A" stroke-width="1.5" fill="none" marker-end="url(#ah)"/><path d="M360 128 L302 64" stroke="#4A525A" stroke-width="1.5" fill="none" marker-end="url(#ah)"/>
  <text x="214" y="98" text-anchor="end" font-size="12" fill="#4A525A">주장</text><text x="346" y="98" font-size="12" fill="#4A525A">주장</text>
  <text x="132" y="204" text-anchor="middle" font-size="11" fill="#1E8C86">한편</text><text x="428" y="204" text-anchor="middle" font-size="11" fill="#1E8C86">한편</text></svg></div>`;
}


function page1(){
  const lv = BAND(st.stu);
  const pick = (q,role,opts) => (st.raw||lv==="l5") ? "" : `<div class="chips">${opts.map(o=>`<button type="button" data-pick="${q}" data-role="${role}" data-v="${o}" class="${st.qa[q+role]===o?(o===ANS[q+role]?"ok":"no"):""}">${o}</button>`).join("")}</div>`;
  return `<div class="pin">
   <div class="chap"><div class="no">03</div><div class="t"><h2>재판의 의미와 공정한 재판</h2><div class="cbar"></div></div></div>
   <div class="conn"><span class="pill">연결! 일상으로</span><span class="q">${txt("conn")}</span></div>
   <div class="storybox">
     <div class="storytext"><p>${txt("s1")}</p><p>${txt("s2")}</p></div>
     <div class="scene"><img src="${IMG.story}" alt="항아리를 사이에 두고 농부와 영감이 다투는 그림">
       <div class="bubs">
        <div class="bub b-farmer">${txt("bFarm")}<span class="who">— 농부</span></div>
        <div class="bub b-old r">${txt("bOld")}<span class="who">— 영감</span></div>
        <div class="bub s b-st1">${txt("bSt1")}<span class="who">— 학생 1</span></div>
        <div class="bub s b-st2 r">${txt("bSt2")}<span class="who">— 학생 2</span></div>
       </div>
       <div class="kids"><img src="${IMG.kid1}" alt=""><img src="${IMG.kid2}" alt=""></div>
     </div>
   </div>
   <span class="src">— 전래 동화, 「요술 항아리」 재구성</span>
   <div class="act">
    <div class="aq"><span class="n">1</span><div class="cstem">${txt("q1")}</div>
      <div class="ans" style="display:grid;gap:8px"><div class="fillbox"><input id="a1" aria-label="빈칸 답" value="${esc(st.qa.a1||"")}"><span>${txt("q1b")}</span></div>
      ${pick("q1","",["판결","민사 재판","증거","소장"])}<span class="fb" id="fb-q1"></span>
      ${fair(["민사 재판"])}</div></div>
    <div class="aq"><span class="n">2</span><div class="cstem">${txt("q2")}</div>
      <div class="ans" style="display:grid;gap:8px"><div class="pairbox"><div class="pb"><b>원고</b><input id="a2a" aria-label="원고" value="${esc(st.qa.a2a||"")}"></div><div class="pb"><b>피고</b><input id="a2b" aria-label="피고" value="${esc(st.qa.a2b||"")}"></div></div>
      ${(st.raw||lv==="l5")?"":`<div class="row" style="gap:12px"><span class="note" style="color:#4A525A">원고</span>${pick("q2","원고",["영감","농부"])}<span class="note" style="color:#4A525A">피고</span>${pick("q2","피고",["영감","농부"])}</div>`}<span class="fb" id="fb-q2"></span>
      ${fair(["원고","피고"])}</div></div>
    <div class="aq"><span class="n">3</span><div class="cstem">${txt("q3")}</div>
      <div class="ans" style="display:grid;gap:8px">
      ${(st.raw||lv==="l5")?"":`<div class="more" style="margin:0"><button type="button" class="morebtn" data-tg="frame" aria-expanded="${st.open.has("frame")}">문장틀</button>${st.open.has("frame")?`<div class="morebox">${lv==="l2"?"___에게 도움을 받을 수 있어요. 그 사람은 ___을/를 해 줘요.":"___에게 도움을 받을 수 있다. 그 사람은 ___을/를 해 준다."}</div>`:""}</div>`}
      <textarea class="lines" id="a3" aria-label="3번 답">${esc(st.qa.a3||"")}</textarea>${fair(["소송 대리인"])}</div></div>
   </div>
   <div class="pfoot"><b>210</b><span>XI. 일상생활과 법</span></div></div>`;
}

function fair(){ return ""; }

const ANS = {q1:"민사 재판", "q2원고":"영감", "q2피고":"농부"};


function page2(){
  const steps = [["① 소장 제출","st1"],["② 답변서 제출","st2"],["③ 증거 제출","st3"],["④ 변론","st4"],["⑤ 판결","st5"]];
  return `<div class="pin">
   <div class="p2">
    <div style="display:grid;gap:16px;align-content:start;min-width:0">
      <div class="h1row"><span class="c">1</span><h3>민사 재판에서는 누가 도와줄까?</h3></div>
      <div class="body">
        <p><span class="rl">민사 재판의 의미</span>${txt("c")}</p>${moreHTML("c")}
        <p><span class="rl">소송 대리인</span>${txt("d")}</p>${moreHTML("d")}
      </div>
    </div>
    <div style="display:grid;gap:14px;align-content:start;min-width:0">
      <div class="goal"><div class="gh">학습 목표</div><p>${txt("goal")}</p></div>
      <div class="law"><b>민사소송법 제87조</b>${txt("law")}${moreHTML("law")}</div>
      <figure class="court" style="margin:0"><img src="${IMG.court}" alt="민사 법정 그림">
        <p class="cap"><span class="k">민사 법정</span> ${txt("cap")}</p>
        <p class="ast"><span class="k">✱ 소장</span> ${txt("w1")}</p>
        <p class="ast"><span class="k">✱ 답변서</span> ${txt("w2")}</p></figure>
    </div>
   </div>
   <div class="glance">
    <div class="gh2"><span class="pp">한눈에 보기</span><h4>민사 재판은 어떻게 진행될까?</h4></div>
    <div class="cards">${steps.map(([h,k],i)=>`<div class="card${i===4?" y":""}"><div class="hd">${h}</div><img src="${IMG["step"+(i+1)]}" alt="${h} 장면"><div class="tx">${txt(k)}</div></div>`).join("")}</div>
    <p class="summ">${txt("sum")}</p>
   </div>
   <div class="pfoot r"><span>03 재판의 의미와 공정한 재판</span><b>211</b></div></div>`;
}


function openTerm(t){
  const d = T[t], s = STU[st.stu];
  $("sheetIn").innerHTML = `<div class="t"><span>${esc(t)}</span><button type="button" class="x" id="sheetX" aria-label="닫기">✕</button></div>
   <dl><dt>쉬운 뜻</dt><dd>${esc(d.easy)}</dd><dt>${s.ln}</dt><dd style="font-family:'Noto Sans',var(--font)">${esc(glossOf(t, s.lang)||"준비 중")}</dd></dl>
   <div class="row"><button type="button" class="cvb p" id="act-save">모르는 단어로 저장</button><button type="button" class="cvb s" id="act-known">${st.known.has(t)?"아는 단어 취소":"아는 단어"}</button><button type="button" class="cvb s" id="sheetClose">닫기</button></div>`;
  $("sheet").hidden = false;
  $("sheetX").onclick = $("sheetClose").onclick = closeSheet;
  $("act-save").onclick = () => { st.known.delete(t); saveWord(t, d, "용어 누르기"); };
  $("act-known").onclick = () => { if (st.known.has(t)) st.known.delete(t); else { st.known.add(t); st.saved.delete(t); } closeSheet(); render(); toast(st.known.has(t)?"아는 단어로 표시했어요. 병기를 숨겨요":"아는 단어 표시를 취소했어요"); };
}

function openFind(sel){
  const s = STU[st.stu]; const r = lookup(sel); const w = r ? r.key : sel.trim();
  $("sheetIn").innerHTML = `<div class="t"><span>${esc(w)}</span><button type="button" class="x" id="sheetX" aria-label="닫기">✕</button></div>
   ${r?`<dl><dt>쉬운 뜻</dt><dd>${esc(r.d.easy)}</dd><dt>${s.ln}</dt><dd style="font-family:'Noto Sans',var(--font)">${esc((r.term?glossOf(r.key,s.lang):r.d[s.lang])||"준비 중")}</dd></dl>
        <span class="src2">${r.term?"이 자료의 교과 용어예요":"선택한 말: "+esc(sel.trim())}</span>`
      :`<p class="note" style="color:var(--fg)">아직 사전에 없는 말이에요. 저장해 두면 선생님 리포트에 모르는 단어로 표시돼요.</p>
        <span class="src2">실제 서비스에서는 사전과 AI로 뜻을 찾아 줘요.</span>`}
   <div class="row"><button type="button" class="cvb p" id="act-save">${st.saved.has(w)?"이미 저장한 단어예요":"모르는 단어로 저장"}</button><button type="button" class="cvb s" id="sheetClose">닫기</button></div>`;
  $("sheet").hidden = false;
  $("sheetX").onclick = $("sheetClose").onclick = closeSheet;
  $("act-save").onclick = () => saveWord(w, r ? r.d : null, "직접 찾기");
}

function closeSheet(){ $("sheet").hidden = true; }

let tt; function toast(m){ const el=$("cvtoast"); el.textContent=m; el.hidden=false; clearTimeout(tt); tt=setTimeout(()=>el.hidden=true,1800); }


function openSwapEdit(rid){
  const [g, key, o] = rid.split("|");
  const sw = P[key].sw.find(x=>x[0]===o && x[2].includes(BAND(g))) || P[key].sw.find(x=>x[0]===o); const rev = st.reverted.has(rid); const cur = st.edits[rid] || sw[1];
  $("sheetIn").innerHTML = `<div class="t"><span>${isNote(o,sw[1])?"추가 설명 수정":"밑줄(쉬운 표현) 수정"}</span><button type="button" class="x" id="sheetX" aria-label="닫기">✕</button></div>
   <dl><dt>원문</dt><dd>${esc(o)}</dd><dt>${isNote(o,sw[1])?"추가 설명":"바꾼 표현"}</dt><dd>${rev?"(원문으로 되돌림)":esc(isNote(o,sw[1])?noteText(o,cur):cur)}</dd><dt>대상</dt><dd>${STU[g].name} · ${STU[g].lv}</dd><dt>위계</dt><dd>${SW_TIER[o]||"미분류"} ${TIER_NAME[SW_TIER[o]]||""}</dd><dt>처리</dt><dd>${isNote(o,sw[1])?"원문 유지 + 추가 설명":"쉬운 표현으로 교체"}</dd></dl>
   <label class="note" for="editIn">직접 고치기</label><input class="editin" id="editIn" value="${esc(cur)}">
   <div class="row"><button type="button" class="cvb p" id="edSave">고친 표현 저장</button>${rev?`<button type="button" class="cvb s" id="edRestore">바꾼 표현 다시 쓰기</button>`:`<button type="button" class="cvb s" id="edRevert">원문으로 되돌리기</button>`}</div>`;
  $("sheet").hidden = false; $("sheetX").onclick = closeSheet;
  $("edSave").onclick = () => { const v = $("editIn").value.trim(); if (!v){ toast("고칠 표현을 입력해 주세요"); return; } if (v===sw[1]) delete st.edits[rid]; else st.edits[rid] = v; st.reverted.delete(rid); st.approved.delete(g); closeSheet(); render(); toast("고친 표현을 저장했어요"); };
  const rv = $("edRevert"); if (rv) rv.onclick = () => { st.reverted.add(rid); st.approved.delete(g); closeSheet(); render(); toast("원문으로 되돌렸어요"); };
  const rs = $("edRestore"); if (rs) rs.onclick = () => { st.reverted.delete(rid); closeSheet(); render(); };
}

function placeAt(el, rc){
  const w = el.offsetWidth || 220;
  el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rc.left + rc.width/2 - w/2)) + "px";
  const below = rc.bottom + 10, above = rc.top - 48;
  el.style.top = (below + 44 < window.innerHeight - 30 ? below : Math.max(8, above)) + "px";
}

function checkSel(){
  const fb = $("findBtn"), ab = $("annBar"); const sel = window.getSelection();
  if (st.drawing){ fb.hidden = true; ab.hidden = true; return; }
  if (!sel || sel.isCollapsed || !sel.rangeCount){ fb.hidden = true; ab.hidden = true; return; }
  if (st.view === "make"){
    fb.hidden = true;
    const t = sel.toString().replace(/\s+/g," ").trim();
    const el = n => n && (n.nodeType===1 ? n : n.parentElement);
    const b1 = el(sel.anchorNode) && el(sel.anchorNode).closest("[data-blk]"), b2 = el(sel.focusNode) && el(sel.focusNode).closest("[data-blk]");
    if (!t || t.length > 40 || !b1 || b1 !== b2 || !b1.closest(".page")){ ab.hidden = true; return; }
    selText = t; selKey = b1.dataset.blk; ab.hidden = false; placeAt(ab, sel.getRangeAt(0).getBoundingClientRect()); return;
  }
  ab.hidden = true;
  if (st.view !== "student"){ fb.hidden = true; return; }
  const t = sel.toString().trim();
  const node = sel.anchorNode && (sel.anchorNode.nodeType===1 ? sel.anchorNode : sel.anchorNode.parentElement);
  if (!t || t.length > 20 || /\n/.test(t) || !node || !node.closest(".page") || node.closest("input,textarea")){ fb.hidden = true; return; }
  const rc = sel.getRangeAt(0).getBoundingClientRect();
  selText = t; fb.hidden = false;
  const w = fb.offsetWidth || 110;
  fb.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rc.left + rc.width/2 - w/2)) + "px";
  const below = rc.bottom + 10, above = rc.top - 44;
  fb.style.top = (below + 40 < window.innerHeight - 90 ? below : Math.max(8, above)) + "px";
}

  /* 팀 공식 대역표 값을 병기에 우선 적용 */
  for (const [t, row] of Object.entries(OFFICIAL)) for (const lg of Object.keys(row)) if (T[t] && row[lg]) T[t][lg] = row[lg];
  /* 베트남어·영어·벵골어 병기 (시연용, 원어민 검증 전) */
  const EXTRA = {
    "민사 재판":["phiên tòa dân sự","civil trial","দেওয়ানি বিচার"], "원고":["nguyên đơn","plaintiff","বাদী"], "피고":["bị đơn","defendant","বিবাদী"],
    "판사":["thẩm phán","judge","বিচারক"], "판결":["bản án","judgment","রায়"], "소송 대리인":["người đại diện tố tụng","litigation representative","মামলার প্রতিনিধি"],
    "변호사":["luật sư","lawyer","আইনজীবী"], "소장":["đơn khởi kiện","complaint","আর্জি"], "답변서":["bản tự khai","written answer","জবাব"],
    "증거":["chứng cứ","evidence","প্রমাণ"], "변론":["tranh luận tại tòa","oral argument","শুনানি"], "권리":["quyền","rights","অধিকার"]
  };
  for (const [t, [vi, en, bn]] of Object.entries(EXTRA)) if (T[t]) { if (!T[t].vi) T[t].vi = vi; T[t].en = en; T[t].bn = bn; }
  for (const [t, row] of Object.entries(OFFICIAL)) if (T[t] && row.vi) T[t].vi = row.vi;
  function glossOf(t, lg){ return T[t] ? (T[t][lg] || "") : ""; }

  const st = { view: opts.mode === "teacher" ? "make" : "student", stu: "cur", mkG: "cur", mark: true, gloss: true, raw: !!opts.showOriginal,
    scale: opts.scale || 1, open: new Set(), saved: new Map(), known: new Set(opts.known || []), qa: {},
    moreEdits: {}, visEdits: {}, ann: {}, annSeq: 0, reverted: new Set(), edits: {}, approved: new Set(), drawing: false };
  try {
    const saved = JSON.parse(localStorage.getItem(opts.storageKey) || "null");
    if (saved) { st.edits = saved.edits || {}; st.reverted = new Set(saved.reverted || []); st.ann = saved.ann || {}; st.annSeq = saved.annSeq || 0; st.moreEdits = saved.moreEdits || {}; st.visEdits = saved.visEdits || {}; }
  } catch (err) {}
  let lastSaved = "";
  function persist(){
    if (opts.mode !== "teacher") return;
    const data = JSON.stringify({ edits: st.edits, reverted: [...st.reverted], ann: st.ann, annSeq: st.annSeq, moreEdits: st.moreEdits, visEdits: st.visEdits });
    if (data === lastSaved) return;
    const first = lastSaved === ""; lastSaved = data;
    try { localStorage.setItem(opts.storageKey, data); } catch (err) {}
    if (!first && opts.onChange) opts.onChange();
  }
  function saveWord(w, d, how){
    st.saved.set(w, {easy: d ? d.easy : "", how}); st.known.delete(w);
    if (opts.onWord) opts.onWord(w, "unknown");
    closeSheet(); render(); toast("모르는 단어로 저장했어요");
  }

  let dead = false;
  root.classList.add("cv-root");
  root.innerHTML = `<div class="cv-pages"><article class="page" id="page1" aria-label="210쪽"></article><article class="page" id="page2" aria-label="211쪽"></article></div>
    <div class="sheet" id="sheet" hidden><div class="in" id="sheetIn" role="dialog" aria-modal="false"></div></div>
    <div class="cvtoast" id="cvtoast" hidden></div>
    <div class="annbar" id="annBar" hidden><button type="button" data-addfx="swap">밑줄 추가</button><button type="button" data-addfx="note">설명 추가</button><button type="button" data-addfx="vis">시각 자료 추가</button></div>
    <button type="button" class="findbtn" id="findBtn" hidden><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>단어 찾기</button>`;

  function render(){
    root.style.setProperty("--scale", st.scale);
    $("page1").innerHTML = page1(); $("page2").innerHTML = page2();
    root.querySelectorAll(".page").forEach(p => p.classList.toggle("noshow", !st.mark));
    persist();
  }
root.addEventListener("click", e => { if (dead) return;
  const edb = e.target.closest("[data-edrid],[data-edcx],[data-edmore],[data-edvis]");
  if (edb){ e.stopPropagation();
    if (edb.dataset.edrid) openSwapEdit(edb.dataset.edrid);
    else if (edb.dataset.edcx) openAnnSheet({id:edb.dataset.edcx});
    else if (edb.dataset.edmore) openMoreEdit(edb.dataset.edmore);
    else openVisEdit(edb.dataset.edvis);
    return; }
  const cxe = e.target.closest("[data-cx]");
  if (cxe){
    const id = cxe.dataset.cx;
    const tg = k => { st.open.has(k)?st.open.delete(k):st.open.add(k); render(); };
    if (e.target.closest("[data-cxn]")){ tg("cxn-"+id); return; }
    if (e.target.closest("[data-cxv]")){ tg("cxv-"+id); return; }
    if (e.target.closest("[data-cxo]")){ tg("cxo-"+id); return; }
  }
  const tm = e.target.closest("[data-term]"); if (tm){ openTerm(tm.dataset.term); return; }
  const nt = e.target.closest("[data-nt]"); if (nt){ const id = nt.dataset.nt; st.open.has(id)?st.open.delete(id):st.open.add(id); nt.classList.toggle("open"); return; }
  const sw = e.target.closest("[data-sw]");
  if (sw && (st.mark || st.view==="make")){ const id = sw.dataset.sw; st.open.has(id)?st.open.delete(id):st.open.add(id); sw.classList.toggle("open"); return; }
  const tg = e.target.closest("[data-tg]"); if (tg){ const id = tg.dataset.tg; st.open.has(id)?st.open.delete(id):st.open.add(id); render(); return; }
  const pk = e.target.closest("[data-pick]"); if (pk){
    const q = pk.dataset.pick, r = pk.dataset.role || ""; st.qa[q+r] = pk.dataset.v;
    if (q==="q1"){ st.qa.a1 = pk.dataset.v; }
    if (q==="q2"){ if (r==="원고") st.qa.a2a = pk.dataset.v; else st.qa.a2b = pk.dataset.v; }
    render();
    const fb = $("fb-"+q);
    if (q==="q1"){ const ok = pk.dataset.v===ANS.q1; fb.className="fb "+(ok?"ok":"no"); fb.textContent = ok?"맞았어요.":"다시 생각해 보세요. 211쪽 첫 문장을 읽어 보세요."; }
    if (q==="q2" && st.qa["q2원고"] && st.qa["q2피고"]){ const ok = st.qa["q2원고"]==="영감" && st.qa["q2피고"]==="농부"; fb.className="fb "+(ok?"ok":"no"); fb.textContent = ok?"맞았어요. 먼저 소송을 건 사람이 원고예요.":"다시 생각해 보세요. 누가 먼저 소송을 걸었나요?"; }
    return; }
});

  root.addEventListener("click", e => { if (dead) return;
    const sy = e.target.closest("[data-say]"); if (sy){ try{ const u = new SpeechSynthesisUtterance(sy.dataset.say); u.lang = "ko-KR"; speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(err){ toast("읽어 주기를 시작하지 못했어요"); } }
  });
  root.addEventListener("input", e => { if (dead) return; if (e.target.id && /^a\d/.test(e.target.id)) st.qa[e.target.id] = e.target.value; });
  const onKey = e => { if (e.key === "Escape") closeSheet(); if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".cv-root .swap")){ e.preventDefault(); e.target.click(); } };
  document.addEventListener("keydown", onKey);
  let selText = "", selKey = "", selTimer;
  const onSel = () => { clearTimeout(selTimer); selTimer = setTimeout(checkSel, 250); };
  document.addEventListener("selectionchange", onSel);
  const onScroll = () => { if (!$("findBtn").hidden || !$("annBar").hidden) checkSel(); };
  window.addEventListener("scroll", onScroll, { passive: true });
  $("annBar").addEventListener("mousedown", e => e.preventDefault());
  $("annBar").addEventListener("click", e => {
    const bt = e.target.closest("[data-addfx]"); if (!bt) return;
    $("annBar").hidden = true; const t = selText, key = selKey;
    try{ window.getSelection().removeAllRanges(); }catch(err){}
    const src = blkSource(key, st.mkG);
    const exist = (st.ann[st.mkG]||[]).find(a=>a.key===key && a.phrase===t);
    if (exist){ openAnnSheet({id:exist.id}); return; }
    if (src.indexOf(t) < 0 && !(T[t] && src.includes("[["+t+"]]"))){ toast("이미 바뀐 표현이 섞여 있어요. 원문 그대로인 부분만 골라 주세요"); return; }
    openAnnSheet({key, phrase:t, preset:bt.dataset.addfx});
  });
  $("findBtn").addEventListener("mousedown", e => e.preventDefault());
  $("findBtn").onclick = () => { $("findBtn").hidden = true; const t = selText; try{ window.getSelection().removeAllRanges(); }catch(err){} openFind(t); };
  render();
  return {
    update(next){
      if (next.scale != null) st.scale = next.scale;
      if (next.showOriginal != null) st.raw = next.showOriginal;
      if (next.known) st.known = new Set(next.known);
      render();
    },
    destroy(){
      dead = true;
      document.removeEventListener("keydown", onKey); document.removeEventListener("selectionchange", onSel); window.removeEventListener("scroll", onScroll);
      root.innerHTML = ""; root.classList.remove("cv-root");
    },
  };
}
