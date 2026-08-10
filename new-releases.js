// ===== 新刊リスト（発売中／発売予定タブ） =====
// 出版社別に発売日順（未来→過去）でAPIを取得し、今日を境に
//   発売中   … 発売済み。新しい順（今日に近い順）
//   発売予定 … これから発売。発売日が近い順
// の2タブに振り分ける。取得は段階的（ページごとに再描画）。

const NR_PUBLISHERS = ['集英社', '小学館', '講談社'];
const MAX_PAGES_PER_PUB = 8;
// 「発売中」でさかのぼる下限（今日から何日前まで載せるか）
const ONSALE_DAYS_BACK = 60;

let nrEntries = [];            // { item, time, label, exact }
let nrSeenIsbn = new Set();
let nrTab = 'onsale';
let nrLoading = true;

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

function onsaleCutoff() {
    return startOfToday() - ONSALE_DAYS_BACK * 86400000;
}

// "2026年07月04日" / "2026年07月上旬" などをパース。
// 日が無いものは 上旬=5 / 中旬=15 / 下旬=25（表記なしは15）で仮置きし、exact:false を立てる
function parseSalesDate(str) {
    if (!str) return null;
    const m = str.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
    if (!m) return null;
    const y = parseInt(m[1]);
    const mo = parseInt(m[2]);
    if (m[3]) return { y: y, mo: mo, d: parseInt(m[3]), exact: true, part: '' };
    const part = str.includes('上旬') ? '上旬' : str.includes('中旬') ? '中旬' : str.includes('下旬') ? '下旬' : '';
    const d = part === '上旬' ? 5 : part === '下旬' ? 25 : 15;
    return { y: y, mo: mo, d: d, exact: false, part: part };
}

// 日付見出しのラベル（同じ文字列の行がひとかたまりになる）
function dateLabel(dt) {
    if (!dt.exact) return `${dt.y}年${dt.mo}月${dt.part || '中'}`;
    const dow = DOW[new Date(dt.y, dt.mo - 1, dt.d).getDay()];
    return `${dt.y}年${dt.mo}月${dt.d}日（${dow}）`;
}

// 取り込み済みリストに追加。追加できたら true
function addEntry(item) {
    const dt = parseSalesDate(item.firstReleaseDate);
    if (!dt) return false;
    // 「3099年」などのダミー日付を除外
    if (dt.y > new Date().getFullYear() + 1) return false;
    if (item.isbn) {
        if (nrSeenIsbn.has(item.isbn)) return false;
        nrSeenIsbn.add(item.isbn);
    }
    const time = new Date(dt.y, dt.mo - 1, dt.d).getTime();
    // 発売中の下限より古いものは持たない
    if (time < onsaleCutoff()) return false;
    nrEntries.push({ item: item, time: time, label: dateLabel(dt), exact: dt.exact });
    return true;
}

async function fetchReleases() {
    const cutoff = onsaleCutoff();
    for (const pub of NR_PUBLISHERS) {
        for (let page = 1; page <= MAX_PAGES_PER_PUB; page++) {
            try {
                const data = await cachedFetch(`/api/books?genre=001001&publisher=${encodeURIComponent(pub)}&hits=30&sort=-releaseDate&page=${page}`);
                const adapted = adaptApiResponse(data);
                let added = false;
                let oldest = null;
                adapted.items.forEach(item => {
                    if (addEntry(item)) added = true;
                    const dt = parseSalesDate(item.firstReleaseDate);
                    if (dt && dt.y <= new Date().getFullYear() + 1) {
                        const t = new Date(dt.y, dt.mo - 1, dt.d).getTime();
                        if (oldest === null || t < oldest) oldest = t;
                    }
                });
                if (added) renderList();
                // 下限までさかのぼれたら、この出版社は取得完了
                if (oldest !== null && oldest < cutoff) break;
                if (page >= (data.pageCount || 1)) break;
            } catch (e) {
                console.warn('新刊取得失敗:', pub, e);
                break;
            }
            await new Promise(r => setTimeout(r, 250));
        }
    }
    nrLoading = false;
    renderList();
}

// 表示中のタブに該当する行を、タブごとの並び順で返す
function entriesForTab(tab) {
    const today = startOfToday();
    const list = nrEntries.filter(e => tab === 'upcoming' ? e.time > today : e.time <= today);
    // 発売中＝新しい順（今日に近い順）／発売予定＝発売日が近い順
    list.sort((a, b) => tab === 'upcoming' ? a.time - b.time : b.time - a.time);
    return list;
}

function releaseRow(item) {
    const cover = item.imageUrl
        ? `<img src="${withRakutenSize(item.imageUrl, 320)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';
    const price = item.price ? `${Number(item.price).toLocaleString()}円` : '';
    return `<div class="nr-row" data-isbn="${item.isbn || ''}" data-title="${(item.title || '').replace(/"/g, '&quot;')}">
        <div class="nr-row-cover">${cover}</div>
        <div class="nr-row-info">
            <div class="nr-row-title">${item.title}</div>
            <div class="nr-row-sub">${item.author || ''}</div>
            <div class="nr-row-meta">${item.publisher || ''}${item.label ? ' / ' + item.label : ''}${price ? ' / ' + price : ''}</div>
        </div>
    </div>`;
}

function renderList() {
    const list = document.getElementById('nr-list');
    const entries = entriesForTab(nrTab);

    if (entries.length === 0) {
        list.innerHTML = nrLoading
            ? ''
            : `<p class="nr-empty">${nrTab === 'upcoming' ? '発売予定の新刊はありません' : '発売中の新刊はありません'}</p>`;
        return;
    }

    // 発売日ごとに見出しを立てて並べる
    let html = '';
    let currentLabel = null;
    entries.forEach(e => {
        if (e.label !== currentLabel) {
            currentLabel = e.label;
            html += `<h4 class="nr-date-head">${e.label}</h4>`;
        }
        html += releaseRow(e.item);
    });
    list.innerHTML = html;

    // 新刊は「その巻そのもの」なので、シリーズページではなく巻ページへ飛ばす
    list.querySelectorAll('.nr-row').forEach(row => {
        row.addEventListener('click', () => {
            const title = row.dataset.title;
            const isbn = row.dataset.isbn;
            const series = extractSeriesName(title);
            window.location.href = `volume.html?isbn=${isbn}&title=${encodeURIComponent(title)}&series=${encodeURIComponent(series)}`;
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nr-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            if (nrTab === btn.dataset.tab) return;
            nrTab = btn.dataset.tab;
            document.querySelectorAll('.nr-tab').forEach(b => {
                const on = b.dataset.tab === nrTab;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            renderList();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
    renderList();
    fetchReleases();
});
