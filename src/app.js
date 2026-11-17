const API_PATH = "/api/etfs";
const AUTO_REFRESH_MS = 60_000;
const PAGE_SIZE = 20;

const MARKET_META = {
  1: { name: "국내 시장지수", short: "국내 지수", color: "#00a86b" },
  2: { name: "국내 업종·테마", short: "업종·테마", color: "#2c6bed" },
  3: { name: "레버리지·인버스", short: "파생형", color: "#e5484d" },
  4: { name: "해외 주식", short: "해외 주식", color: "#7259e7" },
  5: { name: "원자재", short: "원자재", color: "#e18a21" },
  6: { name: "채권", short: "채권", color: "#2f9aa0" },
  7: { name: "혼합·기타", short: "혼합·기타", color: "#7e9e92" },
};

const ISSUER_NAMES = {
  KODEX: "삼성자산운용",
  TIGER: "미래에셋자산운용",
  RISE: "KB자산운용",
  ACE: "한국투자신탁운용",
  PLUS: "한화자산운용",
  SOL: "신한자산운용",
  KIWOOM: "키움투자자산운용",
  HANARO: "NH-Amundi자산운용",
  "1Q": "하나자산운용",
  KoAct: "삼성액티브자산운용",
  TIME: "타임폴리오자산운용",
  WON: "우리자산운용",
  에셋플러스: "에셋플러스자산운용",
  마이티: "DB자산운용",
  IBK: "IBK자산운용",
  BNK: "BNK자산운용",
  MIDAS: "마이다스에셋자산운용",
  FOCUS: "브이아이자산운용",
  HK: "흥국자산운용",
  파워: "교보악사자산운용",
  UNICORN: "현대자산운용",
  DAISHIN: "대신자산운용",
  DS: "DS자산운용",
  TREX: "유리자산운용",
  TRUSTON: "트러스톤자산운용",
  KCGI: "KCGI자산운용",
  아이엠에셋: "iM에셋자산운용",
  더제이: "더제이자산운용",
};

const state = {
  items: [],
  issuers: [],
  markets: [],
  loading: false,
  loadedOnce: false,
  sort: { key: "marketSum", direction: "desc" },
  page: 1,
  autoTimer: null,
  filters: { query: "", issuer: "", market: "", change: "" },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const nf = new Intl.NumberFormat("ko-KR");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function signed(value, digits = 2) {
  const number = toNumber(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}%`;
}

function changeClass(value) {
  const number = toNumber(value);
  return number > 0 ? "positive" : number < 0 ? "negative" : "neutral";
}

function formatMarketCap(value) {
  const eok = toNumber(value);
  if (eok >= 10_000) return `${(eok / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조원`;
  return `${nf.format(Math.round(eok))}억원`;
}

function formatAmount(value) {
  const millionWon = toNumber(value);
  if (millionWon >= 1_000_000) return `${(millionWon / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조원`;
  return `${(millionWon / 100).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억원`;
}

function formatPrice(value) {
  return `${nf.format(Math.round(toNumber(value)))}원`;
}

function average(items, key) {
  const values = items
    .map((item) => item[key])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function issuerBrand(name) {
  return String(name || "기타").trim().split(/\s+/)[0] || "기타";
}

function issuerName(brand) {
  return ISSUER_NAMES[brand] || `${brand} 브랜드`;
}

function normalizeItem(raw) {
  const brand = issuerBrand(raw.itemname);
  const marketCode = String(raw.etfTabCode || "7");
  return {
    itemcode: String(raw.itemcode || "").padStart(6, "0"),
    itemname: String(raw.itemname || "이름 없음"),
    etfTabCode: marketCode,
    nowVal: toNumber(raw.nowVal),
    risefall: String(raw.risefall || ""),
    changeVal: toNumber(raw.changeVal),
    changeRate: toNumber(raw.changeRate),
    nav: toNumber(raw.nav),
    threeMonthEarnRate: Number.isFinite(Number(raw.threeMonthEarnRate)) ? Number(raw.threeMonthEarnRate) : null,
    quant: toNumber(raw.quant),
    amonut: toNumber(raw.amonut),
    marketSum: toNumber(raw.marketSum),
    brand,
    issuer: issuerName(brand),
    market: MARKET_META[marketCode]?.name || "기타",
  };
}

function aggregateBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const groupKey = item[key];
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(item);
  }
  return [...groups.entries()].map(([name, groupItems]) => ({
    name,
    items: groupItems,
    count: groupItems.length,
    marketSum: groupItems.reduce((sum, item) => sum + item.marketSum, 0),
    amonut: groupItems.reduce((sum, item) => sum + item.amonut, 0),
    avgChange: average(groupItems, "changeRate"),
    avgThreeMonth: average(groupItems, "threeMonthEarnRate"),
  }));
}

function buildAggregates() {
  state.issuers = aggregateBy(state.items, "brand")
    .map((group) => ({ ...group, issuer: issuerName(group.name) }))
    .sort((a, b) => b.marketSum - a.marketSum);
  state.markets = aggregateBy(state.items, "etfTabCode")
    .map((group) => ({ ...group, code: group.name, ...MARKET_META[group.name] }))
    .sort((a, b) => Number(a.code) - Number(b.code));
}

function fetchEucKrJson(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${url}?_=${Date.now()}`, true);
    xhr.overrideMimeType("text/plain; charset=euc-kr");
    xhr.timeout = 20_000;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`데이터 서버 응답 오류 (${xhr.status})`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error("응답 데이터를 해석하지 못했습니다."));
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 연결을 확인해 주세요."));
    xhr.ontimeout = () => reject(new Error("데이터 요청 시간이 초과되었습니다."));
    xhr.send();
  });
}

async function loadData({ quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  $("#refreshButton").disabled = true;
  $("#refreshButton").classList.add("is-loading");
  if (!quiet && !state.loadedOnce) $("#loadingOverlay").classList.remove("is-hidden");

  try {
    const payload = await fetchEucKrJson(API_PATH);
    const rawItems = payload?.result?.etfItemList;
    if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error("ETF 항목이 없는 응답입니다.");

    state.items = rawItems.map(normalizeItem);
    buildAggregates();
    state.loadedOnce = true;
    state.page = 1;
    $("#errorBanner").hidden = true;
    $("#marketState").textContent = "실시간 데이터 연결됨";
    $("#updatedAt").textContent = new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(new Date());
    renderAll();
  } catch (error) {
    $("#marketState").textContent = "데이터 연결 오류";
    $("#errorMessage").textContent = error.message || "잠시 후 다시 시도해 주세요.";
    $("#errorBanner").hidden = false;
  } finally {
    state.loading = false;
    $("#refreshButton").disabled = false;
    $("#refreshButton").classList.remove("is-loading");
    $("#loadingOverlay").classList.add("is-hidden");
  }
}

function renderAll() {
  renderOverview();
  renderIssuerPage();
  renderMarketPage();
  populateFilters();
  renderProducts();
}

function renderOverview() {
  const totalMarketSum = state.items.reduce((sum, item) => sum + item.marketSum, 0);
  const totalAmount = state.items.reduce((sum, item) => sum + item.amonut, 0);
  const avgChange = average(state.items, "changeRate");
  const advancers = state.items.filter((item) => item.changeRate > 0).length;
  const decliners = state.items.filter((item) => item.changeRate < 0).length;
  const amountLeader = [...state.items].sort((a, b) => b.amonut - a.amonut)[0];

  $("#totalCount").textContent = `${nf.format(state.items.length)}개`;
  $("#issuerCount").textContent = `운용 브랜드 ${state.issuers.length}개`;
  $("#totalMarketCap").textContent = formatMarketCap(totalMarketSum);
  $("#totalAmount").textContent = formatAmount(totalAmount);
  $("#amountLeader").textContent = `거래대금 1위 ${amountLeader?.itemname || "—"}`;
  $("#averageChange").textContent = signed(avgChange);
  $("#averageChange").className = changeClass(avgChange);
  $("#advanceDecline").textContent = `상승 ${nf.format(advancers)} · 하락 ${nf.format(decliners)}`;

  renderIssuerShareChart();
  renderMarketDonut();
  renderRankList("#gainersList", [...state.items].sort((a, b) => b.changeRate - a.changeRate).slice(0, 5), "change");
  renderRankList("#volumeList", [...state.items].sort((a, b) => b.amonut - a.amonut).slice(0, 5), "amount");
}

function renderIssuerShareChart() {
  const top = state.issuers.slice(0, 7);
  const max = top[0]?.marketSum || 1;
  $("#issuerShareChart").innerHTML = top.map((issuer) => `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(issuer.name)}<small>${escapeHtml(issuer.issuer)}</small></span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, issuer.marketSum / max * 100).toFixed(1)}%"></div></div>
      <strong class="bar-value">${escapeHtml(formatMarketCap(issuer.marketSum))}</strong>
    </div>
  `).join("");
}

function renderMarketDonut() {
  const total = state.markets.reduce((sum, market) => sum + market.count, 0) || 1;
  let cursor = 0;
  const stops = state.markets.map((market) => {
    const start = cursor;
    cursor += market.count / total * 100;
    return `${market.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  $("#marketDonut").style.background = `conic-gradient(${stops.join(",")})`;
  $("#donutTotal").textContent = nf.format(total);
  $("#marketLegend").innerHTML = state.markets.map((market) => `
    <div class="legend-row">
      <i class="legend-dot" style="background:${market.color}"></i>
      <span>${escapeHtml(market.short)}</span>
      <strong>${market.count}개 · ${(market.count / total * 100).toFixed(1)}%</strong>
    </div>
  `).join("");
}

function renderRankList(selector, items, mode) {
  $(selector).innerHTML = items.map((item, index) => `
    <div class="rank-item" data-item-code="${escapeHtml(item.itemcode)}" tabindex="0" role="button" aria-label="${escapeHtml(item.itemname)} 상세 보기">
      <span class="rank-number">${index + 1}</span>
      <span class="rank-name">${escapeHtml(item.itemname)}<small>${escapeHtml(item.market)} · ${escapeHtml(item.itemcode)}</small></span>
      <strong class="rank-value ${mode === "change" ? changeClass(item.changeRate) : ""}">
        ${mode === "change" ? signed(item.changeRate) : formatAmount(item.amonut)}
      </strong>
    </div>
  `).join("");
}

function renderIssuerPage() {
  const totalMarketSum = state.issuers.reduce((sum, issuer) => sum + issuer.marketSum, 0) || 1;
  const leader = state.issuers[0];
  const productLeader = [...state.issuers].sort((a, b) => b.count - a.count)[0];
  const performanceLeader = [...state.issuers].sort((a, b) => b.avgThreeMonth - a.avgThreeMonth)[0];
  $("#issuerHighlights").innerHTML = `
    <article class="highlight-card"><span>시가총액 1위</span><strong>${escapeHtml(leader?.issuer || "—")}</strong><small>${escapeHtml(leader?.name || "")} · ${formatMarketCap(leader?.marketSum || 0)}</small></article>
    <article class="highlight-card"><span>상품 수 1위</span><strong>${escapeHtml(productLeader?.issuer || "—")}</strong><small>${escapeHtml(productLeader?.name || "")} · ${productLeader?.count || 0}개</small></article>
    <article class="highlight-card"><span>3개월 평균 수익률 1위</span><strong>${escapeHtml(performanceLeader?.issuer || "—")}</strong><small>${escapeHtml(performanceLeader?.name || "")} · ${signed(performanceLeader?.avgThreeMonth || 0)}</small></article>
  `;

  renderIssuerTable(totalMarketSum);
}

function renderIssuerTable(totalMarketSum = state.issuers.reduce((sum, issuer) => sum + issuer.marketSum, 0) || 1) {
  const query = $("#issuerSearch").value.trim().toLocaleLowerCase("ko-KR");
  const issuers = state.issuers.filter((issuer) => `${issuer.name} ${issuer.issuer}`.toLocaleLowerCase("ko-KR").includes(query));
  $("#issuerTableBody").innerHTML = issuers.length ? issuers.map((issuer) => {
    const share = issuer.marketSum / totalMarketSum * 100;
    return `
      <tr>
        <td><div class="issuer-cell"><span class="issuer-logo">${escapeHtml(issuer.name.slice(0, 5))}</span><span><strong>${escapeHtml(issuer.issuer)}</strong><small>${escapeHtml(issuer.name)}</small></span></div></td>
        <td class="numeric">${nf.format(issuer.count)}개</td>
        <td class="numeric"><strong>${escapeHtml(formatMarketCap(issuer.marketSum))}</strong></td>
        <td class="numeric share-cell"><span>${share.toFixed(1)}%</span><div class="mini-track"><i style="width:${Math.min(100, share).toFixed(1)}%"></i></div></td>
        <td class="numeric">${escapeHtml(formatAmount(issuer.amonut))}</td>
        <td class="numeric ${changeClass(issuer.avgChange)}">${signed(issuer.avgChange)}</td>
        <td class="numeric ${changeClass(issuer.avgThreeMonth)}">${signed(issuer.avgThreeMonth)}</td>
      </tr>`;
  }).join("") : `<tr><td class="empty-state" colspan="7">검색 결과가 없습니다.</td></tr>`;
}

function renderMarketPage() {
  $("#marketCards").innerHTML = state.markets.map((market) => `
    <article class="market-card" data-market-code="${market.code}" style="color:${market.color}" tabindex="0" role="button" aria-label="${escapeHtml(market.name)} 상품 보기">
      <div class="market-card-head"><strong>${escapeHtml(market.name)}</strong><span></span></div>
      <span class="market-card-value">${nf.format(market.count)}개</span>
      <small>${formatMarketCap(market.marketSum)} · 오늘 ${signed(market.avgChange)}</small>
    </article>
  `).join("");

  const topMarketSum = Math.max(...state.markets.map((market) => market.marketSum), 1);
  $("#marketCapChart").innerHTML = [...state.markets].sort((a, b) => b.marketSum - a.marketSum).map((market) => `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(market.name)}<small>${market.count}개 상품</small></span>
      <div class="bar-track"><div class="bar-fill" style="width:${(market.marketSum / topMarketSum * 100).toFixed(1)}%;background:${market.color}"></div></div>
      <strong class="bar-value">${escapeHtml(formatMarketCap(market.marketSum))}</strong>
    </div>
  `).join("");

  const maxPerformance = Math.max(...state.markets.flatMap((market) => [Math.abs(market.avgChange), Math.abs(market.avgThreeMonth)]), 1);
  $("#marketPerformance").innerHTML = state.markets.map((market) => {
    const width = Math.min(50, Math.abs(market.avgThreeMonth) / maxPerformance * 50);
    const direction = market.avgThreeMonth >= 0 ? "up" : "down";
    return `
      <div class="performance-row">
        <span>${escapeHtml(market.name)}</span>
        <div class="performance-axis"><i class="${direction}" style="width:${width.toFixed(1)}%"></i></div>
        <strong class="${changeClass(market.avgThreeMonth)}">${signed(market.avgThreeMonth)}</strong>
      </div>`;
  }).join("");
}

function populateFilters() {
  const issuerSelect = $("#issuerFilter");
  const currentIssuer = issuerSelect.value;
  issuerSelect.innerHTML = `<option value="">전체 운용사</option>${state.issuers.map((issuer) => `<option value="${escapeHtml(issuer.name)}">${escapeHtml(issuer.issuer)} (${escapeHtml(issuer.name)})</option>`).join("")}`;
  issuerSelect.value = currentIssuer;

  const marketSelect = $("#marketFilter");
  const currentMarket = marketSelect.value;
  marketSelect.innerHTML = `<option value="">전체 시장</option>${state.markets.map((market) => `<option value="${market.code}">${escapeHtml(market.name)}</option>`).join("")}`;
  marketSelect.value = currentMarket;
}

function filteredProducts() {
  const query = state.filters.query.trim().toLocaleLowerCase("ko-KR");
  const items = state.items.filter((item) => {
    if (query && !`${item.itemname} ${item.itemcode}`.toLocaleLowerCase("ko-KR").includes(query)) return false;
    if (state.filters.issuer && item.brand !== state.filters.issuer) return false;
    if (state.filters.market && item.etfTabCode !== state.filters.market) return false;
    if (state.filters.change === "up" && item.changeRate <= 0) return false;
    if (state.filters.change === "down" && item.changeRate >= 0) return false;
    if (state.filters.change === "flat" && item.changeRate !== 0) return false;
    return true;
  });

  const { key, direction } = state.sort;
  const multiplier = direction === "asc" ? 1 : -1;
  return items.sort((a, b) => {
    if (key === "itemname") return a.itemname.localeCompare(b.itemname, "ko") * multiplier;
    const left = a[key] ?? -Infinity;
    const right = b[key] ?? -Infinity;
    return (left - right) * multiplier;
  });
}

function renderProducts() {
  const items = filteredProducts();
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const pageItems = items.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  $("#resultCount").textContent = nf.format(items.length);
  $("#productTableBody").innerHTML = pageItems.length ? pageItems.map((item) => `
    <tr>
      <td><button class="product-name-button" type="button" data-item-code="${escapeHtml(item.itemcode)}"><strong>${escapeHtml(item.itemname)}</strong><small>${escapeHtml(item.itemcode)} · ${escapeHtml(item.issuer)}</small></button></td>
      <td><span class="market-pill">${escapeHtml(MARKET_META[item.etfTabCode]?.short || "기타")}</span></td>
      <td class="numeric"><strong>${escapeHtml(formatPrice(item.nowVal))}</strong></td>
      <td class="numeric ${changeClass(item.changeRate)}"><strong>${signed(item.changeRate)}</strong></td>
      <td class="numeric">${escapeHtml(formatMarketCap(item.marketSum))}</td>
      <td class="numeric">${escapeHtml(formatAmount(item.amonut))}</td>
      <td class="numeric ${changeClass(item.threeMonthEarnRate)}">${item.threeMonthEarnRate == null ? "—" : signed(item.threeMonthEarnRate)}</td>
    </tr>
  `).join("") : `<tr><td class="empty-state" colspan="7">조건에 맞는 ETF가 없습니다.</td></tr>`;
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pages = [];
  const start = Math.max(1, Math.min(state.page - 2, totalPages - 4));
  const end = Math.min(totalPages, Math.max(5, state.page + 2));
  pages.push(`<button type="button" data-product-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="이전 페이지">‹</button>`);
  if (start > 1) pages.push(`<button type="button" data-product-page="1">1</button>${start > 2 ? `<button type="button" disabled>…</button>` : ""}`);
  for (let page = start; page <= end; page += 1) {
    pages.push(`<button type="button" data-product-page="${page}" class="${page === state.page ? "is-active" : ""}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`);
  }
  if (end < totalPages) pages.push(`${end < totalPages - 1 ? `<button type="button" disabled>…</button>` : ""}<button type="button" data-product-page="${totalPages}">${totalPages}</button>`);
  pages.push(`<button type="button" data-product-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""} aria-label="다음 페이지">›</button>`);
  $("#pagination").innerHTML = pages.join("");
}

function showProduct(itemCode) {
  const item = state.items.find((candidate) => candidate.itemcode === itemCode);
  if (!item) return;
  const premium = item.nav ? (item.nowVal / item.nav - 1) * 100 : 0;
  $("#dialogContent").innerHTML = `
    <div class="dialog-hero">
      <small>${escapeHtml(item.issuer)} · ${escapeHtml(item.itemcode)}</small>
      <h2>${escapeHtml(item.itemname)}</h2>
      <p>${escapeHtml(item.market)}</p>
      <div class="dialog-price"><strong>${escapeHtml(formatPrice(item.nowVal))}</strong><span class="${changeClass(item.changeRate)}">${signed(item.changeRate)}</span></div>
    </div>
    <div class="dialog-body">
      <div class="dialog-metrics">
        <div class="dialog-metric"><span>NAV</span><strong>${escapeHtml(formatPrice(item.nav))}</strong></div>
        <div class="dialog-metric"><span>괴리율</span><strong class="${changeClass(premium)}">${signed(premium)}</strong></div>
        <div class="dialog-metric"><span>3개월 수익률</span><strong class="${changeClass(item.threeMonthEarnRate)}">${item.threeMonthEarnRate == null ? "—" : signed(item.threeMonthEarnRate)}</strong></div>
        <div class="dialog-metric"><span>시가총액</span><strong>${escapeHtml(formatMarketCap(item.marketSum))}</strong></div>
        <div class="dialog-metric"><span>거래대금</span><strong>${escapeHtml(formatAmount(item.amonut))}</strong></div>
        <div class="dialog-metric"><span>거래량</span><strong>${nf.format(item.quant)}주</strong></div>
      </div>
      <div class="dialog-actions">
        <a href="https://finance.naver.com/item/main.naver?code=${encodeURIComponent(item.itemcode)}" target="_blank" rel="noreferrer">네이버 금융에서 보기</a>
        <button type="button" data-dialog-close>닫기</button>
      </div>
    </div>`;
  $("#productDialog").showModal();
}

function switchPage(page, { focusHeading = false } = {}) {
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.page === page));
  $$("[data-page-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.pagePanel === page));
  history.replaceState(null, "", `#${page}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (focusHeading) $(`[data-page-panel="${page}"] h1`)?.focus?.();
}

function syncFilters() {
  state.filters.query = $("#productSearch").value;
  state.filters.issuer = $("#issuerFilter").value;
  state.filters.market = $("#marketFilter").value;
  state.filters.change = $("#changeFilter").value;
  state.page = 1;
  renderProducts();
}

function configureAutoRefresh() {
  clearInterval(state.autoTimer);
  state.autoTimer = null;
  if ($("#autoRefresh").checked) {
    state.autoTimer = setInterval(() => loadData({ quiet: true }), AUTO_REFRESH_MS);
  }
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchPage(button.dataset.page)));
  $$("[data-go-page]").forEach((button) => button.addEventListener("click", () => switchPage(button.dataset.goPage)));
  $("#refreshButton").addEventListener("click", () => loadData());
  $("#errorRetry").addEventListener("click", () => loadData());
  $("#autoRefresh").addEventListener("change", configureAutoRefresh);
  $("#issuerSearch").addEventListener("input", () => renderIssuerTable());
  ["#productSearch", "#issuerFilter", "#marketFilter", "#changeFilter"].forEach((selector) => {
    $(selector).addEventListener(selector === "#productSearch" ? "input" : "change", syncFilters);
  });
  $("#resetFilters").addEventListener("click", () => {
    $("#productSearch").value = "";
    $("#issuerFilter").value = "";
    $("#marketFilter").value = "";
    $("#changeFilter").value = "";
    syncFilters();
  });

  document.addEventListener("click", (event) => {
    const itemTarget = event.target.closest("[data-item-code]");
    if (itemTarget) showProduct(itemTarget.dataset.itemCode);

    const marketTarget = event.target.closest("[data-market-code]");
    if (marketTarget) {
      switchPage("products");
      $("#marketFilter").value = marketTarget.dataset.marketCode;
      syncFilters();
    }

    const pageTarget = event.target.closest("[data-product-page]");
    if (pageTarget && !pageTarget.disabled) {
      state.page = Number(pageTarget.dataset.productPage);
      renderProducts();
      $(".product-table-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const sortTarget = event.target.closest("[data-sort]");
    if (sortTarget) {
      const key = sortTarget.dataset.sort;
      state.sort.direction = state.sort.key === key && state.sort.direction === "desc" ? "asc" : "desc";
      state.sort.key = key;
      state.page = 1;
      $$(".sort-button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.sort === key);
        button.classList.toggle("is-asc", button.dataset.sort === key && state.sort.direction === "asc");
      });
      renderProducts();
    }

    if (event.target.matches("[data-dialog-close]")) $("#productDialog").close();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".rank-item, .market-card")) event.target.click();
  });
  $("#dialogClose").addEventListener("click", () => $("#productDialog").close());
  $("#productDialog").addEventListener("click", (event) => {
    if (event.target === $("#productDialog")) $("#productDialog").close();
  });
}

bindEvents();
configureAutoRefresh();
const initialPage = location.hash.slice(1);
if (["overview", "issuers", "markets", "products"].includes(initialPage)) switchPage(initialPage);
loadData();
