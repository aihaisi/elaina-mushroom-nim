/**
 * verify-ai.mjs —— 顺序取蘑菇（Sequential Nim）AI 最优性穷举验证
 *
 * 用法：  node verify-ai.mjs
 *
 * 设计原则：直接从 index.html 里抽出 MUSHROOM-SOLVER 代码块执行，
 * 验证的就是真正跑在页面上的那份代码，而不是另抄一份副本。
 *
 * 验证内容：
 *  A. 闭式解 vs 博弈树暴力 DP —— 对 n ≤ 5、a_i ∈ [1,4] 的全部 1364 个盘面，
 *     以及每个盘面下所有可达状态 (当前盘, 剩余数量)，逐个比对胜负判断。
 *  B. 走法正确性 —— 每个"必胜态"给出的走法，落到对手手上必须是必败态。
 *  C. 必败态唯一性 —— 必败态必须 m == 1（即走法唯一），不存在"必败时还能挣扎"的自由度。
 *  D. 经典闭式规律交叉核对 —— 验证"前导 1 的个数"判据与本法等价。
 *  E. 大规模自对弈 —— n=50、a_i 达 1e6 的随机盘面上双方均走最优解，
 *     终局胜者必须等于开局裁决。
 *  F. 认输门控流程 —— 用 DOM 桩驱动真实页面脚本，验证「仅开局第一步之前可认输、
 *     判对判胜、判错判负、按钮文案不泄露裁决、走过一步后资格作废」。
 *  G. 官方样例对拍 —— 与洛谷 U145698 题面给出的期望输出逐个比对（外部权威校验）。
 *  H. 发布副本一致性 —— site/index.html（线上发布源）必须与根 index.html 逐字节相同。
 *  I. 出盘分布与「1 蘑菇转机」—— ① 把求解器等价改写成可读规则（看紧随其后的连续
 *     1 蘑菇盘长度的奇偶）并交叉验证；② 断言 a_i = 1 的出现率 = 35%，
 *     其余五档等概率吸收至各 13%（穷举 rand 网格求精确概率，不用统计抽样，
 *     避免随机失败的假警报）。
 */

import { readFileSync, existsSync } from 'node:fs';

const htmlPath = new URL('./index.html', import.meta.url);
const siteIndexPath = new URL('./site/index.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');

const blockRe = /\/\* ==== MUSHROOM-SOLVER BEGIN ==== \*\/([\s\S]*?)\/\* ==== MUSHROOM-SOLVER END ==== \*\//;
const match = html.match(blockRe);
if (!match) {
  console.error('✗ 未能在 index.html 中找到 MUSHROOM-SOLVER 代码块');
  process.exit(1);
}

const { computeLosingFlags, analyzePosition } = new Function(
  `${match[1]}\nreturn { computeLosingFlags, analyzePosition };`
)();

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 20) console.error('  ✗ ' + msg);
};

/* ── 暴力博弈树 DP：权威参照 ───────────────────────────────── */
function bruteWin(a) {
  const n = a.length;
  const memo = new Map();

  // 轮到某人操作「第 i 个盘子、其中还剩 m 个」时，他是否必胜
  function win(i, m) {
    if (i >= n) return false;                       // 无子可取 → 判负
    const key = i * 1e7 + m;
    if (memo.has(key)) return memo.get(key);

    let res = false;
    for (let take = 1; take <= m && !res; take++) {
      const next = take === m
        ? win(i + 1, i + 1 < n ? a[i + 1] : 0)
        : win(i, m - take);
      if (!next) res = true;
    }
    memo.set(key, res);
    return res;
  }
  return win;
}

/* ── 对照用的经典"前导 1 个数"判据 ─────────────────────────── */
function classicVerdict(a) {
  const n = a.length;
  let k = 0;
  while (k < n && a[k] === 1) k++;
  if (a[0] >= 2) return true;                       // 首盘 > 1，先手必胜
  if (k === n) return n % 2 === 1;                  // 全为 1 → 盘子奇数个先手胜
  return k % 2 === 0;                               // 否则前导 1 为偶数个时先手胜
}

function* allBoards(maxN, maxV) {
  for (let n = 1; n <= maxN; n++) {
    const a = new Array(n).fill(1);
    const total = Math.pow(maxV, n);
    for (let code = 0; code < total; code++) {
      let c = code;
      for (let i = n - 1; i >= 0; i--) { a[i] = (c % maxV) + 1; c = Math.floor(c / maxV); }
      yield a.slice();
    }
  }
}

/* ══ A / B / C / D：小盘面穷举 ═══════════════════════════════ */
let stateCount = 0, boardCount = 0, decisionPoints = 0;

for (const a of allBoards(5, 4)) {
  boardCount++;
  const win = bruteWin(a);
  const lose = computeLosingFlags(a);

  // D：开局裁决与经典判据一致
  const solverFirstPlayerWins = analyzePosition(a).canWin;
  if (solverFirstPlayerWins !== classicVerdict(a)) {
    fail(`开局裁决与经典判据不一致 [${a}] solver=${solverFirstPlayerWins} classic=${classicVerdict(a)}`);
  }
  if (solverFirstPlayerWins !== win(0, a[0])) {
    fail(`开局裁决与暴力解不一致 [${a}]`);
  }
  // lose[j] 语义自检
  for (let j = 0; j < a.length; j++) {
    if (lose[j] !== !win(j, a[j])) fail(`lose[${j}] 与暴力解不一致 [${a}]`);
  }

  // 枚举本盘面所有可达状态
  for (let i = 0; i < a.length; i++) {
    for (let m = 1; m <= a[i]; m++) {
      stateCount++;
      const bf = win(i, m);
      const info = analyzePosition(a, i, m);

      // A：胜负判断
      if (info.canWin !== bf) {
        fail(`胜负判断错误 [${a}] 状态(i=${i},m=${m}) solver=${info.canWin} brute=${bf}`);
        continue;
      }

      // 走法合法性
      if (info.canWin) {
        if (m >= 2) decisionPoints++;
        if (!(info.move >= 1 && info.move <= m)) {
          fail(`走法越界 [${a}] 状态(i=${i},m=${m}) move=${info.move}`);
          continue;
        }
        // B：这一步必须把对手送进必败态
        const oppLoses = info.move === m
          ? (i + 1 >= a.length ? false : win(i + 1, a[i + 1]))
          : win(i, m - info.move);
        if (oppLoses !== false) {
          fail(`走法非最优 [${a}] 状态(i=${i},m=${m}) move=${info.move} 留给对手的是必胜态`);
        }
      } else {
        // C：必败态必须走法唯一
        if (m !== 1) fail(`必败态但 m=${m} > 1（不应存在选择空间）[${a}] i=${i}`);
        if (info.move !== 1) fail(`必败态走法应为唯一合法步 1，实际 ${info.move} [${a}]`);
      }
    }
  }
}

/* ══ E：大规模自对弈端到端 ═══════════════════════════════════ */
function selfPlay(a0) {
  const rem = a0.slice();
  const n = rem.length;
  const verdict = analyzePosition(rem).canWin;      // 先手（Elaina）是否必胜
  let idx = 0, total = rem.reduce((s, x) => s + x, 0);
  let lastMover = null, moves = 0;

  while (total > 0) {
    const i = rem.findIndex((x) => x > 0);
    const info = analyzePosition(rem, i);
    if (info.over || info.move < 1 || info.move > rem[i]) return { error: '非法走法', idx, i };
    rem[i] -= info.move;
    total -= info.move;
    moves++;
    lastMover = idx;
    idx ^= 1;
  }
  return { firstPlayerWins: lastMover === 0, verdict, moves };
}

let bigGames = 0;
for (let t = 0; t < 2000; t++) {
  const n = 1 + Math.floor(Math.random() * 50);
  const a = Array.from({ length: n }, () =>
    Math.random() < 0.35
      ? 1
      : 1 + Math.floor(Math.random() * (Math.random() < 0.3 ? 1e6 : 6))
  );
  const r = selfPlay(a);
  if (r.error) { fail(`自对弈出错 [n=${n}] ${JSON.stringify(r)}`); break; }
  if (r.firstPlayerWins !== r.verdict) {
    fail(`自对弈结果与开局裁决不符 [${a.slice(0, 8)}...] 实际=${r.firstPlayerWins} 裁决=${r.verdict}`);
    break;
  }
  bigGames++;
}

/* ── 边界用例 ─────────────────────────────────────────────── */
const edgeCases = [
  { a: [1], expect: true, note: '单盘 1 个，先手取走即胜' },
  { a: [5], expect: true, note: '单盘多个，一次取空' },
  { a: [1, 5], expect: false, note: '首盘 1 个，被迫让出主动权' },
  { a: [1, 1], expect: false, note: '两盘各 1，先手必败' },
  { a: [1, 1, 1], expect: true, note: '三盘各 1，先手必败' },
  { a: [2, 1, 1], expect: true, note: '含 2 的首盘，先手可控' },
  { a: [1, 3, 1], expect: false, note: '' },
  { a: [1, 1, 3, 1], expect: true, note: '' },
];
for (const { a, expect, note } of edgeCases) {
  const got = analyzePosition(a).canWin;
  if (got !== expect) fail(`边界用例失败 [${a}] 期望=${expect} 实际=${got} ${note}`);
}

/* ══ F：认输门控流程测试（DOM 桩驱动真实页面脚本）═══════════
 * 认输规则：仅在「开局、尚未走出任何一步」时可用；
 *   判对（这局先手必败）→ 判玩家胜；判错（这局先手必胜）→ 判玩家负。
 * 这层是 UI 门控，穷举求解器测不到，必须把整段 <script> 跑起来才验得了。
 */
function mkEl(tag = 'div') {
  return {
    tagName: tag, children: [], style: {}, dataset: {},
    textContent: '', innerHTML: '', className: '', onclick: null,
    disabled: false, scrollTop: 0, scrollHeight: 0,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
  };
}

const pageSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const els = new Map();
globalThis.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, mkEl()); return els.get(id); },
  createElement(t) { return mkEl(t); },
};
globalThis.setTimeout = () => 0;          // AI 回合不自动触发，由测试手动驱动

new Function(`${pageSrc}
globalThis.__api = {
  initGame, playerMove, playerSurrender, aiTurn, renderBoard,
  setPlates: (a) => { plates = a; },
  btn: () => document.getElementById('btn-surrender'),
  title: () => document.getElementById('result-title').textContent,
  modal: () => document.getElementById('game-over-modal').style.display,
  isOver: () => isGameOver,
  moves: () => moveCount,
};`)();
const api = globalThis.__api;

const flow = [];
function flowOk(cond, label, extra) {
  flow.push({ ok: !!cond, label });
  if (!cond) fail(`认输门控 · ${label}${extra !== undefined ? ' → ' + JSON.stringify(extra) : ''}`);
}
function freshGame(board) {
  api.initGame();                  // 复位 moveCount / currentPlayer / isGameOver
  api.setPlates(board.slice());
  api.renderBoard();
}
const btnShown = () => api.btn().style.display !== 'none';

/* F1 必败开局 —— 可认输，判胜 */
freshGame([1, 1]);                                    // 先手必败
flowOk(btnShown(), '开局第一步之前，认输按钮可见');
api.playerSurrender();
flowOk(api.modal() === 'flex', '认输后弹出结算');
flowOk(api.title() === '看穿了！', '必败开局认输 → 判定玩家获胜', api.title());

/* F2 必胜开局 —— 也可见，但认输判负（按钮不得变成答案播报器） */
freshGame([1]);                                       // 先手必胜
flowOk(btnShown(), '必胜开局按钮同样可见（不靠隐藏按钮泄露裁决）');
api.playerSurrender();
flowOk(api.title() === '看走眼了', '必胜开局认输 → 判定玩家失败', api.title());

/* F3 文案中性：必胜局与必败局按钮文案必须完全一致 */
freshGame([1]);
const textWin = api.btn().textContent;
freshGame([1, 5]);
const textLose = api.btn().textContent;
flowOk(textWin === textLose, '按钮文案在必胜/必败局中一致（不泄露裁决）', [textWin, textLose]);

/* F4 走过一步后资格作废 */
freshGame([1, 1, 1]);
api.playerMove(0, 1);                                 // 玩家走出第一步
flowOk(api.moves() === 1, '步数已计为 1', api.moves());
flowOk(!btnShown(), '走过一步后认输按钮消失');
api.playerSurrender();
flowOk(api.isOver() === false, '走过一步后调用认输无效');
api.aiTurn();                                         // AI 回手，重回玩家回合
flowOk(api.isOver() === false && api.moves() === 2, 'AI 回手后仍在局中，步数=2', api.moves());
flowOk(!btnShown(), 'AI 回手后按钮仍不出现');
api.playerSurrender();
flowOk(api.isOver() === false, 'AI 回手后认输依然无效');

/* F5 重开一局后资格恢复 */
api.initGame();
api.setPlates([1, 1]);
api.renderBoard();
flowOk(btnShown() && api.moves() === 0, '重新开始后认输资格恢复');

/* ══ G：官方样例对拍（洛谷 U145698 题面样例）═════════════════
 * 这是唯一一层"外部权威"校验：不是跟自己的暴力解对，而是跟出题人给的期望输出对。
 * 数据范围也与题面一致（1 ≤ n ≤ 50，1 ≤ a_i ≤ 1e6）。
 */
const LUOGU_SAMPLES = [
  { a: [1, 1, 1], expect: 'Elaina' },       // 样例组一
  { a: [1, 2, 1], expect: 'Fran' },
  { a: [3, 4, 5], expect: 'Elaina' },       // 样例组二
  { a: [1, 2, 1, 2], expect: 'Fran' },
  { a: [8, 1], expect: 'Elaina' },
];
let samplePass = 0;
for (const { a, expect } of LUOGU_SAMPLES) {
  const got = analyzePosition(a).canWin ? 'Elaina' : 'Fran';
  if (got === expect) samplePass++;
  else fail(`官方样例不符 [${a}] 期望=${expect} 实际=${got}`);
}
// 页面底部的题目出处 / 源码仓库链接（展示用元素，防止后续改动被误删）
const footerMatch = html.match(/id="problem-source"[\s\S]*?<\/footer>/);
if (!footerMatch) {
  fail('页面底部缺少题目出处页脚（id="problem-source"）');
} else {
  const footer = footerMatch[0];
  if (!/luogu\.com\.cn\/problem\/U145698/.test(footer)) {
    fail('页面底部缺少洛谷题目出处链接');
  }
  if (!/github\.com\/aihaisi\/elaina-mushroom-nim/.test(footer)) {
    fail('页面底部缺少 GitHub 仓库链接');
  }
  // 展示层元素：洛谷行在上、GitHub 行在下，顺序是需求的一部分
  const luoguAt = footer.indexOf('luogu.com.cn');
  const githubAt = footer.indexOf('github.com');
  if (luoguAt === -1 || githubAt === -1 || githubAt < luoguAt) {
    fail('页脚链接顺序错误：GitHub 仓库链接应位于洛谷题目链接下方');
  }
}

/* ══ H：发布副本一致性（site/ 是线上发布源）═════════════════════
 * 线上站点发布的是 site/ 目录，不是项目根目录 —— 根目录含 .workbuddy/（项目记忆），
 * 直接发布会把内部笔记暴露成公开可下载的文件。
 * 代价是出现两份 index.html，故此处把"漂移"钉成断言：不一致即失败。
 * 修法：cp index.html site/index.html
 */
let siteInSync = null;
if (existsSync(siteIndexPath)) {
  const rootBuf = readFileSync(htmlPath);
  const siteBuf = readFileSync(siteIndexPath);
  siteInSync = rootBuf.equals(siteBuf);
  if (!siteInSync) {
    fail(`发布副本已过期：site/index.html 与 index.html 不一致`
      + `（根 ${rootBuf.length}B / 副本 ${siteBuf.length}B）→ 运行 cp index.html site/index.html`);
  }
}

/* ══ I：出盘分布与「1 蘑菇转机」 ════════════════════════════════
 * 两件事：
 *  I-1  把 O(n) 递推 lose[j] 改写成一条人能读的规则，并与求解器交叉验证：
 *         a[j] >= 2                                → lose[j] = false
 *         a[j] === 1 且这条 1 链被某个 >=2 的盘截断 → lose[j] = (链长 为奇数)
 *         a[j] === 1 且这条 1 链一直延伸到盘尾      → lose[j] = (链长 为偶数)
 *       这条规则是"为什么 1 蘑菇盘是转机"的正式解释：轮到你面对一个 >=2 的盘时，
 *       要数的是紧随其后的连续 1 蘑菇盘长度 —— 奇数就取空，偶数就只留 1 个。
 *       （末尾全为 1 时奇偶反过来，因为盘空判负把基准翻转了一次。）
 *  I-2  断言 a_i = 1 的出现率 = 35%（基准 1/6 的 210%），其余五档各 13%。
 *       概率用穷举 rand 网格求，而不是抽样统计：抽样的方差会让断言偶发失败，
 *       一个会随机变红的断言等于没有断言。
 */
const spawnRe = /\/\* ==== MUSHROOM-SPAWN BEGIN ==== \*\/([\s\S]*?)\/\* ==== MUSHROOM-SPAWN END ==== \*\//;
const spawnMatch = html.match(spawnRe);
let spawnStats = null;
if (!spawnMatch) {
  fail('未能在 index.html 中找到 MUSHROOM-SPAWN 代码块');
} else {
  const spawn = new Function(`${spawnMatch[1]}
    return { pickPlateCount, buildCountPicker, chanceToWeight,
             ONE_MUSHROOM_CHANCE, ONE_MUSHROOM_BOOST, MIN_PLATES, PLATE_SPAN };`)();

  // ── I-1 可读规则 vs 求解器 ────────────────────────────────
  function runOfOnes(a, j) { let r = 0; while (j + r < a.length && a[j + r] === 1) r++; return r; }
  function readableRule(a, j) {
    if (a[j] !== 1) return false;
    const run = runOfOnes(a, j);
    return (j + run === a.length) ? (run % 2 === 0) : (run % 2 === 1);
  }
  function ruleAgrees(a) {
    const lose = computeLosingFlags(a);
    for (let j = 0; j < a.length; j++) if (readableRule(a, j) !== lose[j]) return false;
    return true;
  }

  // ① 穷举 n ≤ 6、a_i ∈ [1,6] 的全部盘面（6+36+…+46656 = 55986 个）
  let exhaustBoards = 0, exhaustBad = 0;
  for (let n = 1; n <= 6; n++) {
    const a = new Array(n).fill(1);
    const total = Math.pow(6, n);
    for (let code = 0; code < total; code++) {
      let c = code;
      for (let i = n - 1; i >= 0; i--) { a[i] = (c % 6) + 1; c = Math.floor(c / 6); }
      exhaustBoards++;
      if (!ruleAgrees(a)) exhaustBad++;
    }
  }
  if (exhaustBad !== 0) fail(`可读奇偶规则与求解器不符（穷举 ${exhaustBoards} 盘面，${exhaustBad} 个不符）`);

  // ② 大值域随机盘面（规则不应只在小编号下成立）
  let bigRuleChecked = 0, bigRuleBad = 0;
  for (let k = 0; k < 20000; k++) {
    const n = 1 + Math.floor(Math.random() * 40);
    const a = [];
    for (let i = 0; i < n; i++) a.push(1 + Math.floor(Math.random() * 1e6));
    bigRuleChecked++;
    if (!ruleAgrees(a)) {
      bigRuleBad++;
      if (bigRuleBad === 1) fail(`可读奇偶规则在大值域盘面 ${JSON.stringify(a)} 上不符`);
    }
  }

  // ── I-2 出盘权重：穷举 rand 网格求精确概率 ─────────────────
  const GRID = 100000;
  const counts = new Map();
  for (let k = 0; k < GRID; k++) {
    const v = spawn.pickPlateCount((k + 0.5) / GRID);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const keys = [...counts.keys()].sort((x, y) => x - y);
  const pOf = (v) => (counts.get(v) || 0) / GRID;
  const BASE_P = 1 / 6;

  // 值域必须恰好是 1..6，每个点数都要能抽到（防止权重写错把某档掐死）
  if (keys.length !== 6 || keys[0] !== 1 || keys[5] !== 6) {
    fail(`出盘点数值域异常：期望 1..6，实际 [${keys.join(', ')}]`);
  }
  // 概率和必须为 1
  const pSum = keys.reduce((s, v) => s + pOf(v), 0);
  if (Math.abs(pSum - 1) > 1e-3) fail(`出盘概率和不为 1：${pSum.toFixed(6)}`);

  // 钉死产品契约的字面量 —— 故意不引用 spawn.ONE_MUSHROOM_CHANCE：
  // 拿配置常量去断言配置常量是恒真式（改配置时断言跟着一起变，永远通过），
  // 上一轮的盘子数断言就踩过这个坑。要改概率，就得连这里一起改，是被刻意设计的摩擦。
  const EXPECTED_ONE_CHANCE = 0.35;                       // P(a_i = 1) = 35%
  const EXPECTED_OTHER_CHANCE = (1 - EXPECTED_ONE_CHANCE) / 5;   // 其余五档各 13%

  const pOne = pOf(1);
  const boostRatio = pOne / BASE_P;
  if (Math.abs(pOne - EXPECTED_ONE_CHANCE) > 1e-3) {
    fail(`a_i = 1 的出现率应为 ${(EXPECTED_ONE_CHANCE * 100).toFixed(2)}%，实际 ${(pOne * 100).toFixed(2)}%`
      + `（ONE_MUSHROOM_CHANCE = ${spawn.ONE_MUSHROOM_CHANCE}，`
      + `ONE_MUSHROOM_BOOST = ${spawn.ONE_MUSHROOM_BOOST.toFixed(4)}）`);
  }
  // 其余五档必须等概率（避免"提了 1 档却把别的档顺手压歪"）
  for (let v = 2; v <= 6; v++) {
    if (Math.abs(pOf(v) - EXPECTED_OTHER_CHANCE) > 1e-3) {
      fail(`点数 ${v} 的概率应等比吸收后为 ${(EXPECTED_OTHER_CHANCE * 100).toFixed(2)}%，`
        + `实际 ${(pOf(v) * 100).toFixed(2)}%`);
    }
  }
  // 「目标概率 → 权重倍率」的反解必须自洽（35% ⇒ 35/13，最容易在这一步算错）
  const sanityWeight = spawn.chanceToWeight(EXPECTED_ONE_CHANCE, 1, 6);
  if (Math.abs(sanityWeight - 35 / 13) > 1e-9) {
    fail(`chanceToWeight(0.35) 应为 35/13 ≈ 2.6923，实际 ${sanityWeight}`);
  }
  // 抽样器单调性：累积分布映射出的结果必须随 rand 单调不减（否则会出现"随机数越大点数越小"）
  let lastVal = -Infinity, monotone = true;
  for (let k = 0; k < 5000; k++) {
    const v = spawn.pickPlateCount(k / 5000);
    if (v < lastVal) monotone = false;
    lastVal = v;
  }
  if (!monotone) fail('出盘抽样器非单调：rand 增大时点数反而变小');

  // 盘子数取值域：钉死产品契约 n ∈ [3,5]（字面量，不是拿 MIN_PLATES/PLATE_SPAN 自证 ——
  // 那样的断言是恒真式：把上界从 3 悄悄改成 2 也照样通过）。
  // 若确实要改开盘盘子数，这里会失败，属于"故意让测试提醒你同步文档与 README"。
  const ns = new Set();
  for (let k = 0; k < GRID; k++) ns.add(spawn.MIN_PLATES + Math.floor(((k + 0.5) / GRID) * spawn.PLATE_SPAN));
  const nsSorted = [...ns].sort((x, y) => x - y);
  const EXPECTED_PLATE_RANGE = [3, 4, 5];
  if (nsSorted.length !== EXPECTED_PLATE_RANGE.length
    || nsSorted.some((v, i) => v !== EXPECTED_PLATE_RANGE[i])) {
    fail(`开盘盘子数取值域应为 [${EXPECTED_PLATE_RANGE.join(', ')}]，实际 [${nsSorted.join(', ')}]`
      + '（若是有意修改，请同步更新断言与 README）');
  }

  spawnStats = {
    pOne, boostRatio, exhaustBoards, bigRuleChecked,
    plateRange: `${nsSorted[0]}~${nsSorted[nsSorted.length - 1]}`,
    // 报告行必须反映真实结果：早先这里写死了 "✓ ...完全一致"，
    // 于是断言失败时报表格依然显示通过 —— 一份永远显示成功的报告比没有报告更糟。
    ruleOk: exhaustBad === 0 && bigRuleBad === 0,
    ruleBad: exhaustBad + bigRuleBad,
    plateRangeOk: nsSorted.length === EXPECTED_PLATE_RANGE.length
      && nsSorted.every((v, i) => v === EXPECTED_PLATE_RANGE[i]),
  };
}

/* ── 报告 ─────────────────────────────────────────────────── */
console.log('── 验证报告 ─────────────────────────────────');
console.log(`  抽取代码块字符数        : ${match[1].length}`);
console.log(`  穷举盘面数 (n≤5,a≤4)   : ${boardCount}`);
console.log(`  穷举可达状态数          : ${stateCount}（其中真正需要抉择的 m≥2 局面 ${decisionPoints} 个）`);
console.log(`  大规模自对弈局数        : ${bigGames}（n≤50，a_i≤1e6）`);
console.log(`  边界用例                : ${edgeCases.length}`);
console.log(`  认输门控流程断言        : ${flow.filter((c) => c.ok).length}/${flow.length} 通过`);
console.log(`  洛谷官方样例对拍        : ${samplePass}/${LUOGU_SAMPLES.length}`);
console.log(`  发布副本 (site/) 一致性 : ${siteInSync === null ? '— 未使用（无 site/ 目录）'
  : siteInSync ? '✓ 与根 index.html 逐字节一致' : '✗ 已过期，发布前必须同步'}`);
console.log(spawnStats
  ? `  可读奇偶规则交叉验证    : ${spawnStats.ruleOk ? '✓' : `✗ ${spawnStats.ruleBad} 个盘面不符`}`
    + ` 穷举 ${spawnStats.exhaustBoards} 盘面 (n≤6,a≤6) + 随机大值域 ${spawnStats.bigRuleChecked} 盘面`
  : '  可读奇偶规则交叉验证    : — 未执行（缺 MUSHROOM-SPAWN 块）');
console.log(spawnStats
  ? `  出盘「1 蘑菇」出现率    : ${(spawnStats.pOne * 100).toFixed(2)}%`
    + `（基准 1/6 = 16.67% 的 ${(spawnStats.boostRatio * 100).toFixed(1)}%），`
    + `盘子数 n ∈ ${spawnStats.plateRange}${spawnStats.plateRangeOk ? '' : ' ✗'}`
  : '  出盘「1 蘑菇」出现率    : — 未执行');
console.log(failures === 0
  ? '  结果                    : ✓ 全部通过，AI 走法在所有被检状态上均为最优，认输门控行为正确'
  : `  结果                    : ✗ 失败 ${failures} 项`);

process.exit(failures === 0 ? 0 : 1);
