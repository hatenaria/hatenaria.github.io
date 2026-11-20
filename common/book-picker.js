// 学習アイランド 共通部品：冒険の書を選ぶ画面（book-picker.js）
// showPicker({ mode: 'select' })  … 各島用。選ぶだけ。0冊ならホームへ案内
// showPicker({ mode: 'manage' })  … ホーム用。作る・消す・選ぶ
// 戻り値：選ばれた冒険の書 {id, name, createdAt}（ホームへ移るときは null）

import * as books from './books.js?v=0.16.2';

const CSS = `
.gi-picker{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:rgba(40,60,90,.55);font-family:"Hiragino Maru Gothic ProN","BIZ UDPGothic","Meiryo",sans-serif}
.gi-card{background:#fffaf0;border-radius:24px;padding:28px 32px;width:min(560px,92vw);max-height:92vh;overflow:auto;
  box-shadow:0 12px 40px rgba(0,0,0,.25);color:#3a3226}
.gi-card h2{margin:0 0 18px;font-size:28px;text-align:center;letter-spacing:.08em}
.gi-list{display:flex;flex-direction:column;gap:14px}
.gi-row{display:flex;gap:10px}
.gi-btn{min-height:64px;min-width:64px;border:none;border-radius:16px;font-size:24px;font-family:inherit;cursor:pointer;
  padding:0 20px;background:#ffd66b;color:#3a3226;box-shadow:0 4px 0 #d9a93a}
.gi-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #d9a93a}
.gi-btn:focus-visible,.gi-btn:focus{outline:4px solid #3b82f6;outline-offset:3px}
.gi-book{flex:1;text-align:left;background:#fff;box-shadow:0 4px 0 #c9bfae;border:3px solid #e9dfcc}
.gi-del{background:#f3d3cf;box-shadow:0 4px 0 #c99a94;font-size:20px}
.gi-new{background:#9be3a8;box-shadow:0 4px 0 #5fb06d}
.gi-msg{font-size:22px;line-height:1.7;text-align:left;width:fit-content;max-width:100%;margin:8px auto 18px;word-break:keep-all;overflow-wrap:anywhere;line-break:strict}
.gi-card h2,.gi-note,.gi-btn{word-break:keep-all;overflow-wrap:anywhere}
@media (max-width:700px){.gi-card{padding:20px 18px}.gi-card h2{font-size:23px}.gi-btn{font-size:19px;min-height:56px}.gi-msg{font-size:18px}}
.gi-err{color:#b3261e;font-size:20px;min-height:1.5em;text-align:center}
.gi-input{width:100%;box-sizing:border-box;font-size:26px;padding:12px 16px;border-radius:14px;border:3px solid #e9dfcc;font-family:inherit}
.gi-note{font-size:16px;color:#7a6e5d;text-align:center;margin-top:16px}
.gi-grades{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:6px 0 18px}
.gi-grade{min-height:76px;font-size:28px;background:#fff;box-shadow:0 4px 0 #c9bfae;border:3px solid #e9dfcc}
`;

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

/**
 * @param {object} opt
 * @param {'select'|'manage'} [opt.mode='select']
 * @param {string} [opt.homeUrl]  冒険の書が0冊のときに案内するホームの場所
 */
export function showPicker({ mode = 'select', homeUrl = null } = {}) {
  return new Promise((resolve) => {
    if (!document.getElementById('gi-picker-style')) {
      document.head.append(el('style', { id: 'gi-picker-style' }, CSS));
    }
    const root = el('div', { class: 'gi-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ぼうけんの しょを えらぶ' });
    const card = el('div', { class: 'gi-card' });
    root.append(card);
    document.body.append(root);

    let onBack = null; // Esc で戻る先（一覧では null）
    const focusables = () => [...card.querySelectorAll('button:not([disabled]), input')];
    // キー操作：↑↓←→ で選ぶ／Enter で決定（ボタンの標準の動き）／Esc で一つ前へ
    const onKey = (e) => {
      if (e.key === 'Escape' && onBack) { e.preventDefault(); onBack(); return; }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (document.activeElement?.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // 文字入力中のカーソル移動
      e.preventDefault();
      const f = focusables();
      if (!f.length) return;
      let i = f.indexOf(document.activeElement);
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      i = i < 0 ? 0 : (i + (back ? -1 : 1) + f.length) % f.length;
      f[i].focus();
    };
    document.addEventListener('keydown', onKey);
    const close = (value) => { document.removeEventListener('keydown', onKey); root.remove(); resolve(value); };

    async function renderList() {
      const list = await books.listBooks(); // 先に読んでから描く（空の枠が一瞬出ないように）
      card.replaceChildren();
      card.append(el('h2', {}, 'ぼうけんの しょ'));

      if (list.length === 0 && mode === 'select') {
        card.append(el('p', { class: 'gi-msg' }, 'まだ ぼうけんの しょが ないよ。', el('br'), 'ホームで つくろう。'));
        if (homeUrl) card.append(el('div', { class: 'gi-row', style: 'justify-content:center' },
          el('button', { class: 'gi-btn gi-new', onclick: () => { location.href = homeUrl; close(null); } }, 'ホームへ いく')));
        card.querySelector('button')?.focus();
        return;
      }

      const box = el('div', { class: 'gi-list' });
      for (const b of list) {
        const row = el('div', { class: 'gi-row' },
          el('button', { class: 'gi-btn gi-book', 'data-book': b.id, onclick: async () => { await books.setCurrent(b.id); close(b); } }, `📖 ${b.name}`));
        if (mode === 'manage') row.append(el('button', { class: 'gi-btn gi-del', 'aria-label': `${b.name}を けす`, onclick: () => renderDelete(b) }, 'けす'));
        box.append(row);
      }
      if (mode === 'manage' && list.length < books.MAX_BOOKS) {
        box.append(el('button', { class: 'gi-btn gi-new', 'data-action': 'new', onclick: renderCreate }, '＋ あたらしく つくる'));
      }
      card.append(box);
      card.append(el('p', { class: 'gi-note' }, 'なまえは ほんとうの なまえではなく、ニックネームに しよう'));
      onBack = null;
      card.querySelector('.gi-book, [data-action=new]')?.focus();
    }

    function renderCreate() {
      card.replaceChildren();
      const input = el('input', { class: 'gi-input', maxlength: String(books.NAME_MAX), 'aria-label': 'ニックネーム', placeholder: 'ニックネーム' });
      const err = el('p', { class: 'gi-err' });
      const submit = () => {
        try { books.cleanName(input.value); } catch (e) { err.textContent = e.message; return; }
        renderGrade(input.value);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); } });
      card.append(
        el('h2', {}, 'あたらしい ぼうけんの しょ'),
        el('p', { class: 'gi-msg' }, 'ニックネームを いれてね（10もじ まで）'),
        input, err,
        el('div', { class: 'gi-row', style: 'justify-content:space-between' },
          el('button', { class: 'gi-btn', onclick: renderList }, 'もどる'),
          el('button', { class: 'gi-btn gi-new', 'data-action': 'create', onclick: submit }, 'つくる')),
      );
      input.focus();
      onBack = renderList;
    }

    // 学年を えらぶ（つぎの画面）
    function renderGrade(name) {
      card.replaceChildren();
      const err = el('p', { class: 'gi-err' });
      const pick = async (g) => {
        try {
          const b = await books.createBook(name, g);
          await books.setCurrent(b.id);
          close(b);
        } catch (e) { err.textContent = e.message; }
      };
      const grid = el('div', { class: 'gi-grades' },
        ...books.GRADES.map((g) => el('button', { class: 'gi-btn gi-grade', 'data-grade': String(g), onclick: () => pick(g) }, `${g}ねんせい`)));
      card.append(
        el('h2', {}, 'なんねんせい？'),
        el('p', { class: 'gi-msg' }, 'いまの がくねんを えらんでね。'),
        grid, err,
        el('div', { class: 'gi-row' }, el('button', { class: 'gi-btn', onclick: renderCreate }, 'もどる')),
      );
      // 名前の Enter がそのまま学年ボタンを押さないよう、次の瞬間に選ぶ
      setTimeout(() => grid.querySelector('button').focus(), 0);
      onBack = renderCreate;
    }

    function renderDelete(b) {
      card.replaceChildren(
        el('h2', {}, 'ほんとうに けす？'),
        el('p', { class: 'gi-msg' }, `「${b.name}」の ぼうけんの しょを けすと、`, el('br'), 'がくしゅうの きろくも ぜんぶ きえるよ。'),
        el('div', { class: 'gi-row', style: 'justify-content:space-between' },
          el('button', { class: 'gi-btn', onclick: renderList }, 'けさない'),
          el('button', { class: 'gi-btn gi-del', 'data-action': 'confirm-delete', onclick: async () => { await books.deleteBook(b.id); renderList(); } }, 'けす')),
      );
      card.querySelector('.gi-btn')?.focus(); // 安全な「けさない」を先に選んでおく
      onBack = renderList;
    }

    renderList();
  });
}
