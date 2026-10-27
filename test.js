// 逻辑验证：mock 最小 DOM，执行 index.html 里的脚本，检查核心转换结果
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script found'); process.exit(1); }
const code = m[1];

function elStub() {
  const el = {
    value: '', textContent: '', innerHTML: '', title: '', className: '',
    style: {}, dataset: {}, children: [],
    addEventListener() {}, select() {}, setSelectionRange() {}, focus() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    querySelectorAll() { return []; }
  };
  return el;
}
global.window = {};
global.document = {
  getElementById() { return elStub(); },
  querySelectorAll() { return []; },
  createElement() { return elStub(); },
  body: { appendChild() {}, removeChild() {} }
};
global.navigator = { clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') } };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

eval(code);

const L = global.window.__l2k;
if (!L) { console.error('export missing'); process.exit(1); }

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '\n       ' + extra : '')); }
}

/* ---------- 1. 前缀解析 ---------- */
console.log('\n[1] 日志前缀解析');
const cases = [
  ['2026-10-26 17:08:10.123 12345-12401/com.example.app D/OkHttp: {"a":1}', 'OkHttp'],
  ['10-26 17:08:10.123  1234-5678/com.example.app D/OkHttp: {"a":1}', 'OkHttp'],
  ['10-26 17:08:10.123 1234 5678 D/OkHttp: {"a":1}', 'OkHttp'],
  ['D/OkHttp: {"a":1}', 'OkHttp'],
  ['D/OkHttp( 1234): {"a":1}', 'OkHttp'],
  ['2026-10-26 17:08:10.123  1234-1234  OkHttp  com.example.app  D  {"a":1}', 'OkHttp']
];
cases.forEach(([line, expectTag]) => {
  const r = L.parseLog(line);
  check('tag=' + expectTag, r.entries[0] && r.entries[0].tag === expectTag,
    'got ' + JSON.stringify(r.entries[0]));
});

/* ---------- 2. 截断拼接 ---------- */
console.log('\n[2] 截断日志拼接');
const truncated = [
  '10-26 17:08:10.123  1234-5678/com.example.app D/OkHttp: {"code":0,"data":{"list":[{"id":1,"title":"Hello","content":"Lorem ipsum dolor sit amet',
  '10-26 17:08:10.124  1234-5678/com.example.app D/OkHttp: , consectetur adipiscing elit","author":{"uid":9}}],"total":1}}'
].join('\n');
const r2 = L.parseLog(truncated);
check('两条合并成一条', r2.entries.length === 1, 'got ' + r2.entries.length);
check('记录拼接次数', r2.stats.merged >= 1, 'merged=' + r2.stats.merged);
const n2 = L.extractNodes(r2.entries[0].content);
check('解析出 1 个 JSON', n2.length === 1, 'got ' + n2.length);
function findField(node, name) {
  if (!node || !node.entries) return null;
  const hit = node.entries.find(e => e.key === name);
  return hit ? hit.value : null;
}
const item0 = n2[0] && findField(findField(n2[0], 'data'), 'list').items[0];
const contentVal = item0 && findField(item0, 'content');
check('拼接处文本完整', contentVal && contentVal.value ===
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
  JSON.stringify(contentVal));

/* ---------- 3. 无前缀续行 ---------- */
console.log('\n[3] 无前缀续行（AS 复制折叠行）');
const noPrefix = 'D/OkHttp: {"a":{"b":"x\ny","c":2}}\n  continuation-tail';
const r3 = L.parseLog('D/OkHttp: {"a":1,\n  "b":2}');
check('无前缀行拼接到上一条', r3.entries.length === 1, 'got ' + r3.entries.length);
const n3 = L.extractNodes(r3.entries[0].content);
check('拼接后可解析', n3.length === 1 && n3[0].entries.length === 2, JSON.stringify(n3));

/* ---------- 4. 多 JSON + 干扰行 ---------- */
console.log('\n[4] 干扰行过滤 + 多 JSON');
const mixed = [
  'D/Choreographer: Skipped 32 frames!',
  'D/Api: {"code":200,"msg":"ok"}',
  'E/AndroidRuntime: FATAL EXCEPTION: main',
  'D/Other: {"x":1}'
].join('\n');
const r4 = L.parseLog(mixed);
let count4 = 0;
r4.entries.forEach(e => { count4 += L.extractNodes(e.content).length; });
check('提取 2 个 JSON，忽略非 JSON 行', count4 === 2, 'got ' + count4);

/* ---------- 5. 宽容解析 ---------- */
console.log('\n[5] 宽容解析');
const looseCases = [
  ['尾逗号', '{"a":1,"b":[1,2,],}'],
  ['单引号', "{'a':1,'b':'x'}"],
  ['无引号 key', '{a:1,b:2}'],
  ['Kotlin toString', 'Data(code=0, list=[Item(id=1, name=hello), Item(id=2, name=world)])'],
  ['未闭合截断', '{"a":1,"b":"xx'],
  ['null / 布尔', '{"a":null,"b":true}']
];
looseCases.forEach(([name, src]) => {
  let ok = false, detail = '';
  try {
    const nd = L.parseLoose(src);
    ok = nd && nd.type === 'object' && nd.entries.length > 0;
    detail = JSON.stringify(nd).slice(0, 160);
  } catch (e) { detail = 'throw: ' + e.message; }
  check(name, ok, detail);
});

const noComma = L.parseLoose('{ id: 1\n nickname: "x"\n status: OK }');
check('无逗号分隔不吞首字符',
  noComma.entries.length === 3 && noComma.entries[1].key === 'nickname',
  JSON.stringify(noComma.entries.map(e => e.key)));

/* ---------- 6. 数字精度 ---------- */
console.log('\n[6] 数字精度（long id 不能丢位）');
const bigId = '{"order_id":9007199254740993123,"amount":12.50}';
const nBig = L.parseLoose(bigId);
const outBig = L.stringifyNode(nBig, '  ', 0);
check('19 位 id 原文保留', outBig.indexOf('9007199254740993123') >= 0, outBig);

/* ---------- 7. Kotlin 生成 ---------- */
console.log('\n[7] Kotlin 生成');
function gen(src, opts) {
  const groups = [{ tag: 'T', nodes: [L.parseLoose(src)], index: 0 }];
  return L.genKotlin(groups, Object.assign({
    rootName: 'Response', anno: 'gson', nullMode: 'all', caseMode: 'camel', tsLong: true
  }, opts || {}));
}
const kt1 = gen('{"code":0,"message":"ok","data":{"user_id":123,"nickname":"a","vip":true,"balance":1.5,"tags":["x"],"profile":{"level":3}}}');
console.log(kt1.split('\n').map(l => '       ' + l).join('\n'));
check('生成 data class', kt1.indexOf('data class Response(') >= 0);
check('snake_case → camelCase', kt1.indexOf('val userId: Int?') >= 0);
check('嵌套对象独立成类', /data class Profile\(/.test(kt1));
check('String 类型', kt1.indexOf('val nickname: String?') >= 0);
check('Boolean 类型', kt1.indexOf('val vip: Boolean?') >= 0);
check('Double 类型', kt1.indexOf('val balance: Double?') >= 0);
check('List 类型', kt1.indexOf('val tags: List<String>?') >= 0);
check('Gson 注解只在改名时出现', kt1.indexOf('@SerializedName("user_id")') >= 0);

const kt2 = gen('{"create_time":1729934890123,"id":123,"title":"x"}');
check('时间戳字段升 Long', kt2.indexOf('val createTime: Long?') >= 0, kt2);
check('普通 int 保持 Int', kt2.indexOf('val id: Int?') >= 0, kt2);

const kt3 = gen('{"a":1}', { nullMode: 'none' });
check('非空模式', kt3.indexOf('val a: Int\n') >= 0 || kt3.indexOf('val a: Int)') >= 0, kt3);

const kt4 = gen('{"in":1,"object":2}');
check('Kotlin 关键字转义', kt4.indexOf('val `in`') >= 0 && kt4.indexOf('val `object`') >= 0, kt4);

const kt5 = gen('{"items":[{"id":1},{"id":2,"name":"b"}]}');
check('数组元素合并 + 可选字段', /data class Item\(/.test(kt5) && /val name: String\?/.test(kt5), kt5);

const kt6 = gen('{"a":1,"b":2}', { anno: 'kotlinx' });
check('kotlinx @Serializable', kt6.indexOf('@Serializable') >= 0, kt6);

/* ---------- 8. 根是数组 ---------- */
console.log('\n[8] 根节点是数组');
const kt7 = L.genKotlin([{ tag: 'T', nodes: [L.parseLoose('[{"id":1,"name":"a"}]')], index: 0 }],
  { rootName: 'Response', anno: 'none', nullMode: 'all', caseMode: 'camel', tsLong: true });
console.log(kt7.split('\n').map(l => '       ' + l).join('\n'));
check('根数组生成元素类 + 用法注释', /data class Response\(/.test(kt7) && /List<Response>/.test(kt7), kt7);
check('根数组不产生自引用 typealias', !/typealias Response = List<Response>/.test(kt7), kt7);

/* ---------- 9. 命名 ---------- */
console.log('\n[9] 命名转换');
check('user_id → userId', L.camel('user_id') === 'userId', L.camel('user_id'));
check('user_name → userName', L.camel('user_name') === 'userName');
check('URL → uRL(可接受)', L.camel('URL') === 'uRL', L.camel('URL'));
check('items 单数化 → Item', L.pascal(L.singular('items')) === 'Item');
check('categories → Category', L.pascal(L.singular('categories')) === 'Category', L.singular('categories'));
check('address 不误删 s', L.singular('address') === 'address', L.singular('address'));

/* ---------- 10. protobuf TextFormat ---------- */
console.log('\n[10] protobuf TextFormat');
const pbText = [
  'id: 1001',
  'name: "Hello"',
  'tags: "tech"',
  'tags: "life"',
  'author {',
  '  uid: 90001',
  '  name: "bob"',
  '}',
  'items {',
  '  sku: "A-1"',
  '  price: 9.9',
  '}',
  'items {',
  '  sku: "B-2"',
  '  price: 19.5',
  '}',
  'status: STATUS_OK',
  'active: true'
].join('\n');

const pb = L.parseProtoText(pbText);
const get = (node, key) => findField(node, key);

check('解析为对象（7 个字段）', pb.type === 'object' && pb.entries.length === 7, 'entries=' + pb.entries.length);
check('repeated 标量合并成数组', get(pb, 'tags').type === 'array' && get(pb, 'tags').items.length === 2);
check('嵌套 message', get(pb, 'author').type === 'object' && get(pb, 'author').entries.length === 2);
check('repeated message 合并成数组', get(pb, 'items').type === 'array' && get(pb, 'items').items.length === 2);
check('enum 值识别（不带引号）', get(pb, 'status').value === 'STATUS_OK' && get(pb, 'status').isEnum === true);
check('布尔值', get(pb, 'active').value === true);

check('识别为 TextFormat', L.looksLikeProtoText(pbText) === true);
check('JSON 不误判为 TextFormat', L.looksLikeProtoText('{\n  "a": 1\n}') === false);
check('普通多行日志不误判', L.looksLikeProtoText('Skipped 32 frames\non main thread') === false);
check('两行 key=value 不误判', L.looksLikeProtoText('url=https://a.com\ncode=200') === false);

const viaExtract = L.extractNodes(pbText);
check('extractNodes 走 proto-text 分支', viaExtract.length === 1 && viaExtract[0].kind === 'proto-text');

const ktPb = L.genKotlin([{ tag: 'Pb', nodes: [pb], index: 0 }],
  { rootName: 'Proto', anno: 'gson', nullMode: 'all', caseMode: 'camel', tsLong: true });
check('protobuf 生成 data class', /data class Proto\(/.test(ktPb), ktPb);
check('嵌套类独立生成', /data class Author\(/.test(ktPb) && /data class Item\(/.test(ktPb), ktPb);
check('repeated message → List', /val items: List<Item>\?/.test(ktPb), ktPb);

/* ---------- 11. protobuf wire format ---------- */
console.log('\n[11] protobuf wire format（无 .proto 解码）');
// field1 varint 1001 | field2 string "hi" | field3 nested { field1: 1 }
const hexMsg = '08 E9 07 12 02 68 69 1A 02 08 01';
check('识别为 hex dump', L.looksLikeHexDump(hexMsg) === true);
const dec = L.decodeHexDump(hexMsg);
check('解码出 3 个字段', dec && dec.entries.length === 3, JSON.stringify(dec));
check('varint 字段', dec && dec.entries[0].key === 'field_1' && dec.entries[0].value.raw === '1001');
check('string 字段', dec && dec.entries[1].value.value === 'hi');
check('嵌套 message', dec && dec.entries[2].value.type === 'object');
check('非法 wire type 返回 null', L.decodeHexDump('FF FF FF FF') === null);
check('短数字串不当 hex', L.looksLikeHexDump('1234') === false);
check('无分隔短串不当 hex', L.looksLikeHexDump('abcdef') === false);

/* ---------- 12. 扁平 TextFormat（每行一个字段） ---------- */
console.log('\n[12] 扁平 TextFormat 聚合');
const flatLog = [
  '10-26 17:20:01.001  1234-5678/com.example.app D/Proto: id: 1001',
  '10-26 17:20:01.002  1234-5678/com.example.app D/Proto: name: "bob"',
  '10-26 17:20:01.003  1234-5678/com.example.app D/Proto: level: 12',
  '10-26 17:20:01.004  1234-5678/com.example.app D/Proto: vip: true'
].join('\n');
const flatParsed = L.parseLog(flatLog);
check('每行是独立条目', flatParsed.entries.length === 4, 'got ' + flatParsed.entries.length);
check('单行提取不到结构', L.extractNodes(flatParsed.entries[0].content).length === 0);
const flatMerged = L.mergeFlatProto(flatParsed.entries.map(e => e.content));
check('按 tag 聚合后可解析', flatMerged && flatMerged.entries.length === 4, JSON.stringify(flatMerged));
check('聚合后 kind 标记', flatMerged && flatMerged.kind === 'proto-text');
check('非 proto 行不聚合', L.mergeFlatProto(['hello world', 'foo bar']) === null);

/* ---------- 13. 多策略互不干扰 ---------- */
console.log('\n[13] 格式自动识别');
check('JSON 仍走 JSON', L.extractNodes('{"a":1}')[0].kind === 'json');
check('Kotlin toString 仍走 toString', L.extractNodes('Data(a=1, b=2)')[0].kind === 'toString');
check('普通日志不产出结构', L.extractNodes('Skipped 32 frames!').length === 0);

/* ---------- 14. 日志中间丢段 ---------- */
console.log('\n[14] 日志中间丢段（logcat 缓冲溢出）');

// 「时间 + 级别」无 tag 的续行格式
const tl = L.parseLog('17:45:15.895  D  hello world');
check('时间+级别前缀可剥离', tl.entries[0].content === 'hello world', JSON.stringify(tl.entries[0].content));

// 丢段判定
check('残缺 key 判为丢段', L.isLostSegment('"a":1,', 'pe":"GLOBAL"') === true);
check('完整 key 不算丢段', L.isLostSegment('"a":1,', '"b":2') === false);
check('布尔值不算丢段', L.isLostSegment('"a":1,', 'true}') === false);
check('数字不算丢段', L.isLostSegment('"a":1,', '2}') === false);

// 对齐锚点：残片引号奇偶反了，只能靠 ], 找数组结束
const frag = 'pe":"GLOBAL","rankType":"honor","countryId":0},{"topN":3}],"lang":"en"}';
check('对齐到数组结束后', frag.slice(L.findRealign(frag, 0)) === ',"lang":"en"}',
  JSON.stringify(frag.slice(L.findRealign(frag, 0))));

// 端到端
const lostLog = 'D/Api: {"code":0,"res":{"activity":{"a":1,"b":2,"accountDisabled":false,\n' +
  '17:45:15.895  D  pe":"GLOBAL","rankType":"honor","countryId":0}],"lang":"en","id":5707}}';
const lp = L.parseLog(lostLog);
check('丢段被记录', lp.stats.lost === 1, 'lost=' + lp.stats.lost);
check('不残留标记', lp.entries[0].content.indexOf('\u0000') < 0);
const ln = L.extractNodes(lp.entries[0].content)[0];
const lact = ln.entries.find(e => e.key === 'res').value.entries.find(e => e.key === 'activity').value;
const lkeys = lact.entries.map(e => e.key);
check('保留断点前字段', lkeys.indexOf('accountDisabled') >= 0, lkeys.join(','));
check('无垃圾字段（数字/LOST 残留）',
  !lkeys.some(k => /^[0-9]/.test(k) || k.indexOf('LOST') >= 0), lkeys.join(','));
check('断点后字段恢复', lkeys.indexOf('lang') >= 0, lkeys.join(','));

// 包装标记
check('@long-text 包装被剥离',
  L.stripWrapper('@long-text:"[response]..." <long_text_quote>{"a":1}</long_text_quote>').trim() === '{"a":1}');
check('普通内容不受影响', L.stripWrapper('{"a":1}') === '{"a":1}');

console.log('\n===== ' + pass + ' passed, ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
