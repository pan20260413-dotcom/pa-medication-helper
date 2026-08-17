/* ==========================================================================
   PA 臨床藥物影響助手 - 核心邏輯 (包含 Base64 100% 圖片顯示、繁體中文注音 IME 輸入優化、Exforge 拆解與 PA/ARR 研究工具)
   ========================================================================== */

const app = document.querySelector('#app');
const mainNav = document.querySelector('#main-nav');
const modalOverlay = document.querySelector('#image-modal-overlay');
const modalCloseBtn = document.querySelector('#modal-close-btn');
const modalContent = document.querySelector('#modal-content');

let medications = [];
let selectedCategories = 'ALL';
let searchTerm = '';
let calculatorSelectedIds = new Set(['spironolactone', 'bisoprolol']);
let researchSelectedIds = new Set(['bisoprolol', 'valsartan']);

// 研究版試算欄位
let researchPac = 15;
let researchPra = 0.5;

let compareDrugA = 'valsartan';
let compareDrugB = 'amlodipine';

// 轉義 HTML
const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

/* ==========================================================================
   彈窗大圖檢視 (Modal Viewer)
   ========================================================================== */

function openImageModal(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med || !modalOverlay || !modalContent) return;

  modalContent.innerHTML = `
    <div style="text-align:center;">
      <span style="font-size:0.78rem;font-weight:800;color:var(--primary);background:var(--primary-soft);padding:0.25rem 0.65rem;border-radius:4px;">
        ${escapeHtml(med.category_name_zh || med.category)}
      </span>
      <h2 style="font-size:1.6rem;font-weight:900;color:var(--primary-dark);margin-top:0.35rem;">
        ${escapeHtml(med.generic_name)}
      </h2>
      <div style="font-size:1rem;color:var(--text-body);font-weight:700;">
        ${escapeHtml(med.localized_names ? med.localized_names.join(' / ') : '')}
      </div>
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;">
        台灣常見商品名：${escapeHtml(med.brand_names ? med.brand_names.join(', ') : '')}
      </div>

      <div style="background:#ffffff;border:2px solid var(--border);border-radius:12px;padding:1.25rem;margin-bottom:1rem;display:grid;place-items:center;">
        <img src="${escapeHtml(med.image)}" alt="${escapeHtml(med.generic_name)}" style="max-width:100%;height:auto;max-height:260px;object-fit:contain;border-radius:8px;box-shadow:var(--shadow-sm);" />
      </div>

      <div style="text-align:left;background:var(--primary-soft);border:1px solid #bfdbfe;border-radius:8px;padding:0.85rem 1rem;font-size:0.88rem;">
        <strong style="color:var(--primary-dark);">💊 藥物實體外觀特徵標示：</strong>
        <p style="color:var(--text-body);margin-top:0.25rem;">${escapeHtml(med.pill_appearance || '請對照原廠藥盒與藥錠號碼')}</p>
      </div>

      ${med.is_combination ? `
        <div style="margin-top:0.75rem;text-align:left;background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:0.75rem 1rem;font-size:0.85rem;color:#713f12;">
          <strong>🧪 複方成分拆解與說明：</strong>
          <div style="margin-top:0.25rem;">
            <strong>包含成分：</strong>${escapeHtml(med.combination_components)}<br>
            <strong>成分分類：</strong>${escapeHtml(med.combination_categories)}<br>
            <strong>臨床評估：</strong>${escapeHtml(med.combination_notes)}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  modalOverlay.style.display = 'grid';
}

if (modalCloseBtn && modalOverlay) {
  modalCloseBtn.addEventListener('click', () => { modalOverlay.style.display = 'none'; });
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.style.display = 'none';
  });
}

function updateNavActive(routeName) {
  if (!mainNav) return;
  mainNav.querySelectorAll('.nav-item').forEach(el => {
    if (el.dataset.route === routeName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function getArrBadge(med) {
  if (med.is_preferred_for_pa_screening) {
    return `<span class="arr-impact-badge arr-impact-badge--preferred">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      影響極小／洗脫期首選控壓藥
    </span>`;
  }
  if (med.arr_effect_type === 'false_positive') {
    return `<span class="arr-impact-badge arr-impact-badge--fp">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      可能造成 ARR 偏高 (假陽性)
    </span>`;
  }
  return `<span class="arr-impact-badge arr-impact-badge--fn">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    可能造成 ARR 偏低 (假陰性)
  </span>`;
}

/* ==========================================================================
   ROUTE 1: HOME PORTAL (首頁 - 支援 100% 繁體中文 IME 輸入)
   ========================================================================== */

function getFilteredMedications() {
  const term = searchTerm.trim().toLowerCase();
  return medications.filter(med => {
    const matchesCat = selectedCategories === 'ALL' || 
      (selectedCategories === 'Diuretics' && (med.category.includes('diuretics') || med.category.includes('Diuretic'))) ||
      med.category === selectedCategories;

    const searchables = [
      med.generic_name,
      ...(med.localized_names || []),
      ...(med.brand_names || []),
      med.pill_appearance || '',
      med.combination_components || '',
      med.combination_categories || '',
      med.category,
      med.mechanism
    ].join(' ').toLowerCase();

    return matchesCat && (!term || searchables.includes(term));
  });
}

function renderMedicationCardsHtml(filteredList) {
  if (!filteredList.length) {
    return `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;background:#ffffff;border-radius:10px;border:1px solid var(--border);">
        <p style="font-size:1.1rem;color:var(--text-muted);">🔍 找不到符合「${escapeHtml(searchTerm)}」的藥物資料</p>
        <p style="font-size:0.85rem;color:var(--text-light);margin-top:0.25rem;">請嘗試搜尋商品名 (如 Exforge 易安穩, Diovan 代文, Norvasc 脈優, 博脈舒, 優力莎, 安脈, 落沙, 卡杜特)。</p>
      </div>
    `;
  }

  return filteredList.map(med => `
    <article class="med-p-card">
      <div class="med-p-card__top">
        <div class="med-p-card__pill-icon" data-zoom-id="${med.id}" title="點擊檢視大圖外觀包裝">
          <img src="${escapeHtml(med.image)}" alt="${escapeHtml(med.generic_name)}" />
        </div>
        <div class="med-p-card__names">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
            <div>
              <span class="med-p-card__tag">${escapeHtml(med.category)}</span>
              ${med.is_combination ? `<span class="combo-tag">複方藥物</span>` : ''}
            </div>
            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">洗脫 ${escapeHtml(med.washout_period)}</span>
          </div>
          <h3 class="med-p-card__generic">${escapeHtml(med.generic_name)}</h3>
          <span class="med-p-card__zh">${escapeHtml(med.localized_names ? med.localized_names.join('/') : '')}</span>
          <span class="med-p-card__brands">常用商品：${escapeHtml(med.brand_names ? med.brand_names.join(', ') : '無')}</span>
        </div>
      </div>

      <!-- Exforge 易安穩等複方藥物拆解 -->
      ${med.is_combination ? `
        <div class="combo-breakdown-box">
          <div style="font-weight:800;display:flex;align-items:center;gap:0.35rem;margin-bottom:0.15rem;">
            <span>🔬 複方拆解成分：</span>
            <span>${escapeHtml(med.combination_components)}</span>
          </div>
          <div style="font-size:0.78rem;"><strong>成分分類：</strong>${escapeHtml(med.combination_categories)}</div>
        </div>
      ` : ''}

      <div style="font-size:0.82rem;color:var(--text-body);background:var(--bg-page);padding:0.4rem 0.6rem;border-radius:6px;border:1px dashed var(--border);display:flex;align-items:center;gap:0.4rem;">
        <span style="font-weight:700;color:var(--primary);flex-shrink:0;">💊 外觀：</span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(med.pill_appearance || '請參閱藥盒標示')}</span>
      </div>

      <div>
        ${getArrBadge(med)}
      </div>

      <div class="med-p-card__metrics">
        <div class="metric-col">
          <span class="metric-col__label">PAC (醛固酮)</span>
          <span class="metric-col__val ${med.pac_effect.includes('↑') ? 'up' : (med.pac_effect.includes('↓') ? 'down' : 'flat')}">${escapeHtml(med.pac_effect)}</span>
        </div>
        <div class="metric-col">
          <span class="metric-col__label">PRA (腎素)</span>
          <span class="metric-col__val ${med.pra_effect.includes('↑') ? 'up' : (med.pra_effect.includes('↓') ? 'down' : 'flat')}">${escapeHtml(med.pra_effect)}</span>
        </div>
        <div class="metric-col">
          <span class="metric-col__label">ARR 比值</span>
          <span class="metric-col__val ${med.arr_effect_type === 'false_positive' ? 'up' : (med.arr_effect_type === 'false_negative' ? 'down' : 'flat')}">${med.arr_effect_type === 'false_positive' ? '↑ (假陽)' : (med.arr_effect_type === 'false_negative' ? '↓ (假陰)' : '→ (影響小)')}</span>
        </div>
      </div>

      <div style="display:flex;gap:0.5rem;">
        <button type="button" class="btn btn-outline btn-sm flex-1" data-zoom-id="${med.id}">🖼️ 大圖對比</button>
        <a href="#/medicine/${encodeURIComponent(med.id)}" class="btn btn-primary btn-sm flex-1">📖 詳細說明</a>
      </div>
    </article>
  `).join('');
}

function renderHome() {
  updateNavActive('home');

  const categories = [
    { id: 'ALL', label: '常見降血壓藥物 (全部 25+ 種)' },
    { id: 'MRA', label: 'MRA 鹽皮質受體拮抗劑' },
    { id: 'Beta-blocker', label: 'Beta-blocker 乙型受體阻斷劑' },
    { id: 'ACEI', label: 'ACEI 轉化酶抑制劑' },
    { id: 'ARB', label: 'ARB 受體阻斷劑' },
    { id: 'CCB', label: 'CCB 鈣離子阻斷劑' },
    { id: 'Alpha-blocker', label: 'Alpha-blocker 腎上腺素阻斷劑' },
    { id: 'Diuretics', label: '利尿劑 (Diuretics)' }
  ];

  const chipsHtml = categories.map(cat => {
    const activeClass = selectedCategories === cat.id ? 'active' : '';
    return `<button type="button" class="chip ${activeClass}" data-cat="${cat.id}">
      <span>${cat.label}</span>
    </button>`;
  }).join('');

  const filtered = getFilteredMedications();
  const cardsHtml = renderMedicationCardsHtml(filtered);

  // 取得關鍵藥物 Base64 Image
  const valMed = medications.find(m => m.id === 'valsartan');
  const amlMed = medications.find(m => m.id === 'amlodipine');
  const canMed = medications.find(m => m.id === 'candesartan');
  const bisMed = medications.find(m => m.id === 'bisoprolol');

  app.innerHTML = `
    <!-- 1. Hero 區塊 -->
    <section class="hero-clinic">
      <div class="hero-clinic__left">
        <div class="version-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          PA Clinical & Research Tool 2026
        </div>
        <h1>PA 臨床藥物影響助手</h1>
        <div class="hero-clinic__sub">原發性醛固酮過多症 (Primary Aldosteronism, PA)<br>降血壓藥物實體照片外觀比對 × 複方拆解 × ARR 篩檢工具</div>
        <p class="hero-clinic__desc">
          專為台灣門診與社區健檢研究個案設計，提供每種降血壓藥物（包含 Exforge 易安穩、Diovan 代文、Norvasc 脈優、Blopress 博脈舒、Unisia 優力莎、Amlobin-O 安脈、Losa & Hydro 落沙、Caduet 卡杜特等）的<strong>真實藥物與包裝外觀比對</strong>、複方拆解成分與 PAC/PRA/ARR 影響分析。
        </p>

        <div class="hero-clinic__actions">
          <a href="#/research" class="btn btn-primary">
            🔬 開啟 PA/ARR 研究版試算工具
          </a>
          <a href="#/calculator" class="btn btn-outline">
            🧮 門診藥物評估計算機
          </a>
        </div>
      </div>

      <!-- Hero 右側：藥物視覺群組 -->
      <div class="pill-cluster-card">
        <div class="pill-cluster-card__title">
          <span>台灣常見藥物實體照片</span>
          <span>點擊卡片放大</span>
        </div>

        <div class="pill-grid-preview">
          <div class="pill-preview-item" data-zoom-id="valsartan" style="cursor:pointer;">
            <img src="${valMed ? valMed.image : 'assets/medicines/valsartan.svg'}" width="36" height="36" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:0.82rem;font-weight:800;color:var(--primary);">Exforge (易安穩)</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">Amlodipine + Valsartan</div>
            </div>
          </div>

          <div class="pill-preview-item" data-zoom-id="amlodipine" style="cursor:pointer;">
            <img src="${amlMed ? amlMed.image : 'assets/medicines/amlodipine.svg'}" width="36" height="36" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:0.82rem;font-weight:800;color:var(--success-dark);">Norvasc (脈優)</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">Amlodipine / 卡杜特</div>
            </div>
          </div>

          <div class="pill-preview-item" data-zoom-id="candesartan" style="cursor:pointer;">
            <img src="${canMed ? canMed.image : 'assets/medicines/candesartan.svg'}" width="36" height="36" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:0.82rem;font-weight:800;color:var(--danger-dark);">Blopress (博脈舒)</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">優力莎 Unisia 複方</div>
            </div>
          </div>

          <div class="pill-preview-item" data-zoom-id="bisoprolol" style="cursor:pointer;">
            <img src="${bisMed ? bisMed.image : 'assets/medicines/bisoprolol.svg'}" width="36" height="36" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:0.82rem;font-weight:800;color:var(--orange);">Concor (康肯)</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">心形刻痕錠</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. 藥物搜尋區 (採用 input type="text" 並完全尊重 IME Composition 注音選字) -->
    <section class="search-section">
      <h2>
        🔍 搜尋藥名／商品名 (支援 Exforge 易安穩, Diovan 代文, Norvasc 脈優, 博脈舒, 優力莎, 安脈)
      </h2>
      <div class="search-box">
        <svg class="search-box__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="home-search-input" placeholder="請輸入藥物中文商品名 (如 易安穩, 脈優, 代文, 博脈舒) 或英文學名..." value="${escapeHtml(searchTerm)}" autocomplete="off" spellcheck="false" />
      </div>

      <div class="category-chips">
        ${chipsHtml}
      </div>
    </section>

    <!-- 3. 25+ 種降血壓藥物圖鑑卡片 -->
    <section style="margin-bottom:2.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="font-size:1.25rem;font-weight:900;color:var(--primary-dark);display:flex;align-items:center;gap:0.5rem;">
          🖼️ 每種藥物實體照片與外觀圖鑑 (收錄 25+ 種)
        </h2>
        <span id="filtered-count" style="font-size:0.88rem;color:var(--text-muted);font-weight:700;">共 ${filtered.length} 項</span>
      </div>

      <div id="cards-container" class="med-encyclopedia-grid">
        ${cardsHtml}
      </div>
    </section>
  `;

  // 僅更新卡片容器，維持 Input 焦點與注音組合選字 state 完全不動
  function updateCardsContainerOnly() {
    const list = getFilteredMedications();
    const cardsContainer = document.querySelector('#cards-container');
    const filteredCount = document.querySelector('#filtered-count');
    if (cardsContainer) cardsContainer.innerHTML = renderMedicationCardsHtml(list);
    if (filteredCount) filteredCount.textContent = `共 ${list.length} 項`;

    document.querySelectorAll('[data-zoom-id]').forEach(el => {
      el.onclick = () => openImageModal(el.dataset.zoomId);
    });
  }

  const searchInput = document.querySelector('#home-search-input');
  if (searchInput) {
    let isComposing = false;
    let debounceTimer = null;

    searchInput.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    searchInput.addEventListener('compositionend', (e) => {
      isComposing = false;
      searchTerm = e.target.value;
      updateCardsContainerOnly();
    });

    searchInput.addEventListener('input', (e) => {
      if (isComposing) return; // 注音選字未完成前，絕不干擾輸入框
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchTerm = e.target.value;
        updateCardsContainerOnly();
      }, 120);
    });
  }

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCategories = btn.dataset.cat;
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCardsContainerOnly();
    });
  });

  document.querySelectorAll('[data-zoom-id]').forEach(el => {
    el.addEventListener('click', () => {
      openImageModal(el.dataset.zoomId);
    });
  });
}

/* ==========================================================================
   ROUTE 2: RESEARCH MODE (🔬 研究版：PA/ARR 試算與條件篩選工具)
   ========================================================================== */

function renderResearch() {
  updateNavActive('research');

  // 計算 ARR
  const praVal = parseFloat(researchPra);
  const pacVal = parseFloat(researchPac);
  let arrVal = (praVal > 0 && !isNaN(pacVal)) ? (pacVal / praVal) : 0;
  arrVal = Math.round(arrVal * 10) / 10;

  // 陽性門檻判斷 (PAC ≥ 10 ng/dL 且 PRA ≤ 1.0 且 ARR ≥ 30)
  const isPositive = (pacVal >= 10 && praVal <= 1.0 && arrVal >= 30);
  const isBorderline = (!isPositive && arrVal >= 20);

  // 勾選藥物對目前生化數據的臨床干擾提醒
  const selectedMeds = medications.filter(m => researchSelectedIds.has(m.id));
  
  let drugWarnings = [];
  selectedMeds.forEach(m => {
    if (m.category === 'Beta-blocker') {
      drugWarnings.push(`⚠️ <strong>${escapeHtml(m.generic_name)} (${escapeHtml(m.brand_names ? m.brand_names.join('/') : '')})</strong>：為 Beta-blocker，會強烈抑制腎素活性 (PRA ↓↓)，可能造成計算出來的 ARR 人工暴增 (<strong>假陽性風險</strong>)。`);
    } else if (m.category === 'MRA') {
      drugWarnings.push(`🚨 <strong>${escapeHtml(m.generic_name)} (${escapeHtml(m.brand_names ? m.brand_names.join('/') : '')})</strong>：為 MRA 保鉀利尿劑，會解除對腎素的抑制使 PRA 暴增 10 倍以上，極易引發嚴重<strong>假陰性</strong>，必須洗脫 4-6 週！`);
    } else if (m.category === 'ARB' || m.category === 'ACEI') {
      drugWarnings.push(`⚠️ <strong>${escapeHtml(m.generic_name)} (${escapeHtml(m.brand_names ? m.brand_names.join('/') : '')})</strong>：為 ${m.category} 類（如 Exforge 易安穩/Diovan 代文/博脈舒/優力莎），會使 PRA 反應性升高，可能拉低 ARR (<strong>假陰性風險</strong>)。`);
    } else if (m.category.includes('diuretics') || m.category.includes('Diuretic')) {
      drugWarnings.push(`⚠️ <strong>${escapeHtml(m.generic_name)}</strong>：為利尿劑，排鈉排水刺激 PRA 升高，可能造成 <strong>假陰性</strong>。`);
    }
  });

  const medicationCheckboxesHtml = medications.map(m => {
    const isChecked = researchSelectedIds.has(m.id) ? 'checked' : '';
    return `
      <label style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.65rem;background:#ffffff;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;cursor:pointer;">
        <input type="checkbox" data-research-id="${m.id}" ${isChecked} style="width:16px;height:16px;accent-color:var(--primary);" />
        <span style="font-weight:700;">${escapeHtml(m.generic_name)}</span>
        <small style="color:var(--text-muted);">${escapeHtml(m.brand_names ? m.brand_names[0] : '')}</small>
      </label>
    `;
  }).join('');

  app.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <div style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.25rem 0.65rem;background:var(--primary-soft);color:var(--primary);font-size:0.8rem;font-weight:800;border-radius:999px;margin-bottom:0.5rem;">
        🔬 臨床研究人員與醫師專用工具
      </div>
      <h1 style="font-size:1.85rem;font-weight:900;color:var(--primary-dark);margin-bottom:0.25rem;">PA / ARR 試算與條件篩選工具 (Research Screening Tool)</h1>
      <p style="font-size:0.95rem;color:var(--text-muted);">輸入個案生化抽血數值 PAC 與 PRA，系統將自動計算 ARR 比值，對照收案篩選條件，並連動分析目前用藥對結果的干擾。</p>
    </div>

    <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:1.5rem;">
      <!-- 左側：數據輸入與結果牌 -->
      <div>
        <div style="background:#ffffff;border:1px solid var(--border-strong);border-radius:10px;padding:1.5rem;box-shadow:var(--shadow-sm);margin-bottom:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
            📊 輸入血清醛固酮 (PAC) 與腎素活性 (PRA)
          </h2>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
            <div>
              <label style="font-size:0.88rem;font-weight:800;color:var(--text-main);display:block;margin-bottom:0.35rem;">
                PAC (血漿醛固酮濃度)
              </label>
              <div style="display:flex;gap:0.4rem;">
                <input type="number" id="input-pac" value="${researchPac}" step="0.1" style="flex:1;padding:0.6rem 0.75rem;font-size:1.1rem;font-weight:800;border:2px solid var(--border);border-radius:6px;" />
                <span style="padding:0.6rem;background:var(--bg-page);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-weight:700;display:grid;place-items:center;">ng/dL</span>
              </div>
            </div>

            <div>
              <label style="font-size:0.88rem;font-weight:800;color:var(--text-main);display:block;margin-bottom:0.35rem;">
                PRA (血漿腎素活性)
              </label>
              <div style="display:flex;gap:0.4rem;">
                <input type="number" id="input-pra" value="${researchPra}" step="0.1" style="flex:1;padding:0.6rem 0.75rem;font-size:1.1rem;font-weight:800;border:2px solid var(--border);border-radius:6px;" />
                <span style="padding:0.6rem;background:var(--bg-page);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-weight:700;display:grid;place-items:center;">ng/mL/h</span>
              </div>
            </div>
          </div>

          <!-- 自動計算輸出牌 -->
          <div style="background:var(--bg-page);border:2px solid var(--primary);border-radius:10px;padding:1.25rem;text-align:center;">
            <div style="font-size:0.85rem;color:var(--text-muted);font-weight:700;">自動計算 ARR (PAC / PRA) 比值：</div>
            <div style="font-size:2.8rem;font-weight:900;color:var(--primary-dark);line-height:1.1;margin:0.25rem 0;">
              ${arrVal}
            </div>

            <div style="margin-top:0.75rem;padding:0.75rem;border-radius:8px;font-size:0.92rem;font-weight:800;${isPositive ? 'background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;' : (isBorderline ? 'background:#fff7ed;color:#9a3412;border:1px solid #fdba74;' : 'background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;')}">
              ${isPositive ? '✅ 符合 PA 篩檢陽性標準 (PAC ≥ 10 ng/dL, PRA ≤ 1.0 ng/mL/h, ARR ≥ 30)' : (isBorderline ? '⚡ 處於臨界範圍 (ARR ≥ 20)，建議配合藥物洗脫後重估' : 'ℹ️ 未達典型 PA 篩檢陽性門檻 (但需評估藥物干擾之假陰性)')}
            </div>
          </div>
        </div>
      </div>

      <!-- 右側：連動用藥干擾分析 -->
      <div>
        <div style="background:#ffffff;border:1px solid var(--border-strong);border-radius:10px;padding:1.5rem;box-shadow:var(--shadow-sm);">
          <h2 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
            ⚠️ 目前個案用藥連動提醒
          </h2>
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.75rem;">勾選個案目前服用的降壓藥，系統將提醒其對此抽血數值的干擾性：</p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;max-height:220px;overflow-y:auto;padding-right:0.25rem;margin-bottom:1rem;">
            ${medicationCheckboxesHtml}
          </div>

          <!-- 系統即時警示提醒 Box -->
          <div style="background:#fffbe6;border:1px solid #ffe58f;border-left:4px solid var(--warning);border-radius:8px;padding:1rem;color:#873800;">
            <h4 style="font-size:0.92rem;font-weight:900;margin-bottom:0.4rem;">系統臨床提醒：</h4>
            ${drugWarnings.length ? `
              <div style="font-size:0.85rem;display:flex;flex-direction:column;gap:0.4rem;">
                ${drugWarnings.map(w => `<div>${w}</div>`).join('')}
              </div>
              <div style="font-size:0.8rem;margin-top:0.6rem;padding-top:0.4rem;border-top:1px dashed #ffd591;color:#ad4e00;">
                💡 處置建議：若生化數據符合陽性門檻，但個案正服用干擾藥物，臨床指引建議安排洗脫停藥 2-4 週（MRA 4-6 週）後重新抽血，或替換為 Doxazosin (可多華) 或 Amlodipine (脈優)。
              </div>
            ` : `
              <p style="font-size:0.85rem;color:var(--text-muted);">目前未勾選任何影響藥物。</p>
            `}
          </div>
        </div>
      </div>
    </div>
  `;

  document.querySelector('#input-pac').addEventListener('input', (e) => {
    researchPac = e.target.value;
    renderResearch();
    const el = document.querySelector('#input-pac');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });

  document.querySelector('#input-pra').addEventListener('input', (e) => {
    researchPra = e.target.value;
    renderResearch();
    const el = document.querySelector('#input-pra');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });

  document.querySelectorAll('input[data-research-id]').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.dataset.research-id;
      if (e.target.checked) researchSelectedIds.add(id);
      else researchSelectedIds.delete(id);
      renderResearch();
    });
  });
}

/* ==========================================================================
   ROUTE 3: CALCULATOR (門診用藥評估計算機)
   ========================================================================== */

function renderCalculator() {
  updateNavActive('calculator');

  const selectedMeds = medications.filter(m => calculatorSelectedIds.has(m.id));
  
  let riskLevel = 'LOW';
  let hasMra = false;
  let hasBetaBlocker = false;
  let hasAceiArb = false;
  let hasDiuretic = false;

  selectedMeds.forEach(m => {
    if (m.category === 'MRA') hasMra = true;
    if (m.category === 'Beta-blocker') hasBetaBlocker = true;
    if (m.category === 'ACEI' || m.category === 'ARB') hasAceiArb = true;
    if (m.category.includes('diuretics') || m.category.includes('Diuretic')) hasDiuretic = true;
  });

  if (hasMra) riskLevel = 'HIGH';
  else if (hasBetaBlocker || hasAceiArb || hasDiuretic) riskLevel = 'MODERATE';
  else riskLevel = 'LOW';

  const checkboxListHtml = medications.map(m => {
    const isChecked = calculatorSelectedIds.has(m.id) ? 'checked' : '';
    return `
      <label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:#ffffff;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="checkbox" data-id="${m.id}" ${isChecked} style="width:18px;height:18px;accent-color:var(--primary);" />
        <img src="${escapeHtml(m.image)}" width="36" height="36" style="border-radius:4px;object-fit:cover;" />
        <div style="flex:1;min-width:0;">
          <strong style="font-size:0.95rem;color:var(--text-main);">${escapeHtml(m.generic_name)} (${escapeHtml(m.localized_names ? m.localized_names.join('/') : '')})</strong>
          <div style="font-size:0.78rem;color:var(--text-muted);">常用商品：${escapeHtml(m.brand_names ? m.brand_names.join(', ') : '')}</div>
        </div>
        <span style="font-size:0.78rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;background:${m.is_preferred_for_pa_screening ? '#ecfdf5' : '#fef2f2'};color:${m.is_preferred_for_pa_screening ? '#047857' : '#b91c1c'};">
          ${m.is_preferred_for_pa_screening ? '首選替代藥' : `洗脫 ${m.washout_period}`}
        </span>
      </label>
    `;
  }).join('');

  let resultHeaderHtml = '';
  if (riskLevel === 'HIGH') {
    resultHeaderHtml = `
      <div style="padding:1.25rem;background:#fef2f2;border:1px solid #fca5a5;border-left:5px solid var(--danger);border-radius:8px;color:#991b1b;margin-bottom:1.25rem;">
        <h3 style="font-size:1.15rem;font-weight:900;margin-bottom:0.25rem;">🚨 高度 ARR 假陰性干擾風險 (High Interference)</h3>
        <p style="font-size:0.9rem;">包含 MRA 保鉀利尿劑 (如 Spironolactone 樂安定)，會大幅提升 PRA 並導致 ARR 嚴重假陰性，<strong>必須進行洗脫停藥 4-6 週</strong>。</p>
      </div>
    `;
  } else if (riskLevel === 'MODERATE') {
    resultHeaderHtml = `
      <div style="padding:1.25rem;background:#fff7ed;border:1px solid #fdba74;border-left:5px solid var(--orange);border-radius:8px;color:#9a3412;margin-bottom:1.25rem;">
        <h3 style="font-size:1.15rem;font-weight:900;margin-bottom:0.25rem;">⚠️ 中度 ARR 干擾風險 (Moderate Interference)</h3>
        <p style="font-size:0.9rem;">包含 Beta-blocker、ACEI、ARB (含 Exforge 易安穩、博脈舒、優力莎、安脈、落沙等) 或利尿劑，可能引發假陽性或假陰性。<strong>建議進行洗脫停藥 2-4 週</strong>。</p>
      </div>
    `;
  } else {
    resultHeaderHtml = `
      <div style="padding:1.25rem;background:#ecfdf5;border:1px solid #6ee7b7;border-left:5px solid var(--success);border-radius:8px;color:#065f46;margin-bottom:1.25rem;">
        <h3 style="font-size:1.15rem;font-weight:900;margin-bottom:0.25rem;">✅ 低干擾 / 安全可採血 (Minimal Interference)</h3>
        <p style="font-size:0.9rem;">目前選擇藥物 (如 Doxazosin 可多華, Amlodipine 脈優/卡杜特, Verapamil 伊速平) 對 ARR 比值影響極小，不需停藥洗脫，可直接安排採血。</p>
      </div>
    `;
  }

  const selectedListHtml = selectedMeds.length ? selectedMeds.map(m => `
    <div style="padding:0.85rem;background:#ffffff;border:1px solid var(--border);border-radius:8px;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.75rem;">
      <img src="${escapeHtml(m.image)}" width="36" height="36" style="border-radius:4px;object-fit:cover;" />
      <div style="flex:1;">
        <div style="font-weight:800;font-size:0.95rem;">${escapeHtml(m.generic_name)} (${escapeHtml(m.category)})</div>
        <div style="font-size:0.82rem;color:var(--text-muted);">常用商品：${escapeHtml(m.brand_names ? m.brand_names.join(', ') : '')} | 洗脫期：${escapeHtml(m.washout_period)}</div>
      </div>
    </div>
  `).join('') : '<p style="color:var(--text-muted);">請在左側勾選病人目前服用的藥物組合。</p>';

  app.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h1 style="font-size:1.8rem;font-weight:900;color:var(--primary-dark);margin-bottom:0.25rem;">PA 門診藥物干擾與洗脫期評估計算機</h1>
      <p style="font-size:0.95rem;color:var(--text-muted);">勾選病人目前發藥處方，或點選下方社區健檢常見多藥組合進行快速帶入評估。</p>
    </div>

    <!-- Quick Presets -->
    <div style="background:#ffffff;border:1px solid var(--border-strong);border-radius:10px;padding:1.25rem;margin-bottom:1.5rem;">
      <h3 style="font-size:0.98rem;font-weight:800;color:var(--primary);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
        📋 社區健檢與門診常見多藥組合快速帶入 (Preset Combinations)
      </h3>

      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
        <button type="button" class="preset-btn btn btn-outline btn-sm" data-preset="candesartan,bisoprolol,amlodipine">
          💊 組合 A: Candesartan (博脈舒) + Bisoprolol (康肯) + Amlodipine (脈優)
        </button>

        <button type="button" class="preset-btn btn btn-outline btn-sm" data-preset="valsartan,nebivolol">
          💊 組合 B: Exforge (易安穩) + Nebivolol (奈比樂)
        </button>

        <button type="button" class="preset-btn btn btn-outline btn-sm" data-preset="propafenone,olmesartan,amlodipine">
          💊 組合 C: Propafenone (律摩諾) + Amlobin-O (安脈)
        </button>

        <button type="button" class="preset-btn btn btn-outline btn-sm" data-preset="olmesartan,amlodipine,doxazosin">
          💊 組合 D: Amlodipine + Olmesartan (安壓雙好/安脈) + Norvasc + Doxazosin
        </button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:1.5rem;">
      <div style="background:#ffffff;border:1px solid var(--border-strong);border-radius:10px;padding:1.5rem;">
        <h2 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:1rem;">勾選病人用藥 (已選 ${selectedMeds.length} 項)</h2>
        <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:500px;overflow-y:auto;padding-right:0.25rem;">
          ${checkboxListHtml}
        </div>
      </div>

      <div style="background:#ffffff;border:1px solid var(--border-strong);border-radius:10px;padding:1.5rem;">
        <h2 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:1rem;">臨床評估結果與洗脫建議</h2>
        ${resultHeaderHtml}

        <h3 style="font-size:0.95rem;font-weight:800;color:var(--text-main);margin-bottom:0.5rem;">已選擇藥物洗脫細節：</h3>
        ${selectedListHtml}
      </div>
    </div>
  `;

  document.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) calculatorSelectedIds.add(id);
      else calculatorSelectedIds.delete(id);
      renderCalculator();
    });
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ids = btn.dataset.preset.split(',');
      calculatorSelectedIds = new Set(ids);
      renderCalculator();
    });
  });
}

/* ==========================================================================
   ROUTE 4: MATRIX (對照總表)
   ========================================================================== */

function renderMatrix() {
  updateNavActive('matrix');

  const rowsHtml = medications.map(med => `
    <tr>
      <td><img src="${escapeHtml(med.image)}" width="36" height="36" data-zoom-id="${med.id}" style="cursor:pointer;border-radius:4px;object-fit:cover;" /></td>
      <td>
        <a href="#/medicine/${encodeURIComponent(med.id)}" style="color:var(--primary);font-weight:700;text-decoration:none;">
          ${escapeHtml(med.generic_name)}
        </a>
        <br><small style="color:var(--text-muted);">${escapeHtml(med.localized_names ? med.localized_names.join('/') : '')}</small>
      </td>
      <td>${escapeHtml(med.category)}</td>
      <td><small>${escapeHtml(med.brand_names ? med.brand_names.join(', ') : '無')}</small></td>
      <td style="font-size:0.8rem;color:var(--text-body);">${escapeHtml(med.pill_appearance || '請參閱標籤')}</td>
      <td style="font-weight:700;color:${med.pac_effect.includes('↑') ? 'var(--danger)' : 'var(--blue-alt)'};">${escapeHtml(med.pac_effect)}</td>
      <td style="font-weight:700;color:${med.pra_effect.includes('↑') ? 'var(--danger)' : 'var(--blue-alt)'};">${escapeHtml(med.pra_effect)}</td>
      <td>${getArrBadge(med)}</td>
      <td style="font-weight:700;">${escapeHtml(med.washout_period)}</td>
    </tr>
  `).join('');

  app.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h1 style="font-size:1.8rem;font-weight:900;color:var(--primary-dark);margin-bottom:0.25rem;">ARR 降血壓藥物影響與對照總表</h1>
      <p style="font-size:0.95rem;color:var(--text-muted);">一覽所有降壓藥物對 PAC (醛固酮)、PRA (腎素活性) 及 ARR 比值之影響與建議洗脫期。</p>
    </div>

    <div class="table-card">
      <table class="clinic-table">
        <thead>
          <tr>
            <th>外觀</th>
            <th>學名 / 中文藥名</th>
            <th>藥物分類</th>
            <th>常見商品名 (含 Exforge, 博脈舒, 優力莎, 安脈, 落沙等)</th>
            <th>藥物外觀</th>
            <th>PAC 影響</th>
            <th>PRA 影響</th>
            <th>ARR 干擾評估</th>
            <th>建議洗脫期</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('[data-zoom-id]').forEach(el => {
    el.addEventListener('click', () => openImageModal(el.dataset.zoomId));
  });
}

/* ==========================================================================
   ROUTE 5: WASHOUT (洗脫期專頁)
   ========================================================================== */

function renderWashout() {
  updateNavActive('washout');

  const valMed = medications.find(m => m.id === 'valsartan');
  const bisMed = medications.find(m => m.id === 'bisoprolol');
  const spiMed = medications.find(m => m.id === 'spironolactone');

  app.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h1 style="font-size:1.8rem;font-weight:900;color:var(--primary-dark);margin-bottom:0.25rem;">降血壓藥物洗脫期與替代藥物專頁</h1>
      <p style="font-size:0.95rem;color:var(--text-muted);">門診收案與 ARR 篩檢採血前之藥物調整與洗脫期管理指引。</p>
    </div>

    <section class="washout-section">
      <h2>⏱️ 各類降壓藥物洗脫期參考</h2>

      <div class="washout-list">
        <div class="washout-row">
          <div class="washout-row__left">
            <img src="${spiMed ? spiMed.image : 'assets/medicines/spironolactone.svg'}" width="40" height="40" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:1rem;font-weight:800;color:var(--danger-dark);">MRA 鹽皮質受體拮抗劑 (Aldactone 樂安定 / Inspra 英斯平)</div>
              <small style="color:var(--text-muted);">極高干擾！直接競合醛固酮受體，使 PRA 暴增，造成嚴重假陰性。</small>
            </div>
          </div>
          <div class="washout-row__time">💊 ➔ ➔ ➔ ⏱ 必須停藥 4–6 週</div>
        </div>

        <div class="washout-row">
          <div class="washout-row__left">
            <img src="${bisMed ? bisMed.image : 'assets/medicines/bisoprolol.svg'}" width="40" height="40" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:1rem;font-weight:800;color:var(--orange);">Beta-blocker 乙型受體阻斷劑 (Concor 康肯 / Nebilet 奈比樂 / Inderal 恩特來)</div>
              <small style="color:var(--text-muted);">強效抑制腎素釋放致 PRA 接近零造成假陽性。</small>
            </div>
          </div>
          <div class="washout-row__time">💊 ➔ ➔ ⏱ 停藥洗脫 2–4 週</div>
        </div>

        <div class="washout-row">
          <div class="washout-row__left">
            <img src="${valMed ? valMed.image : 'assets/medicines/valsartan.svg'}" width="40" height="40" style="border-radius:4px;object-fit:cover;" />
            <div>
              <div style="font-size:1rem;font-weight:800;color:var(--primary);">ACEI / ARB 類與複方錠 (Exforge 易安穩 / Blopress 博脈舒 / Unisia 優力莎 / Amlobin-O 安脈 / Losa & Hydro 落沙)</div>
              <small style="color:var(--text-muted);">提升 PRA 造成假陰性。</small>
            </div>
          </div>
          <div class="washout-row__time">💊 ➔ ➔ ⏱ 停藥洗脫 2–4 週</div>
        </div>
      </div>
    </section>
  `;
}

/* ==========================================================================
   ROUTE 6: COMPARE (併排比對)
   ========================================================================== */

function renderCompare() {
  updateNavActive('compare');

  const drugA = medications.find(m => m.id === compareDrugA) || medications[0];
  const drugB = medications.find(m => m.id === compareDrugB) || medications[1];

  const optionsHtmlA = medications.map(m => `<option value="${m.id}" ${m.id === drugA.id ? 'selected' : ''}>${escapeHtml(m.generic_name)} (${escapeHtml(m.category)})</option>`).join('');
  const optionsHtmlB = medications.map(m => `<option value="${m.id}" ${m.id === drugB.id ? 'selected' : ''}>${escapeHtml(m.generic_name)} (${escapeHtml(m.category)})</option>`).join('');

  app.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h1 style="font-size:1.8rem;font-weight:900;color:var(--primary-dark);margin-bottom:0.25rem;">藥物併排外觀與干擾比對工具</h1>
      <p style="font-size:0.95rem;color:var(--text-muted);">選擇兩種降血壓藥物進行外觀與 PAC/PRA/ARR 影響的比對。</p>
    </div>

    <div style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <select id="compare-select-a" style="flex:1;min-width:240px;padding:0.75rem;border-radius:6px;border:2px solid var(--border);font-size:0.95rem;font-family:inherit;">
        ${optionsHtmlA}
      </select>
      <div style="display:grid;place-items:center;font-weight:900;color:var(--text-muted);">VS</div>
      <select id="compare-select-b" style="flex:1;min-width:240px;padding:0.75rem;border-radius:6px;border:2px solid var(--border);font-size:0.95rem;font-family:inherit;">
        ${optionsHtmlB}
      </select>
    </div>

    <div class="table-card">
      <table class="clinic-table">
        <thead>
          <tr>
            <th style="width:180px;">比對項目</th>
            <th>${escapeHtml(drugA.generic_name)}</th>
            <th>${escapeHtml(drugB.generic_name)}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>實體藥物圖片</th>
            <td><img src="${escapeHtml(drugA.image)}" width="64" height="64" data-zoom-id="${drugA.id}" style="cursor:pointer;border-radius:6px;object-fit:cover;" /></td>
            <td><img src="${escapeHtml(drugB.image)}" width="64" height="64" data-zoom-id="${drugB.id}" style="cursor:pointer;border-radius:6px;object-fit:cover;" /></td>
          </tr>
          <tr>
            <th>藥物分類</th>
            <td>${escapeHtml(drugA.category_name_zh || drugA.category)} (${escapeHtml(drugA.category)})</td>
            <td>${escapeHtml(drugB.category_name_zh || drugB.category)} (${escapeHtml(drugB.category)})</td>
          </tr>
          <tr>
            <th>常見商品名</th>
            <td>${escapeHtml(drugA.brand_names ? drugA.brand_names.join(', ') : '無')}</td>
            <td>${escapeHtml(drugB.brand_names ? drugB.brand_names.join(', ') : '無')}</td>
          </tr>
          <tr>
            <th>藥物外觀描述</th>
            <td>${escapeHtml(drugA.pill_appearance || '請參閱標籤')}</td>
            <td>${escapeHtml(drugB.pill_appearance || '請參閱標籤')}</td>
          </tr>
          <tr>
            <th>ARR 干擾評估</th>
            <td>${getArrBadge(drugA)}</td>
            <td>${getArrBadge(drugB)}</td>
          </tr>
          <tr>
            <th>建議洗脫期</th>
            <td style="font-weight:900;font-size:1.05rem;">${escapeHtml(drugA.washout_period)}</td>
            <td style="font-weight:900;font-size:1.05rem;">${escapeHtml(drugB.washout_period)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  document.querySelector('#compare-select-a').addEventListener('change', (e) => {
    compareDrugA = e.target.value;
    renderCompare();
  });
  document.querySelector('#compare-select-b').addEventListener('change', (e) => {
    compareDrugB = e.target.value;
    renderCompare();
  });
  document.querySelectorAll('[data-zoom-id]').forEach(el => {
    el.addEventListener('click', () => openImageModal(el.dataset.zoomId));
  });
}

/* ==========================================================================
   ROUTE 7: DETAIL VIEW (單一藥物詳細說明頁)
   ========================================================================== */

function renderDetail(id) {
  updateNavActive('');

  const med = medications.find(m => m.id === id);
  if (!med) {
    window.location.hash = '#/';
    return;
  }

  app.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <a href="#/" class="btn btn-outline btn-sm">
        ← 返回藥物圖鑑與外觀
      </a>
    </div>

    <article style="background:#ffffff;border:1px solid var(--border-strong);border-radius:10px;padding:2rem;box-shadow:var(--shadow-sm);">
      <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:1.5rem;padding-bottom:1.5rem;border-bottom:2px solid var(--border);margin-bottom:1.5rem;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:1rem;">
          <div style="width:96px;height:96px;background:var(--bg-page);border-radius:10px;border:1px solid var(--border);display:grid;place-items:center;cursor:pointer;overflow:hidden;" data-zoom-id="${med.id}" title="點擊檢視放大外觀圖">
            <img src="${escapeHtml(med.image)}" alt="${escapeHtml(med.generic_name)}" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <div>
            <div style="font-size:0.82rem;color:var(--primary);font-weight:800;margin-bottom:0.2rem;">
              ${escapeHtml(med.category_name_zh || med.category)} ${med.is_combination ? ' (複方藥物)' : ''}
            </div>
            <h1 style="font-size:2rem;font-weight:900;color:var(--primary-dark);line-height:1.2;">${escapeHtml(med.generic_name)}</h1>
            <div style="font-size:1.1rem;color:var(--text-body);font-weight:700;">${escapeHtml(med.localized_names ? med.localized_names.join(' / ') : '')}</div>
            <div style="font-size:0.88rem;color:var(--text-muted);margin-top:0.25rem;"><strong>常見商品名：</strong>${escapeHtml(med.brand_names ? med.brand_names.join(', ') : '無')}</div>
          </div>
        </div>

        <div>
          ${getArrBadge(med)}
        </div>
      </header>

      ${med.is_combination ? `
        <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.5rem;color:#713f12;">
          <h3 style="font-size:1rem;font-weight:900;margin-bottom:0.25rem;">🔬 複方藥物成分拆解資訊</h3>
          <p style="font-size:0.9rem;"><strong>包含成分：</strong>${escapeHtml(med.combination_components)}</p>
          <p style="font-size:0.9rem;"><strong>成分分類：</strong>${escapeHtml(med.combination_categories)}</p>
          <p style="font-size:0.88rem;margin-top:0.25rem;color:#854d0e;"><strong>臨床評估：</strong>${escapeHtml(med.combination_notes)}</p>
        </div>
      ` : ''}

      <!-- 外觀視覺特徵 -->
      <div style="background:var(--primary-soft);border:1px solid #bfdbfe;padding:1rem 1.25rem;border-radius:8px;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">
        <div style="font-size:1.8rem;line-height:1;">💊</div>
        <div>
          <strong style="font-size:0.95rem;color:var(--primary-dark);">藥物實體外觀說明：</strong>
          <div style="font-size:0.9rem;color:var(--text-body);margin-top:0.15rem;">${escapeHtml(med.pill_appearance || '請參考原廠藥盒標示')}</div>
        </div>
      </div>

      <!-- 4 大指標 -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1rem;margin-bottom:2rem;">
        <div style="background:var(--bg-page);border:1px solid var(--border);padding:1rem;border-radius:8px;text-align:center;">
          <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;">PAC (醛固酮) 影響</div>
          <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem;color:${med.pac_effect.includes('↑') ? 'var(--danger)' : 'var(--blue-alt)'};">${escapeHtml(med.pac_effect)}</div>
        </div>

        <div style="background:var(--bg-page);border:1px solid var(--border);padding:1rem;border-radius:8px;text-align:center;">
          <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;">PRA (腎素活性) 影響</div>
          <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem;color:${med.pra_effect.includes('↑') ? 'var(--danger)' : 'var(--blue-alt)'};">${escapeHtml(med.pra_effect)}</div>
        </div>

        <div style="background:var(--bg-page);border:1px solid var(--border);padding:1rem;border-radius:8px;text-align:center;">
          <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;">ARR 比值干擾</div>
          <div style="font-size:1.15rem;font-weight:900;margin-top:0.25rem;">${escapeHtml(med.arr_effect)}</div>
        </div>

        <div style="background:var(--bg-page);border:1px solid var(--border);padding:1rem;border-radius:8px;text-align:center;">
          <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;">建議洗脫停藥期</div>
          <div style="font-size:1.3rem;font-weight:900;margin-top:0.25rem;color:var(--danger-dark);">${escapeHtml(med.washout_period)}</div>
        </div>
      </div>

      <!-- 臨床處置卡 -->
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-left:5px solid var(--danger);padding:1.25rem;border-radius:8px;margin-bottom:2rem;color:#991b1b;">
        <h3 style="font-size:1.05rem;font-weight:900;margin-bottom:0.35rem;">原發性醛固酮過多症 (PA) 臨床處置與注意事項</h3>
        <p style="font-size:0.95rem;line-height:1.6;margin-bottom:0.5rem;">${escapeHtml(med.screening_recommendation)}</p>
        <p style="font-size:0.88rem;color:#7f1d1d;"><strong>ARR 影響說明：</strong>${escapeHtml(med.pac_pra_arr_effect)}</p>
        <p style="font-size:0.88rem;color:#7f1d1d;margin-top:0.35rem;"><strong>常見副作用與警語：</strong>${escapeHtml(med.common_side_effects)} — ${escapeHtml(med.important_warnings)}</p>
      </div>

      <!-- 臨床詳細資訊 -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:1.25rem;">
        <div style="background:var(--bg-page);border:1px solid var(--border);padding:1.25rem;border-radius:8px;">
          <h4 style="font-size:0.95rem;font-weight:800;color:var(--primary-dark);margin-bottom:0.5rem;">藥理作用機轉 (Mechanism)</h4>
          <p style="font-size:0.9rem;color:var(--text-body);">${escapeHtml(med.mechanism)}</p>
        </div>

        <div style="background:var(--bg-page);border:1px solid var(--border);padding:1.25rem;border-radius:8px;">
          <h4 style="font-size:0.95rem;font-weight:800;color:var(--primary-dark);margin-bottom:0.5rem;">主要適應症 (Indications)</h4>
          <p style="font-size:0.9rem;color:var(--text-body);">${escapeHtml(med.indications)}</p>
        </div>
      </div>
    </article>
  `;

  document.querySelectorAll('[data-zoom-id]').forEach(el => {
    el.addEventListener('click', () => openImageModal(el.dataset.zoomId));
  });
}

/* ==========================================================================
   Router Initialization
   ========================================================================== */

function route() {
  const hash = window.location.hash || '#/';
  const detailMatch = hash.match(/^#\/medicine\/([^?]+)$/);
  
  if (hash === '#/' || hash === '') {
    renderHome();
  } else if (hash === '#/research') {
    renderResearch();
  } else if (hash === '#/calculator') {
    renderCalculator();
  } else if (hash === '#/matrix') {
    renderMatrix();
  } else if (hash === '#/washout') {
    renderWashout();
  } else if (hash === '#/compare') {
    renderCompare();
  } else if (detailMatch) {
    renderDetail(decodeURIComponent(detailMatch[1]));
  } else {
    renderHome();
  }

  window.scrollTo(0, 0);
}

// Initial Boot
async function start() {
  try {
    const res = await fetch('data/medications.json');
    if (!res.ok) throw new Error('無法載入藥物資料庫 json');
    medications = await res.json();
    
    route();
    window.addEventListener('hashchange', route);
  } catch (err) {
    app.innerHTML = `
      <div style="text-align:center;padding:5rem 1rem;color:var(--danger);">
        <h2>⚠️ 藥物資料載入失敗</h2>
        <p style="margin-top:0.5rem;color:var(--text-muted);">請確認是否已透過 HTTP 伺服器啟動 (例如 python -m http.server 8000)。</p>
      </div>
    `;
    console.error(err);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.log('SW reg error:', err));
  });
}

start();
