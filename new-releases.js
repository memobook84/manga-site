// ===== 発売日カレンダー =====
// 出版社別に発売日順（未来→過去）でAPIを取得し、日付ごとにバケット分けして
// カレンダー表示する。取得は段階的（ページごとに再描画）で、今月の頭まで
// さかのぼれたら打ち切る。

const CAL_PUBLISHERS = ['集英社', '小学館', '講談社'];
const MAX_PAGES_PER_PUB = 6;

let calBuckets = {};   // 'y-m-d' -> [items]（日付確定分）
let calUnknown = {};   // 'y-m'   -> [items]（「上旬」「頃」など日付未定分）
let calSeenIsbn = new Set();
let calYear = 0;
let calMonth = 0;      // 1-12
let calSelectedDay = null;
let calLoading = true;

// "2026年07月04日" / "2026年07月上旬" などをパース（日が無ければ d: null）
function parseSalesDate(str) {
    if (!str) return null;
    const m = str.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
    if (!m) return null;
    return { y: parseInt(m[1]), mo: parseInt(m[2]), d: m[3] ? parseInt(m[3]) : null };
}

// アイテムをバケットに追加。表示中の月に該当したら true
function bucketItem(item) {
    const dt = parseSalesDate(item.firstReleaseDate);
    if (!dt) return false;
    // 「3099年」などのダミー日付を除外
    if (dt.y > new Date().getFullYear() + 1) return false;
    if (item.isbn) {
        if (calSeenIsbn.has(item.isbn)) return false;
        calSeenIsbn.add(item.isbn);
    }
    const key = dt.d ? `${dt.y}-${dt.mo}-${dt.d}` : `${dt.y}-${dt.mo}`;
    const bucket = dt.d ? calBuckets : calUnknown;
    (bucket[key] = bucket[key] || []).push(item);
    return dt.y === calYear && dt.mo === calMonth;
}

async function fetchCalendarData() {
    const monthStart = new Date(calYear, calMonth - 1, 1);
    for (const pub of CAL_PUBLISHERS) {
        for (let page = 1; page <= MAX_PAGES_PER_PUB; page++) {
            try {
                const data = await cachedFetch(`/api/books?genre=001001&publisher=${encodeURIComponent(pub)}&hits=30&sort=-releaseDate&page=${page}`);
                const adapted = adaptApiResponse(data);
                let touchedView = false;
                let oldest = null;
                adapted.items.forEach(item => {
                    if (bucketItem(item)) touchedView = true;
                    const dt = parseSalesDate(item.firstReleaseDate);
                    if (dt && dt.y <= new Date().getFullYear() + 1) {
                        const d = new Date(dt.y, dt.mo - 1, dt.d || 28);
                        if (!oldest || d < oldest) oldest = d;
                    }
                });
                if (touchedView) renderCalendar();
                // 今月の頭までさかのぼれたら、この出版社は取得完了
                if (oldest && oldest < monthStart) break;
                if (page >= (data.pageCount || 1)) break;
            } catch (e) {
                console.warn('新刊取得失敗:', pub, e);
                break;
            }
            await new Promise(r => setTimeout(r, 250));
        }
    }
    calLoading = false;
    document.getElementById('cal-loading').style.display = 'none';
    renderCalendar();
}

function itemsForDay(y, mo, d) {
    return calBuckets[`${y}-${mo}-${d}`] || [];
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-title');
    title.textContent = `${calYear}年${calMonth}月`;

    // 今月が下限なので、今月を表示中は「前の月」を無効化
    const prevBtn = document.getElementById('cal-prev');
    if (prevBtn) prevBtn.disabled = monthIndex(calYear, calMonth) <= currentMonthIndex();

    const firstDow = new Date(calYear, calMonth - 1, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const today = new Date();
    const isThisMonth = today.getFullYear() === calYear && (today.getMonth() + 1) === calMonth;

    let html = '';
    for (let i = 0; i < firstDow; i++) {
        html += '<div class="cal-cell cal-cell-empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const items = itemsForDay(calYear, calMonth, d);
        const dow = (firstDow + d - 1) % 7;
        const classes = ['cal-cell'];
        if (items.length > 0) classes.push('has-releases');
        if (isThisMonth && today.getDate() === d) classes.push('cal-today');
        if (calSelectedDay === d) classes.push('cal-selected');
        if (dow === 0) classes.push('cal-sun');
        if (dow === 6) classes.push('cal-sat');

        let coverHtml = '';
        if (items.length > 0) {
            const first = items.find(it => it.imageUrl) || items[0];
            if (first.imageUrl) {
                coverHtml = `<img class="cal-cover" src="${withRakutenSize(first.imageUrl, 120)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
            }
            if (items.length > 1) {
                coverHtml += `<span class="cal-count">+${items.length - 1}</span>`;
            }
        }
        html += `<div class="${classes.join(' ')}" data-day="${d}">
            <span class="cal-daynum">${d}</span>
            ${coverHtml}
        </div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-cell[data-day]').forEach(cell => {
        cell.addEventListener('click', () => {
            const d = parseInt(cell.dataset.day);
            calSelectedDay = (calSelectedDay === d) ? null : d;
            renderCalendar();
        });
    });

    renderDayPanel();
    renderUnknown();
}

function releaseRow(item) {
    const cover = item.imageUrl
        ? `<img src="${withRakutenSize(item.imageUrl, 160)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';
    const price = item.price ? `${Number(item.price).toLocaleString()}円` : '';
    return `<div class="cal-release-row" data-isbn="${item.isbn || ''}" data-title="${(item.title || '').replace(/"/g, '&quot;')}">
        <div class="cal-release-cover">${cover}</div>
        <div class="cal-release-info">
            <div class="cal-release-title">${item.title}</div>
            <div class="cal-release-sub">${item.author || ''}</div>
            <div class="cal-release-meta">${item.publisher || ''}${item.label ? ' / ' + item.label : ''}${price ? ' / ' + price : ''}</div>
        </div>
        <div class="cal-release-date">${item.firstReleaseDate || ''}</div>
    </div>`;
}

function bindReleaseRows(container) {
    container.querySelectorAll('.cal-release-row').forEach(row => {
        row.addEventListener('click', () => {
            const title = row.dataset.title;
            const isbn = row.dataset.isbn;
            window.location.href = `detail.html?isbn=${isbn}&title=${encodeURIComponent(title)}`;
        });
    });
}

function renderDayPanel() {
    const panel = document.getElementById('cal-day-panel');
    if (calSelectedDay === null) {
        const monthHasData = Object.keys(calBuckets).some(k => k.startsWith(`${calYear}-${calMonth}-`)) ||
                             calUnknown[`${calYear}-${calMonth}`];
        if (!calLoading && !monthHasData) {
            panel.innerHTML = '<p class="cal-hint">この月の新刊データはありません（取得範囲は今月以降です）</p>';
        } else {
            panel.innerHTML = '<p class="cal-hint">日付をタップするとその日の新刊が表示されます</p>';
        }
        return;
    }
    const items = itemsForDay(calYear, calMonth, calSelectedDay);
    let html = `<h4 class="cal-panel-title">${calMonth}月${calSelectedDay}日の新刊 <span class="cal-panel-count">${items.length}冊</span></h4>`;
    if (items.length === 0) {
        html += '<p class="cal-hint">この日の新刊はありません</p>';
    } else {
        html += items.map(releaseRow).join('');
    }
    panel.innerHTML = html;
    bindReleaseRows(panel);
}

function renderUnknown() {
    const box = document.getElementById('cal-unknown');
    const items = calUnknown[`${calYear}-${calMonth}`] || [];
    if (items.length === 0) {
        box.innerHTML = '';
        return;
    }
    box.innerHTML = `<h4 class="cal-panel-title">日付未定（${calMonth}月中）</h4>` + items.map(releaseRow).join('');
    bindReleaseRows(box);
}

// 年月を比較用の通し番号に（2026年8月 → 24320）
function monthIndex(y, mo) {
    return y * 12 + mo;
}

function currentMonthIndex() {
    const now = new Date();
    return monthIndex(now.getFullYear(), now.getMonth() + 1);
}

function moveMonth(delta) {
    let y = calYear;
    let m = calMonth + delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    // APIの取得範囲が今月以降なので、先月より前には戻さない
    if (monthIndex(y, m) < currentMonthIndex()) return;
    calYear = y;
    calMonth = m;
    calSelectedDay = null;
    renderCalendar();
}

window.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth() + 1;
    document.getElementById('cal-prev').addEventListener('click', () => moveMonth(-1));
    document.getElementById('cal-next').addEventListener('click', () => moveMonth(1));
    renderCalendar();
    fetchCalendarData();
});
