// ハテナリア 共通部品：主人公の部品一覧（parts.js） 版 1.3.0（2026-11-18 からホームのチャットが管理。1.3.0：画像依頼セット01 の 服14・アクセサリー7・髪2、頭に つける アクセサリー（at:'head'）。1.2.2：はじめの服 Tシャツ・ワンピース。1.2.1：はじめの服を パーカーに）
// ---------------------------------------------------------------------
// 部品を増やすときは、画像を1枚このフォルダに置き、下の一覧に1行足すだけ。
// プログラム（hero.js）は書き換えない（共通仕様書 2-4「追加の手順」）。
//
// 絵柄：線なしの粘土風パステル（仕様書 2-9）。2026-11-16 第1便で描き直し
// 画像の規格（配信用。原画 1536×1024 を半分にした WebP）
//   ・768×512。横4列＝下・左・右・上、縦2段
//   ・1コマ 192×256、足元の基準点 (96, 244)
//   ・体・服     … 8コマ（上段＝立ち、下段＝踏み出し）
//   ・髪         … 上段＝手前の髪、下段＝奥の髪（どちらも「立ち」の位置。歩くと頭に合わせて動く）
//   ・アクセサリー … 上段の4コマだけ（歩くと胸に合わせて動く）
//   ・服は首から下の全身（肌の見える腕・足もふくむ）を描く。体は首の位置で切って重ねる
// =====================================================================

export const SHEET = { cellW: 192, cellH: 256, footX: 96, footY: 244, dirs: ['down', 'left', 'right', 'up'] };

export const BODY = { src: 'body.webp' }; // hero_body_v2（男女共通、描き直さない）

/** 髪型。gender はその性別の初期の髪型を決めるのに使う（どちらの性別でも選べる） */
export const HAIRS = {
  'boy-01':  { name: 'はねた みじかい かみ', gender: 'boy',  src: 'hair_boy_01.webp' },
  'girl-01': { name: 'ポニーテール',         gender: 'girl', src: 'hair_girl_01.webp' },
  'boy-02':  { name: 'まるい ショート',       gender: 'boy',  src: 'hair_boy_02.webp' },   // 第3便
  'girl-02': { name: 'ふんわり ボブ',         gender: 'girl', src: 'hair_girl_02.webp' },  // 第3便
  'boy-03':  { name: 'つんつん ヘア',         gender: 'boy',  src: 'hair_boy_03.webp' },   // セット01
  'girl-03': { name: 'ツインテール',           gender: 'girl', src: 'hair_girl_03.webp' },  // セット01
};

/** 髪色。髪の明るさの濃淡に、いちばん暗い所・影・基本・明るい所の4色を当てる（パステル調） */
export const HAIR_COLORS = {
  brown:  { name: 'ちゃいろ', stops: [[92, 62, 44], [140, 96, 66], [182, 132, 94], [234, 198, 160]] },
  black:  { name: 'くろ',     stops: [[40, 40, 52], [64, 64, 80], [94, 94, 112], [152, 156, 178]] },
  gold:   { name: 'きんいろ', stops: [[140, 100, 40], [212, 168, 80], [240, 208, 122], [255, 244, 202]] },
  red:    { name: 'あか',     stops: [[122, 48, 46], [190, 84, 74], [224, 124, 106], [255, 198, 178]] },
  silver: { name: 'ぎんいろ', stops: [[96, 98, 112], [160, 162, 176], [206, 207, 217], [250, 250, 255]] },
};
export const HAIR_COLOR_STOPS = [0, 0.35, 0.6, 1]; // 輪郭・影・基本・光沢 を当てる明るさの位置

/** 服（上下セット）。ねだんは ホームの data.js（WARDROBE_PRICES）で きめる */
export const OUTFITS = {
  'adventurer-a': { name: 'たんけんの ベスト', src: 'outfit_adventurer_a.webp' }, // 第2便
  'adventurer-b': { name: 'たんけんの ジャケット', src: 'outfit_adventurer_b.webp' }, // 第2便
  'casual-c':     { name: 'ふんわり パーカー', src: 'outfit_casual_c.webp' },      // 第3便
  'basic-d':      { name: 'ほしの Tシャツ', src: 'outfit_basic_d.webp' },          // 第4便
  'dress-e':      { name: 'ミントの ワンピース', src: 'outfit_dress_e.webp' },      // 第4便
  // 画像依頼セット01（2026-11-19）
  'coat-f':       { name: 'ダッフル コート', src: 'outfit_coat_f.webp' },
  'sports-h':     { name: 'スポーツ ウェア', src: 'outfit_sports_h.webp' },
  'yukata-g':     { name: 'ゆかた', src: 'outfit_yukata_g.webp' },
  'santa':        { name: 'サンタの ふく', src: 'outfit_santa.webp' },
  'spring':       { name: 'さくらいろの カーディガン', src: 'outfit_spring.webp' },
  'rain':         { name: 'レインコート', src: 'outfit_rain.webp' },
  'summer':       { name: 'なつの Tシャツ', src: 'outfit_summer.webp' },
  'autumn-knit':  { name: 'あきの ニット', src: 'outfit_autumn_knit.webp' },
  'setsubun':     { name: 'おにの ふく', src: 'outfit_setsubun.webp' },
  'reindeer':     { name: 'トナカイの セーター', src: 'outfit_reindeer.webp' },
  'hakama':       { name: 'はかま', src: 'outfit_hakama.webp' },
  'rq-explorer':  { name: 'たんけんかの ふく', src: 'outfit_rq_explorer.webp' },
  'rq-forest':    { name: 'もりの ぼうけんふく', src: 'outfit_rq_forest.webp' },
  'rq-autumn':    { name: 'こがらしの ぼうけんふく', src: 'outfit_rq_autumn.webp' },
  'rq-harvest':   { name: 'みのりの ぼうけんふく', src: 'outfit_rq_harvest.webp' },
  'rq-cosmic':    { name: 'うちゅうの ぼうけんふく', src: 'outfit_rq_cosmic.webp' },
  'rq-royal':     { name: 'おうさまの ぼうけんふく', src: 'outfit_rq_royal.webp' },
  'rq-legend':    { name: 'でんせつの ゆうしゃ', src: 'outfit_rq_legend.webp' },
  'rq-halloween': { name: 'まほうつかいの ふく', src: 'outfit_rq_halloween.webp' },
};

/** アクセサリー（上段の4コマだけ。歩くときは胸の動きに合わせて動く。at:'head' は 頭に合わせて動き、髪の 上に かさねる） */
export const ACCESSORIES = {
  'compass': { name: 'コンパスの ペンダント', src: 'accessory_compass.webp' }, // 第2便
  'scarf':   { name: 'マフラー', src: 'accessory_scarf.webp' },
  'cap':     { name: 'キャップ', src: 'accessory_cap.webp', at: 'head' },
  'glasses': { name: 'まるい めがね', src: 'accessory_glasses.webp', at: 'head' },
  'ribbon':  { name: 'リボン', src: 'accessory_ribbon.webp', at: 'head' },
  'santa-hat': { name: 'サンタの ぼうし', src: 'accessory_santa_hat.webp', at: 'head' },
  'kanzashi':  { name: 'かんざし', src: 'accessory_kanzashi.webp', at: 'head' },
  'halloween-hat': { name: 'まほうつかいの ぼうし', src: 'accessory_halloween_hat.webp', at: 'head' },
  'kabuto':     { name: 'しんぶんしの かぶと', src: 'accessory_kabuto.webp', at: 'head' },
  'strawhat':   { name: 'むぎわらぼうし', src: 'accessory_strawhat.webp', at: 'head' },
  'usamimi':    { name: 'うさみみ', src: 'accessory_usamimi.webp', at: 'head' },
  'oni':        { name: 'おにの つの', src: 'accessory_oni.webp', at: 'head' },
  'sakura-pin': { name: 'さくらの ヘアピン', src: 'accessory_sakura_pin.webp', at: 'head' },
  'heart':      { name: 'ハートの ブローチ', src: 'accessory_heart.webp' },
  'corsage':    { name: 'おはなの コサージュ', src: 'accessory_corsage.webp' },
};

/** profile.hero で null（まだ決めていない）のときに使う値 */
export const DEFAULTS = {
  gender: 'boy',
  hair: { boy: 'boy-01', girl: 'girl-01' },
  hairColor: 'brown',
  outfit: 'casual-c', // はじめの服（ただ）。肌着だけの すがたには しない
  accessory: null,
};
