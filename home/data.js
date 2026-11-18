// ホームアイランド：島の中身の設定（建物の種類・最初の配置・島の一覧・お知らせ）
// 島や建物を増やすときは、ここに1行足す。

// 主人公の画像（仕様書2-4の並び：横4列＝下・左・右・上、縦2段＝立ち・踏み出し）

export const SUBJECT_LABELS = { math: 'さんすう', rika: 'りか', kokugo: 'こくご', shakai: 'しゃかい', eigo: 'えいご' };

// 建物の種類。w×h は占めるマス数。front は「この行の下に立って上を向くと調べられる」
export const OBJECT_TYPES = {
  school:   { name: 'がっこう',       w: 5, h: 3, roof: '#d9654b', wall: '#f5ead6', solid: true, sprite: { src: 'assets/home/bld_school.webp?v=0.11.0', w: 4.922 } },
  // やることボード（自分の家の前）
  todo:     { name: 'やること',       w: 1, h: 1, solid: true, sprite: { src: 'assets/home/bld_todo.webp?v=0.11.0', w: 1.0 } },
  board:    { name: 'けいじばん',     w: 1, h: 1, solid: true, noLabel: true, sprite: { src: 'assets/home/bld_board.webp?v=0.11.0', w: 1.312 } },
  // sprite.w は画像の横幅が何マス分か（土台の幅に合わせて縮小済み）。画像の下端＝土台の下端
  house:    { name: 'じぶんの いえ',  w: 3, h: 2, roof: '#4d8fd1', wall: '#fbf3e4', solid: true, sprite: { src: 'assets/home/bld_house.webp?v=0.11.0', w: 3.245 } },
  balloon:  { name: 'ききゅう のりば', w: 2, h: 2, solid: true, sprite: { src: 'assets/home/balloon_pad.webp?v=0.11.0', w: 2.198 },
              air: { src: 'assets/home/balloon.webp?v=0.11.0', w: 1.448, deck: 0.58 } }, // deck：台の上面（かごを置く高さ）が絵の上から何割の所か
  kisekae:  { name: 'きせかえや',     w: 3, h: 2, roof: '#c77dbb', wall: '#fbeff7', solid: true, soon: true, sprite: { src: 'assets/home/bld_kisekae.webp?v=0.11.0', w: 2.589 } },
  exchange: { name: 'こうかんじょ',   w: 3, h: 2, roof: '#e0a43a', wall: '#fdf3df', solid: true, sprite: { src: 'assets/home/bld_exchange.webp?v=0.11.0', w: 2.693 } },
  // 飾り（調べられない。deco:true）
  tree:     { name: 'き',       w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_tree.webp?v=0.11.0', w: 1.698 } },
  palm:     { name: 'ヤシのき', w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_palm.webp?v=0.11.0', w: 1.599 } },
  flowers:  { name: 'はな',     w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_flowers.webp?v=0.11.0', w: 1.099 } },
  rock:     { name: 'いわ',     w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_rock.webp?v=0.11.0', w: 1.0 } },
  b_hanabatake: { name: 'はなばたけ',       w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_hanabatake.webp?v=0.11.0', w: 2.198 } },
  b_bench:      { name: 'ベンチと がいとう', w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_bench.webp?v=0.11.0', w: 2.198 } },
  b_library:    { name: 'としょかん',       w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_library.webp?v=0.11.0', w: 2.198 } },
  b_lab:        { name: 'かんさつ ラボ',     w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_lab.webp?v=0.11.0', w: 2.198 } },
  b_cafe:       { name: 'ABC カフェ',        w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_cafe.webp?v=0.11.0', w: 2.198 } },
  b_tenboudai:  { name: 'てんぼうだい',     w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_tenboudai.webp?v=0.11.0', w: 2.198 } },
  b_tower:      { name: 'ハテナの とう',     w: 2, h: 2, solid: true, built: true, sprite: { src: 'assets/home/b_tower.webp?v=0.11.0', w: 1.5 } },
  // イベントひろば（島の中央。動かせない・ほかの物を置けない。イベントの期間だけ「イベントの もん」が立つ）
  plaza:    { name: 'イベントひろば', w: 3, h: 3, solid: false, ground: true }, // ground：ふつうの 地面と同じに 歩ける（タップでも そこへ歩く・しらべる 対象に ならない）
  lot:      { name: 'あきち',         w: 2, h: 2, solid: false, sprite: { src: 'assets/home/bld_lot.webp?v=0.11.0', w: 2.151 } },
};

// 冒険の書を作ったときの、最初の島のようす
// ---------------------------------------------------------------- 建てられる建物（v0.4）
// 教科ごとの素材（各島で学ぶと手に入る。仕様書3-5の p1/wallet.materials のキーと同じ）
export const MATERIALS = {
  math:   { name: 'かずの いし',     icon: '💎', img: 'assets/home/mat_math.webp?v=0.11.0' },
  rika:   { name: 'ふしぎの しずく', icon: '💧', img: 'assets/home/mat_rika.webp?v=0.11.0' },
  kokugo: { name: 'ことばの はね',   icon: '🪶', img: 'assets/home/mat_kokugo.webp?v=0.11.0' },
  shakai: { name: 'ちずの かけら',   icon: '🗺️', img: 'assets/home/mat_shakai.webp?v=0.11.0' },
  eigo:   { name: 'ABCの ほし',      icon: '⭐', img: 'assets/home/mat_eigo.webp?v=0.11.0' },
};
// 空き地（2×2）に建てる建物。段階2からは、2つ以上の教科の素材が必要（同じ教科ばかりにならないように）
export const BUILDABLES = [
  { type: 'b_hanabatake', tier: 1, cost: { coin: 20 },                              desc: 'いろとりどりの はなが さいているよ。ちょうちょも あそびに きたね。' },
  { type: 'b_bench',      tier: 1, cost: { coin: 30 },                              desc: 'ベンチで ひとやすみ。よるは がいとうが あかるく てらすよ。' },
  { type: 'b_library',    tier: 2, cost: { coin: 50, kokugo: 5, math: 3 },          desc: 'ほんが いっぱいの としょかん。どんな おはなしが あるかな。' },
  { type: 'b_lab',        tier: 2, cost: { coin: 50, rika: 5, math: 3 },            desc: 'しょくぶつを そだてたり、ほしを みたり できる かんさつ ラボ。' },
  { type: 'b_cafe',       tier: 2, cost: { coin: 60, eigo: 5, kokugo: 3 },          desc: 'ABC カフェで ひとやすみ。えいごの メニューも あるよ。' },
  { type: 'b_tenboudai',  tier: 2, cost: { coin: 80, shakai: 5, rika: 3 },          desc: 'たかい ところから しまを みわたせる てんぼうだい。ちずも あるよ。' },
  { type: 'b_tower',      tier: 3, cost: { coin: 200, math: 5, rika: 5, kokugo: 5, shakai: 5, eigo: 5 }, desc: 'しまの シンボル、ハテナの とう。ぜんぶの しまを めぐった あかし だよ。' },
];
export const EXCHANGE_RATE = 3; // こうかんじょ：ほかの素材3こ → ほしい素材1こ（島がそろうまでの救済。損なので、いろいろな島で学ぶほうが得）

export const LAYOUT_VERSION = 7;

// 地面の模様（つなぎ目のない画像）と、何マスで1回くり返すか
export const TEXTURES = {
  grass: { src: 'assets/home/tex_grass.webp?v=0.11.0', tiles: 3 },
  path:  { src: 'assets/home/tex_path.webp?v=0.11.0',  tiles: 3 },
  sea:   { src: 'assets/home/tex_sea.webp?v=0.11.0',   tiles: 4 },
};
export const ISLANDS_BG = 'assets/home/bg_islands.webp?v=0.11.0';

// 最初から島にある飾り
const DEFAULT_DECOS = [
  { id: 'deco1', type: 'tree', x: 2, y: 3 },   { id: 'deco2', type: 'flowers', x: 10, y: 1 },
  { id: 'deco3', type: 'tree', x: 13, y: 3 },  { id: 'deco4', type: 'palm', x: 1, y: 9 },
  { id: 'deco5', type: 'palm', x: 14, y: 9 },  { id: 'deco6', type: 'rock', x: 13, y: 10 },
  { id: 'deco7', type: 'flowers', x: 4, y: 9 },{ id: 'deco8', type: 'rock', x: 0, y: 4 },
  { id: 'deco9', type: 'flowers', x: 4, y: 8 },{ id: 'deco10', type: 'palm', x: 12, y: 2 },
];
// 最初の島の形（陸のマスの一覧）。v0.3.1 から、四角ではなく でこぼこした自然な形にした。
// 将来、土地を拡げると、ここにマスが加わっていく（座標はマイナスになってもよい）。
export const START_LAND = (() => {
  const L = new Set();
  const add = (x, y) => L.add(`${x},${y}`), del = (x, y) => L.delete(`${x},${y}`);
  for (let y = 1; y <= 10; y++) for (let x = 1; x <= 14; x++) add(x, y);
  // かどを けずる
  [[1, 1], [2, 1], [13, 1], [14, 1], [1, 10], [14, 10]].forEach(([x, y]) => del(x, y));
  // 出っぱり（みさき）
  for (let x = 6; x <= 9; x++) add(x, 0);
  for (let y = 4; y <= 7; y++) add(0, y);
  for (let y = 5; y <= 8; y++) add(15, y);
  for (let x = 5; x <= 9; x++) add(x, 11);
  add(6, 12); add(7, 12);
  // へこみ（入り江）
  del(11, 1); del(12, 1); // v0.11.0：南の入り江（10,10）（11,10）は うめた（こうかんじょの 入口）
  return [...L];
})();

// 動かせない 施設の 場所（v0.11.0 で 中央広場の形に 並べなおした）
export const FIXED_LAYOUT = [
  { id: 'school',   type: 'school',   x: 5,  y: 1 },
  { id: 'board',    type: 'board',    x: 4,  y: 3 },   // 学校の左。家の やることボードと 行き来しやすく
  { id: 'plaza',    type: 'plaza',    x: 6,  y: 5 },
  { id: 'house',    type: 'house',    x: 2,  y: 5 },
  { id: 'todo',     type: 'todo',     x: 1,  y: 6 },
  { id: 'kisekae',  type: 'kisekae',  x: 10, y: 5 },
  { id: 'balloon',  type: 'balloon',  x: 14, y: 5 },
  { id: 'exchange', type: 'exchange', x: 10, y: 8 },
];

export const DEFAULT_HOME = () => ({
  layout: LAYOUT_VERSION,
  map: { land: START_LAND.slice() },
  objects: [
    // v0.11.0：島の まんなかに イベントひろば（3×3）。まわりに 学校・家・お店・ききゅうを ならべる
    ...FIXED_LAYOUT.map((d) => ({ ...d })),
    { id: 'lot1',     type: 'lot',      x: 2,  y: 8 },
    { id: 'lot2',     type: 'lot',      x: 6,  y: 9 },
    { id: 'lot3',     type: 'lot',      x: 10, y: 2 },   // 学校の右
    ...DEFAULT_DECOS.map((d) => ({ ...d })),
  ],
  player: { x: 7, y: 8, dir: 'up' },
  readNotices: [],
});

// 古い配置で作られた島を、今の配置に合わせる（子どもが作ったものは消さない）
export function migrateHome(home) {
  const v = home.layout || 1;
  if (v < 2) { // v0.2.3：学校の絵に合わせて幅を4→5マスにし、左へ1マス動かす
    const sc = home.objects.find((o) => o.id === 'school');
    if (sc && sc.x === 2) sc.x = 1;
  }
  if (v < 3) { // v0.2.8：木・花・岩を植える（すでに何か置いてある場所と、主人公の足もとには置かない）
    const used = (x, y) => home.objects.some((o) => {
      const t = OBJECT_TYPES[o.type];
      return x >= o.x && x < o.x + t.w && y >= o.y && y < o.y + t.h;
    }) || (home.player && home.player.x === x && home.player.y === y);
    for (const d of DEFAULT_DECOS) {
      if (!home.objects.some((o) => o.id === d.id) && !used(d.x, d.y)) home.objects.push({ ...d });
    }
  }
  if (v < 4) { // v0.3.1：島の形を「陸のマスの一覧」にして、自然な形にする
    const land = new Set(START_LAND);
    // 子どもが置いた物や主人公の足もとは、必ず陸にしておく
    for (const o of home.objects) {
      const t = OBJECT_TYPES[o.type];
      if (!t) continue;
      for (let y = o.y; y < o.y + t.h; y++) for (let x = o.x; x < o.x + t.w; x++) land.add(`${x},${y}`);
    }
    if (home.player) land.add(`${home.player.x},${home.player.y}`);
    home.map = { land: [...land] };
  }
  if (v < 5 && !home.objects.some((o) => o.type === 'todo')) { // v0.10.0：自分の家の前に やることボードを置く
    const land = new Set(home.map.land);
    const used = new Set();
    for (const o of home.objects) { const t = OBJECT_TYPES[o.type]; if (!t) continue; for (let y = o.y; y < o.y + t.h; y++) for (let x = o.x; x < o.x + t.w; x++) used.add(`${x},${y}`); }
    const hs = home.objects.find((o) => o.type === 'house') || { x: 7, y: 5 };
    const p = home.player || {};
    // 家の右・左・前の順に、あいている陸を さがす（主人公の足もとと、家の まん前（入口）は さける）
    const tries = [[3, 1], [-1, 1], [3, 0], [-1, 0], [0, 2], [2, 2], [4, 1], [-2, 1], [4, 2], [-2, 2]];
    for (const [dx, dy] of tries) {
      const x = hs.x + dx, y = hs.y + dy, k = `${x},${y}`;
      if (land.has(k) && !used.has(k) && !(p.x === x && p.y === y) && !(x === hs.x + 1 && y === hs.y + 2)) { home.objects.push({ id: 'todo', type: 'todo', x, y }); break; }
    }
  }
  if (v < 6 && !home.objects.some((o) => o.type === 'plaza')) { // v0.11.0：島の中央に イベントひろば（2×2）を とっておく
    const land = new Set(home.map.land);
    const used = new Set();
    for (const o of home.objects) { const t = OBJECT_TYPES[o.type]; if (!t) continue; for (let y = o.y; y < o.y + t.h; y++) for (let x = o.x; x < o.x + t.w; x++) used.add(`${x},${y}`); }
    const p = home.player || {};
    const free = (x, y) => land.has(`${x},${y}`) && !used.has(`${x},${y}`) && !(p.x === x && p.y === y);
    // はじめの場所（学校と家の あいだ）が あいていれば そこ。だめなら 島の まんなかに いちばん近い あいた 2×2
    const xs = [...land].map((k) => +k.split(',')[0]), ys = [...land].map((k) => +k.split(',')[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cands = [];
    for (const k of land) {
      const [x, y] = k.split(',').map(Number);
      if (free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) cands.push([x, y, (x === 4 && y === 5) ? -1 : Math.hypot(x + 1 - cx, y + 1 - cy)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    if (cands.length) home.objects.push({ id: 'plaza', type: 'plaza', x: cands[0][0], y: cands[0][1] });
  }
  if (v < 7) { // v0.11.0：施設を 中央広場の形に 並べなおす。子どもが置いた物は 消さずに、かさなる物だけ あいた場所へ うつす
    for (const k of ['10,10', '11,10']) if (!home.map.land.includes(k)) home.map.land.push(k); // こうかんじょの 入口の 陸
    for (const f of FIXED_LAYOUT) {
      const o = home.objects.find((q) => q.type === f.type);
      if (o) { o.x = f.x; o.y = f.y; } else home.objects.push({ ...f });
    }
    const land = new Set(home.map.land);
    const fixedTypes = new Set(FIXED_LAYOUT.map((f) => f.type));
    const cells = (o) => { const t = OBJECT_TYPES[o.type]; const r = []; if (!t) return r; for (let y = o.y; y < o.y + t.h; y++) for (let x = o.x; x < o.x + t.w; x++) r.push(`${x},${y}`); return r; };
    const used = new Set(home.objects.filter((o) => fixedTypes.has(o.type)).flatMap(cells));
    const pathKeys = new Set(PATH_TILES.map(([x, y]) => `${x},${y}`));
    const p = home.player || {};
    const others = home.objects.filter((o) => !fixedTypes.has(o.type));
    for (const o of others) {
      const fits = (x, y) => cells({ ...o, x, y }).every((k) => land.has(k) && !used.has(k) && !(OBJECT_TYPES[o.type].solid && pathKeys.has(k)) && k !== `${p.x},${p.y}`);
      if (!fits(o.x, o.y)) {
        let best = null;
        for (const k of land) { const [x, y] = k.split(',').map(Number); if (fits(x, y)) { const d = Math.hypot(x - o.x, y - o.y); if (!best || d < best[2]) best = [x, y, d]; } }
        if (best) { o.x = best[0]; o.y = best[1]; } else { home.objects.splice(home.objects.indexOf(o), 1); continue; }
      }
      cells(o).forEach((k) => used.add(k));
    }
    if (p && used.has(`${p.x},${p.y}`)) { p.x = 7; p.y = 8; }
  }
  home.layout = LAYOUT_VERSION;
  return v < LAYOUT_VERSION;
}

// 道（見た目だけ）
export const PATH_TILES = (() => {
  const t = [];
  for (let x = 2; x <= 15; x++) t.push([x, 7]);   // ひろばを とおる 東西の みち（家・きせかえや・ききゅう）
  for (let y = 4; y <= 8; y++) t.push([7, y]);    // 学校から ひろばを とおって 南へ
  for (let x = 4; x <= 9; x++) t.push([x, 4]);    // 学校と けいじばんの まえ
  for (let x = 8; x <= 9; x++) t.push([x, 8]);    // こうかんじょへ
  t.push([9, 9], [9, 10], [10, 10], [11, 10]);
  return t;
})();

// 島の一覧。ready:false の島は霧の中で「じゅんびちゅう」
export const ISLANDS = [
  { id: 'test',   name: 'ためしの しま',   subject: 'math',   url: 'test/sample/index.html', ready: true,  color: '#7cc6a4', icon: '🧪', img: 'assets/home/isle_test.webp?v=0.11.0' },
  { id: 'math',   name: 'さんすうの しま', subject: 'math',   url: 'math/',   ready: true , color: '#f2b544', icon: '🔢', img: 'assets/home/isle_math.webp?v=0.11.0' },
  { id: 'rika',   name: 'りかの しま',     subject: 'rika',   url: 'rika/',   ready: false, color: '#5fb4e6', icon: '🔬', img: 'assets/home/isle_rika.webp?v=0.11.0' },
  { id: 'kokugo', name: 'こくごの しま',   subject: 'kokugo', url: 'kokugo/', ready: false, color: '#e88a8a', icon: '📖', img: 'assets/home/isle_kokugo.webp?v=0.11.0' },
  { id: 'shakai', name: 'しゃかいの しま', subject: 'shakai', url: 'shakai/', ready: false, color: '#a58fd8', icon: '🗾', img: 'assets/home/isle_shakai.webp?v=0.11.0' },
  { id: 'eigo',   name: 'えいごの しま',   subject: 'eigo',   url: 'eigo/',   ready: false, color: '#f29e5c', icon: '🔤', img: 'assets/home/isle_eigo.webp?v=0.11.0' },
];

// 仮のお知らせ（作業④で先生のスプレッドシートから読み込むようにする）
export const SAMPLE_NOTICES = [
  { id: 'welcome-1', date: '2026-11-13', title: 'ようこそ ホームアイランドへ', body: 'ききゅうに のって、いろいろな しまへ いってみよう。\nしまで がくしゅうすると、コインと そざいが もらえるよ。' },
  { id: 'welcome-2', date: '2026-11-13', title: 'あきちには たてものが たつよ', body: 'そざいを あつめると、あきちに たてものを たてられるように なるよ。\nたのしみに まっていてね。' },
];

// ---------------------------------------------------------------- 自分の家の中（v0.11.0、仕様書10章）
// へやは 横6×奥行き5マス。絵（1536×1024）の 床の上に、遠近に あわせて マスを のせる
export const ROOM = {
  cols: 6, rows: 5,
  img: { w: 1536, h: 1024 },
  floor: { y0: 420, y1: 1000, back: [230, 1306], front: [40, 1496] }, // 奥の行の上はし・手前の行の下はしと、その左右
  door: [[2, 4], [3, 4]], // 出入り口の マット（ここから 下へ すすむと そとへ）
};
export const ROOM_WALLS = {
  stripe: { name: 'みずいろの しま', src: 'assets/room/room_stripe.webp?v=0.11.0' },
  flower: { name: 'ミントの こばな', src: 'assets/room/room_flower.webp?v=0.11.0' },
};
// かぐ。w×h は 床の マス。sw は 絵の よこはばが 何マスぶんか。act は しらべたときの はたらき
export const FURNITURE = {
  bed:         { name: 'ベッド',           w: 2, h: 2, sw: 1.7, src: 'assets/room/bed.webp?v=0.11.0',         act: 'bed' },
  desk:        { name: 'がくしゅうづくえ', w: 2, h: 1, sw: 1.9, src: 'assets/room/desk.webp?v=0.11.0',        act: 'desk' },
  chair:       { name: 'いす',             w: 1, h: 1, sw: 0.8, src: 'assets/room/chair.webp?v=0.11.0' },
  bookshelf:   { name: 'ほんだな',         w: 1, h: 1, sw: 1.0, src: 'assets/room/bookshelf.webp?v=0.11.0',   act: 'books' },
  trophyshelf: { name: 'かざりだな',       w: 2, h: 1, sw: 1.7, src: 'assets/room/trophyshelf.webp?v=0.11.0', act: 'shelf' },
  sofa:        { name: 'ソファ',           w: 2, h: 1, sw: 1.9, src: 'assets/room/sofa.webp?v=0.11.0',        cost: { coin: 40, eigo: 3 } },
  table:       { name: 'まるい テーブル',  w: 1, h: 1, sw: 1.0, src: 'assets/room/table.webp?v=0.11.0',       cost: { coin: 25, math: 2 } },
  rug:         { name: 'まるい ラグ',      w: 2, h: 2, sw: 2.0, src: 'assets/room/rug.webp?v=0.11.0', flat: true, cost: { coin: 20, kokugo: 2 } },
  lamp:        { name: 'スタンドライト',   w: 1, h: 1, sw: 0.5, src: 'assets/room/lamp.webp?v=0.11.0',        cost: { coin: 30, rika: 2 } },
  plant:       { name: 'かんようしょくぶつ', w: 1, h: 1, sw: 0.8, src: 'assets/room/plant.webp?v=0.11.0',     cost: { coin: 20, shakai: 2 } },
};
export const DEFAULT_ROOM = () => ({
  wall: 'stripe',
  items: [
    { id: 'r1', type: 'bookshelf',   x: 0, y: 0 },
    { id: 'r2', type: 'trophyshelf', x: 1, y: 0 },
    { id: 'r3', type: 'desk',        x: 4, y: 0 },
    { id: 'r4', type: 'chair',       x: 4, y: 1 },
    { id: 'r5', type: 'bed',         x: 0, y: 2 },
  ],
  storage: {}, // しまってある かぐ { type: 数 }
});
