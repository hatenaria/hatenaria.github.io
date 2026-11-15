// ホームアイランド：島の中身の設定（建物の種類・最初の配置・島の一覧・お知らせ）
// 島や建物を増やすときは、ここに1行足す。

// 主人公の画像（仕様書2-4の並び：横4列＝下・左・右・上、縦2段＝立ち・踏み出し）
export const HERO_SHEETS = { boy: 'assets/hero/hero_boy.webp', girl: 'assets/hero/hero_girl.webp' };

export const SUBJECT_LABELS = { math: 'さんすう', rika: 'りか', kokugo: 'こくご', shakai: 'しゃかい', eigo: 'えいご' };

// 建物の種類。w×h は占めるマス数。front は「この行の下に立って上を向くと調べられる」
export const OBJECT_TYPES = {
  school:   { name: 'がっこう',       w: 5, h: 3, roof: '#d9654b', wall: '#f5ead6', solid: true, sprite: { src: 'assets/home/bld_school.webp', w: 4.922 } },
  board:    { name: 'けいじばん',     w: 1, h: 1, solid: true, noLabel: true, sprite: { src: 'assets/home/bld_board.webp', w: 1.312 } },
  // sprite.w は画像の横幅が何マス分か（土台の幅に合わせて縮小済み）。画像の下端＝土台の下端
  house:    { name: 'じぶんの いえ',  w: 3, h: 2, roof: '#4d8fd1', wall: '#fbf3e4', solid: true, sprite: { src: 'assets/home/bld_house.webp', w: 3.245 } },
  balloon:  { name: 'ききゅう のりば', w: 2, h: 2, solid: true, sprite: { src: 'assets/home/balloon_pad.webp', w: 2.198 },
              air: { src: 'assets/home/balloon.webp', w: 1.448, deck: 0.58 } }, // deck：台の上面（かごを置く高さ）が絵の上から何割の所か
  kisekae:  { name: 'きせかえや',     w: 3, h: 2, roof: '#c77dbb', wall: '#fbeff7', solid: true, soon: true, sprite: { src: 'assets/home/bld_kisekae.webp', w: 2.589 } },
  exchange: { name: 'こうかんじょ',   w: 3, h: 2, roof: '#e0a43a', wall: '#fdf3df', solid: true, soon: true, sprite: { src: 'assets/home/bld_exchange.webp', w: 2.693 } },
  // 飾り（調べられない。deco:true）
  tree:     { name: 'き',       w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_tree.webp', w: 1.698 } },
  palm:     { name: 'ヤシのき', w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_palm.webp', w: 1.599 } },
  flowers:  { name: 'はな',     w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_flowers.webp', w: 1.099 } },
  rock:     { name: 'いわ',     w: 1, h: 1, solid: true, deco: true, noLabel: true, sprite: { src: 'assets/home/deco_rock.webp', w: 1.0 } },
  lot:      { name: 'あきち',         w: 2, h: 2, solid: false, sprite: { src: 'assets/home/bld_lot.webp', w: 2.151 } },
};

// 冒険の書を作ったときの、最初の島のようす
export const LAYOUT_VERSION = 3;

// 地面の模様（つなぎ目のない画像）と、何マスで1回くり返すか
export const TEXTURES = {
  grass: { src: 'assets/home/tex_grass.webp', tiles: 3 },
  path:  { src: 'assets/home/tex_path.webp',  tiles: 3 },
  sea:   { src: 'assets/home/tex_sea.webp',   tiles: 4 },
};
export const ISLANDS_BG = 'assets/home/bg_islands.webp';

// 最初から島にある飾り
const DEFAULT_DECOS = [
  { id: 'deco1', type: 'tree', x: 7, y: 2 },   { id: 'deco2', type: 'flowers', x: 8, y: 3 },
  { id: 'deco3', type: 'tree', x: 14, y: 6 },  { id: 'deco4', type: 'palm', x: 1, y: 9 },
  { id: 'deco5', type: 'palm', x: 13, y: 10 }, { id: 'deco6', type: 'rock', x: 8, y: 10 },
  { id: 'deco7', type: 'flowers', x: 7, y: 9 },{ id: 'deco8', type: 'rock', x: 1, y: 6 },
  { id: 'deco9', type: 'flowers', x: 4, y: 10 },{ id: 'deco10', type: 'palm', x: 12, y: 2 },
];
export const DEFAULT_HOME = () => ({
  layout: LAYOUT_VERSION,
  map: { w: 16, h: 12, chunks: [] },
  objects: [
    { id: 'school',   type: 'school',   x: 1,  y: 2 },
    { id: 'board',    type: 'board',    x: 6,  y: 3 },
    { id: 'house',    type: 'house',    x: 7,  y: 5 },
    { id: 'kisekae',  type: 'kisekae',  x: 9,  y: 2 },
    { id: 'balloon',  type: 'balloon',  x: 12, y: 5 },
    { id: 'exchange', type: 'exchange', x: 10, y: 8 },
    { id: 'lot1',     type: 'lot',      x: 2,  y: 7 },
    { id: 'lot2',     type: 'lot',      x: 5,  y: 8 },
    { id: 'lot3',     type: 'lot',      x: 13, y: 2 },
    ...DEFAULT_DECOS.map((d) => ({ ...d })),
  ],
  player: { x: 8, y: 7, dir: 'down' },
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
  home.layout = LAYOUT_VERSION;
  return v < LAYOUT_VERSION;
}

// 道（見た目だけ）
export const PATH_TILES = (() => {
  const t = [];
  for (let x = 4; x <= 13; x++) t.push([x, 7]);
  for (let y = 4; y <= 6; y++) t.push([6, y]);
  for (let x = 3; x <= 5; x++) t.push([x, 5]); // 学校の入口へ
  for (let x = 7; x <= 11; x++) t.push([x, 4]);
  return t;
})();

// 島の一覧。ready:false の島は霧の中で「じゅんびちゅう」
export const ISLANDS = [
  { id: 'test',   name: 'ためしの しま',   subject: 'math',   url: 'test/sample/index.html', ready: true,  color: '#7cc6a4', icon: '🧪', img: 'assets/home/isle_test.webp' },
  { id: 'math',   name: 'さんすうの しま', subject: 'math',   url: 'math/',   ready: false, color: '#f2b544', icon: '🔢', img: 'assets/home/isle_math.webp' },
  { id: 'rika',   name: 'りかの しま',     subject: 'rika',   url: 'rika/',   ready: false, color: '#5fb4e6', icon: '🔬', img: 'assets/home/isle_rika.webp' },
  { id: 'kokugo', name: 'こくごの しま',   subject: 'kokugo', url: 'kokugo/', ready: false, color: '#e88a8a', icon: '📖', img: 'assets/home/isle_kokugo.webp' },
  { id: 'shakai', name: 'しゃかいの しま', subject: 'shakai', url: 'shakai/', ready: false, color: '#a58fd8', icon: '🗾', img: 'assets/home/isle_shakai.webp' },
  { id: 'eigo',   name: 'えいごの しま',   subject: 'eigo',   url: 'eigo/',   ready: false, color: '#f29e5c', icon: '🔤', img: 'assets/home/isle_eigo.webp' },
];

// 仮のお知らせ（作業④で先生のスプレッドシートから読み込むようにする）
export const SAMPLE_NOTICES = [
  { id: 'welcome-1', date: '2026-11-13', title: 'ようこそ ホームアイランドへ', body: 'ききゅうに のって、いろいろな しまへ いってみよう。\nしまで がくしゅうすると、コインと そざいが もらえるよ。' },
  { id: 'welcome-2', date: '2026-11-13', title: 'あきちには たてものが たつよ', body: 'そざいを あつめると、あきちに たてものを たてられるように なるよ。\nたのしみに まっていてね。' },
];
