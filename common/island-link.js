// =====================================================================
// ハテナリア つなぎ口（island-link.js） 版 0.1.4
// ---------------------------------------------------------------------
// このかたまりを、各アプリの HTML の <script> の中にそのまま貼り付けて使う。
// ・島のフォルダに置いたとき … 共通部品を読み込み「連携モード」になる
// ・単独で開いたとき（Claudeのリンク、別のサイト、ファイルを直接開く）
//                              … 共通部品がないので「単独モード」になり、何もしない
//
// 使い方（例）
//   const island = await Island.init({ appId: 'keisan-1min', subject: 'math' });
//   if (island.connected) { ... 島につながっているときだけの処理 ... }
//   await Island.reward(3);                 // ひと区切りごとにコイン・素材
//   await Island.record({ minutes: 5 });    // 学習の要約
//   await Island.collect({ id: 'badge-keisan', name: 'けいさん バッジ', img: 'math/assets/island/badge_keisan.webp' }); // かざりだなへ
//   await Island.progress({ id: 'g1-add', name: 'たしざん', star: 1 }); // ☆＝1、★＝2（まなびの きろくへ）
//
// 単独モードでは reward / record は何もせず null を返し、isUnitOpen は常に true。
// loadState は undefined を返すので、アプリは今までどおり自分の保存を使う。
// =====================================================================
const Island = (() => {
  const I = {
    connected: false,
    book: null,
    profile: null,
    homeUrl: null,
    mode: null,   // 連携モードでは 'school'（クラスに入っている）か 'home'（自習）。単独モードでは null
    grade: null,  // 連携モードでは その冒険の書の学年（1〜6）。単独モードでは null（アプリが自分で決める）
    settings: null, // 連携モードでは 冒険の書の共通設定（読み上げ・ふりがな など）
    furigana: null, // 連携モードでは true／false（習った漢字にも ふりがなを付けるか）。単独モードでは null
    reward: async () => null,
    record: async () => null,
    collect: async () => false,  // 0.1.4
    progress: async () => false, // 0.1.4
    wallet: async () => null,
    isUnitOpen: async () => true,
    loadState: async () => undefined,
    saveState: async () => false,
  };

  /**
   * @param {object} opt
   * @param {string} opt.appId     アプリの名前（半角英小文字・数字・ハイフン）
   * @param {string} opt.subject   教科（math, rika, kokugo, shakai, eigo など）
   * @param {string} [opt.commonPath='../common/']  このアプリから見た共通部品の場所
   * @param {boolean} [opt.homeButton=true]        連携モードで「ホームに かえる」ボタンを出す
   */
  I.init = async ({ appId, subject, commonPath = '../common/', homeButton = true } = {}) => {
    if (!/^https?:$/.test(location.protocol)) { console.info('[学習アイランド] 単独モード'); return I; }
    try {
      const api = await import(new URL(commonPath + 'island-api.js', location.href).href);
      const c = await api.connect({ appId, subject });
      if (!c) return I; // ホームへ移動中
      Object.assign(I, c, { connected: true });
      if (homeButton) {
        const b = document.createElement('a');
        b.href = c.homeUrl;
        b.textContent = '🏝 ホームに かえる';
        b.setAttribute('data-island', 'home');
        b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9000;min-height:60px;display:flex;align-items:center;'
          + 'padding:0 18px;border-radius:16px;background:#ffd66b;color:#3a3226;font-size:20px;font-weight:bold;'
          + 'text-decoration:none;box-shadow:0 4px 0 #d9a93a;font-family:inherit;touch-action:manipulation';
        b.addEventListener('focus', () => { b.style.outline = '5px solid #3b82f6'; b.style.outlineOffset = '4px'; });
        b.addEventListener('blur', () => { b.style.outline = 'none'; });
        document.body.append(b);
      }
      console.info(`[学習アイランド] 連携モード（冒険の書 ${c.book.id}、共通部品 ${c.version}）`);
    } catch (e) {
      console.info('[学習アイランド] 単独モード', e && e.message ? `（${e.message}）` : '');
    }
    return I;
  };
  return I;
})();
