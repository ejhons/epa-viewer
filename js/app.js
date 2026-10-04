/* Interface do Editor INP */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = Inp.num;
  const main = $('#main'), dlg = $('#dlg');

  const S = {
    M: null, name: '', enc: 'utf8', cur: 0, filter: '', page: 0, ps: 100, selected: new Set(),
    history: [], modified: false, selSeries: {}, selGroup: {}, gFilter: '', sFilter: '', ctx: { rows: [] }
  };

  /* ------------------------------------------------------------------ utilitários de UI */
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function sec() { return S.M && S.M.sections[S.cur]; }
  function snapshot() {
    S.history.push(Inp.serialize(S.M));
    if (S.history.length > 40) S.history.shift();
    S.modified = true;
    renderTop();
  }
  function undo() {
    if (!S.history.length) return;
    const text = S.history.pop();
    const keep = S.cur;
    S.M = Inp.parse(text);
    S.cur = Math.min(keep, S.M.sections.length - 1);
    S.selected.clear();
    S.modified = S.history.length > 0;
    renderAll();
    toast('Alteração desfeita');
  }
  function secCount(s) { return Inp.sectionCount(s); }
  function goSection(name) {
    const i = S.M.sections.findIndex(s => s.name === name);
    if (i >= 0) { S.cur = i; S.filter = ''; S.page = 0; S.selected.clear(); renderAll(); }
  }
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ------------------------------------------------------------------ arquivo */
  async function loadFile(f) {
    const buf = await f.arrayBuffer();
    let text, enc = 'utf8';
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { text = new TextDecoder('windows-1252').decode(buf); enc = 'latin1'; }
    setModel(Inp.parse(text), f.name, enc);
  }
  function setModel(M, name, enc) {
    S.M = M; S.name = name; S.enc = enc || 'utf8';
    S.history = []; S.modified = false; S.selSeries = {}; S.filter = ''; S.page = 0; S.selected.clear();
    const first = M.sections.findIndex(s => s.name !== 'TITLE' && s.name !== 'END' && secCount(s) > 0);
    S.cur = first >= 0 ? first : 0;
    renderAll();
  }
  function save() {
    const text = Inp.serialize(S.M);
    let blob;
    if (S.enc === 'latin1') {
      const u = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); u[i] = c < 256 ? c : 63; }
      blob = new Blob([u], { type: 'text/plain' });
    } else blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    download(S.name.replace(/\.inp$/i, '') + '_editado.inp', blob);
    S.modified = false; renderTop();
  }

  /* ------------------------------------------------------------------ renderização geral */
  function renderAll() { renderTop(); renderSide(); renderMain(); }
  function renderTop() {
    const has = !!S.M;
    $('#tools').classList.toggle('hide', !has);
    $('#btnDemand').classList.toggle('hide', !has || S.M.program !== 'epanet');
    $('#btnHyeto').classList.toggle('hide', !has || S.M.program !== 'swmm');
    $('#btnSave').disabled = !has;
    $('#btnUndo').disabled = !S.history.length;
    $('#btnUndo').textContent = S.history.length ? `Desfazer (${S.history.length})` : 'Desfazer';
    $('#fileInfo').innerHTML = has
      ? `${esc(S.name)} <span class="badge">${S.M.program === 'epanet' ? 'EPANET' : 'SWMM'}</span>${S.modified ? ' <b title="Alterações não salvas" style="color:var(--warn)">●</b>' : ''}`
      : '';
  }
  function renderSide() {
    const side = $('#side');
    side.classList.toggle('hide', !S.M);
    if (!S.M) return;
    const q = $('#secSearch').value.trim().toLowerCase();
    $('#secs').innerHTML = S.M.sections.map((s, i) => {
      if (s.name === 'END' || (q && !s.name.toLowerCase().includes(q))) return '';
      const n = secCount(s);
      return `<button class="sec ${i === S.cur ? 'on' : ''} ${n ? '' : 'empty'}" data-i="${i}"><span>${esc(s.name)}</span><em>${n || ''}</em></button>`;
    }).join('');
    const miss = Inp.missingSections(S.M).filter(n => !q || n.toLowerCase().includes(q));
    if (miss.length) {
      $('#secs').innerHTML += '<div class="sec-sep" title="Seções padrão que não existem neste arquivo. Ao clicar, a seção é criada; se ficar vazia, não é gravada no .inp.">Seções ausentes — clique para adicionar</div>'
        + miss.map(n => `<button class="sec missing" data-add="${n}"><span>+ ${esc(n)}</span></button>`).join('');
    }
  }
  function renderMain() {
    if (!S.M) return renderLanding();
    const s = sec();
    if (!s) { main.innerHTML = ''; return; }
    if (s.view === 'text') renderText(s);
    else if (s.view === 'form') renderForm(s);
    else if (s.view === 'group') renderGroup(s);
    else if (s.type === 'series') renderSeries(s);
    else renderTable(s);
  }
  function sechead(s) {
    const tabList = s.form ? [['form', 'Formulário']] : s.type === 'series' ? [['table', 'Editor']] : s.groupable ? [['group', 'Por objeto'], ['table', 'Tabela']] : [['table', 'Tabela']];
    tabList.push(['text', 'Texto']);
    const tabs = s.type === 'text' && !s.form ? '' :
      `<span class="tabs">${tabList.map(t => `<button data-act="view" data-v="${t[0]}" class="${s.view === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</span>`;
    return `<div class="sechead"><h2>[${esc(s.name)}]</h2><span class="muted">${secCount(s)} ${s.type === 'series' ? 'séries' : s.type === 'table' ? 'linhas' : s.form ? 'parâmetros' : 'linhas de texto'}</span>${tabs}</div>`;
  }
  function renderLanding() {
    main.innerHTML = `<div class="landing">
    <h1>Editor de arquivos .INP</h1>
    <p class="muted">EPANET e SWMM — edição em tabela, operações em lote, séries e hietogramas.<br>Tudo roda localmente no navegador; nada é enviado a servidor.</p>
    <div class="drop" id="drop"><p><b>Arraste um arquivo .inp aqui</b></p><button class="primary" data-act="open">Escolher arquivo…</button></div>
    <p class="muted">ou comece de um modelo vazio:</p>
    <p><button data-act="new-epanet">Novo EPANET</button> <button data-act="new-swmm">Novo SWMM</button></p></div>`;
  }

  /* ------------------------------------------------------------------ seção em texto */
  function renderText(s) {
    main.innerHTML = sechead(s) + `<p class="note">Edição livre do texto da seção. As alterações são aplicadas ao sair do campo.</p>
    <textarea class="raw" id="raw" spellcheck="false"></textarea>`;
    $('#raw').value = Inp.sectionLines(s).join('\n');
  }

  /* ------------------------------------------------------------------ formulário (chave/valor) */
  const PH = { date: 'MM/DD/AAAA', time: 'hh:mm:ss' };
  function formField(s, f, idx) {
    const [key, label, type, opt] = f;
    if (key === '@choice') {
      const keys = f[2];
      const cur = keys.find(k => Inp.kvGet(s.lines, k[0]) !== null);
      const v = cur ? Inp.kvGet(s.lines, cur[0]) : '';
      return `<label>${esc(label)}<select data-choice="${idx}"><option value="">—</option>${keys.map(k => `<option value="${k[0]}" ${cur && cur[0] === k[0] ? 'selected' : ''}>${k[0]}</option>`).join('')}</select></label>
      <label>Valor <span class="k">${cur ? esc(cur[1]) : ''}</span><input data-cv="${idx}" value="${esc(v)}" ${cur ? '' : 'disabled'} placeholder="${cur ? esc(cur[1]) : ''}"></label>`;
    }
    const raw = Inp.kvGet(s.lines, key);
    const v = raw == null ? '' : raw;
    const head = `<label><span>${esc(label)} <code class="k">${esc(key)}</code></span>`;
    if (type === 'sel' || type === 'yn') {
      const opts = (type === 'yn' ? 'YES|NO' : opt).split('|');
      if (v && !opts.some(o => o.toUpperCase() === v.toUpperCase())) opts.push(v);
      return head + `<select data-k="${esc(key)}"><option value="">—</option>${opts.map(o => `<option ${o.toUpperCase() === v.toUpperCase() ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    }
    return head + `<input data-k="${esc(key)}" value="${esc(v)}" placeholder="${esc(opt || PH[type] || '')}"></label>`;
  }
  function renderForm(s) {
    const def = Inp.formFor(S.M.program, s.name);
    let h = sechead(s) + '<p class="note">Campos em branco não são gravados no arquivo (o programa usa seu valor padrão). Para remover um parâmetro, esvazie o campo.</p>';
    let open = false;
    def.forEach((f, i) => {
      if (f[0] === '#') { if (open) h += '</div>'; h += `<h3 class="fgroup">${esc(f[1])}</h3><div class="form">`; open = true; return; }
      if (!open) { h += '<div class="form">'; open = true; }
      h += formField(s, f, i);
    });
    if (open) h += '</div>';
    const ex = Inp.kvExtras(s.lines, def);
    h += `<h3 class="fgroup">Outras linhas</h3><p class="note">Parâmetros não listados acima e comentários — uma linha por item.</p>
    <textarea class="raw" id="kvx" spellcheck="false" style="height:${Math.max(70, 20 * (ex.length + 2))}px;max-height:300px">${esc(ex.join('\n'))}</textarea>`;
    main.innerHTML = h;
  }

  /* ------------------------------------------------------------------ visão por objeto (vértices, polígonos, ...) */
  function xyCols(cols) {
    const x = cols.findIndex((c, i) => i > 0 && /^x(-?coord)?$/i.test(c)), y = cols.findIndex((c, i) => i > 0 && /^y(-?coord)?$/i.test(c));
    return x > 0 && y > 0 ? [x, y] : null;
  }
  function curGroup(s) { return Inp.groups(s).get(S.selGroup[s.name]) || []; }
  function renderGroup(s) {
    const g = Inp.groups(s);
    if (!g.has(S.selGroup[s.name])) S.selGroup[s.name] = g.size ? [...g.keys()][0] : undefined;
    main.innerHTML = sechead(s) + `<div class="split"><div class="slist">
      <input id="gflt" type="search" placeholder="Buscar objeto…" value="${esc(S.gFilter)}">
      <div class="items" id="gitems"></div>
      <button data-act="gnew">+ Novo objeto</button>
    </div><div class="seditor" id="ged"></div></div>`;
    drawGroupList(); drawGroupEditor();
  }
  function drawGroupList() {
    const s = sec(), q = S.gFilter.trim().toLowerCase(), cap = 500;
    const all = [...Inp.groups(s)].filter(([k]) => !q || String(k).toLowerCase().includes(q));
    $('#gitems').innerHTML = all.slice(0, cap).map(([k, a]) => `<button data-act="gpick" data-n="${esc(k)}" class="${k === S.selGroup[s.name] ? 'on' : ''}"><span>${esc(k)}</span><em>${a.length}</em></button>`).join('')
      + (all.length > cap ? `<p class="note" style="padding:6px 8px">… e mais ${all.length - cap}. Use a busca.</p>` : '')
      || '<p class="note" style="padding:8px">Nenhum objeto.</p>';
  }
  function drawGroupEditor() {
    const s = sec(), el = $('#ged'), items = curGroup(s);
    const id = S.selGroup[s.name];
    if (!items.length) { el.innerHTML = '<p class="note">Selecione ou crie um objeto.</p>'; return; }
    const cols = Inp.columns(s, S.M.program), xy = xyCols(cols);
    let h = `<div class="card"><div class="toolbar">
      <label class="muted">ID <input id="gname" value="${esc(id)}" style="width:170px"></label>
      <span class="spacer"></span>
      <button class="small" data-act="grev">Inverter ordem</button>
      <button class="small" data-act="gdup">Duplicar</button>
      <button class="small" data-act="gcopy">Copiar (TSV)</button>
      <button class="small danger" data-act="gdel">Excluir objeto</button></div>`;
    if (xy) h += '<div id="gchart"></div>';
    h += `</div><div class="tblwrap" style="max-height:calc(100vh - ${xy ? 560 : 330}px);min-height:140px"><table class="grid"><thead><tr><th>#</th>${cols.slice(1).map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>`;
    items.forEach((it, i) => {
      h += `<tr data-g="${i}"><td class="n">${i + 1}</td>${cols.slice(1).map((c, k) => `<td><input data-gc="${k + 1}" value="${esc(it.cells[k + 1] == null ? '' : it.cells[k + 1])}"></td>`).join('')}`
        + `<td style="white-space:nowrap"><button class="small" data-act="gup" data-g="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button class="small" data-act="gdown" data-g="${i}" title="Descer" ${i === items.length - 1 ? 'disabled' : ''}>↓</button><button class="small" data-act="growdel" data-g="${i}" title="Remover">×</button></td></tr>`;
    });
    h += `</tbody></table></div><div class="toolbar" style="margin-top:8px"><button data-act="growadd">+ ${xy ? 'Ponto' : 'Linha'}</button><span class="muted">${items.length} linha(s) — cole colunas do Excel direto nas células.</span></div>`;
    el.innerHTML = h;
    drawGroupChart();
  }
  function drawGroupChart() {
    const s = sec(), el = $('#gchart');
    if (!el) return;
    const cols = Inp.columns(s, S.M.program), [xi, yi] = xyCols(cols);
    const pts = curGroup(s).map(it => [Inp.num(it.cells[xi]), Inp.num(it.cells[yi])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    const ends = s.name === 'VERTICES' ? Inp.linkEnds(S.M, S.selGroup[s.name]) : null;
    el.innerHTML = xyChart(pts, { closed: s.name === 'POLYGONS', ends });
  }
  function xyChart(pts, o) {
    const W = 640, H = 280, P = 24;
    const all = pts.concat((o.ends || []).filter(Boolean));
    if (!all.length) return '<div class="note">Sem coordenadas numéricas para exibir.</div>';
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const dx = (Math.max(...xs) - x0) || 1, dy = (Math.max(...ys) - y0) || 1;
    const k = Math.min((W - 2 * P) / dx, (H - 2 * P) / dy);
    const ox = (W - dx * k) / 2, oy = (H - dy * k) / 2;
    const X = x => (ox + (x - x0) * k).toFixed(1), Y = y => (H - oy - (y - y0) * k).toFixed(1);
    let g = '';
    const path = pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ');
    if (o.closed && pts.length > 2) g += `<polygon class="pg" points="${path}"/>`;
    else if (pts.length > 1) {
      const chain = [o.ends && o.ends[0], ...pts, o.ends && o.ends[1]].filter(Boolean);
      g += `<polyline class="ln" points="${chain.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}"/>`;
    }
    if (!o.closed && o.ends) o.ends.forEach(p => { if (p) g += `<circle class="nd" cx="${X(p[0])}" cy="${Y(p[1])}" r="5"/>`; });
    if (pts.length <= 60) pts.forEach((p, i) => { g += `<circle class="pt" cx="${X(p[0])}" cy="${Y(p[1])}" r="3"/>${pts.length <= 25 ? `<text x="${+X(p[0]) + 5}" y="${+Y(p[1]) - 5}">${i + 1}</text>` : ''}`; });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg><div class="note">${o.ends ? 'Círculos grandes: nós de origem e destino do trecho. ' : ''}Escala igual nos dois eixos.</div>`;
  }
  function onGroupPaste(e, input) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    const s = sec(), items = curGroup(s), id = S.selGroup[s.name];
    const r0 = +input.closest('tr').dataset.g, c0 = +input.dataset.gc, ncols = Inp.columns(s, S.M.program).length;
    snapshot();
    parseClip(text).forEach((line, i) => {
      let it = items[r0 + i];
      if (!it) { it = Inp.addRow(s, [id, ...new Array(ncols - 1).fill('')], items[items.length - 1]); items.push(it); }
      line.forEach((v, j) => { if (c0 + j < ncols) Inp.setCell(it, c0 + j, v.trim()); });
    });
    drawGroupEditor(); drawGroupList();
  }

  /* ------------------------------------------------------------------ tabelas */
  function filteredRows(s) {
    const q = S.filter.trim().toLowerCase();
    const out = [];
    Inp.rows(s).forEach((item, n) => {
      if (!q || item.cells.join(' ').toLowerCase().includes(q) || (item.comment || '').toLowerCase().includes(q)) out.push({ item, n: n + 1 });
    });
    return out;
  }
  function renderTable(s) {
    main.innerHTML = sechead(s) + `<div class="toolbar">
      <input id="flt" type="search" placeholder="Filtrar linhas…" value="${esc(S.filter)}" style="width:220px">
      <button data-act="addrow">+ Linha</button>
      <button data-act="duprow">Duplicar</button>
      <button data-act="delrow" class="danger">Excluir selecionadas</button>
      <button data-act="bulk">Operação em lote…</button>
      <button data-act="copytsv">Copiar (TSV)</button>
      <span class="spacer"></span>
      <label class="muted">Linhas/pág. <select id="ps">${[50, 100, 250, 500].map(n => `<option ${n === S.ps ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div><div class="tblwrap" id="tbl"></div><div class="pager" id="pager"></div>`;
    refreshTable();
  }
  function refreshTable() {
    const s = sec();
    const cols = Inp.columns(s, S.M.program);
    const all = filteredRows(s);
    const pages = Math.max(1, Math.ceil(all.length / S.ps));
    S.page = Math.min(S.page, pages - 1);
    const slice = all.slice(S.page * S.ps, (S.page + 1) * S.ps);
    S.ctx = { rows: slice, all, cols };
    let h = `<table class="grid"><thead><tr><th><input type="checkbox" id="selAll" title="Selecionar todas as filtradas"></th><th>#</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Comentário</th></tr></thead><tbody>`;
    slice.forEach(({ item, n }, i) => {
      h += `<tr data-i="${i}" class="${S.selected.has(item) ? 'sel' : ''}"><td><input type="checkbox" class="sel" ${S.selected.has(item) ? 'checked' : ''}></td><td class="n">${n}</td>`;
      cols.forEach((c, ci) => { h += `<td><input data-c="${ci}" value="${esc(item.cells[ci] == null ? '' : item.cells[ci])}"></td>`; });
      h += `<td class="c"><input class="cm" value="${esc(item.comment || '')}"></td></tr>`;
    });
    h += '</tbody></table>';
    if (!slice.length) h += '<p class="note" style="padding:12px">Nenhuma linha. Use “+ Linha” ou ajuste o filtro.</p>';
    $('#tbl').innerHTML = h;
    const nsel = S.selected.size;
    $('#pager').innerHTML = `<button data-act="prev" ${S.page === 0 ? 'disabled' : ''}>‹</button><span>pág. ${S.page + 1}/${pages}</span><button data-act="next" ${S.page >= pages - 1 ? 'disabled' : ''}>›</button>
    <span class="muted">${all.length} linha(s)${S.filter ? ' filtradas' : ''}${nsel ? ` · ${nsel} selecionada(s)` : ''}</span>`;
  }
  function parseClip(text) {
    const rows = text.replace(/\r/g, '').split('\n');
    while (rows.length && rows[rows.length - 1] === '') rows.pop();
    return rows.map(r => r.split('\t'));
  }
  function onTablePaste(e, input) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    const s = sec(), tr = input.closest('tr');
    const r0 = +tr.dataset.i, c0 = +input.dataset.c;
    const m = parseClip(text);
    snapshot();
    const list = S.ctx.all, start = S.page * S.ps + r0;
    const ncols = S.ctx.cols.length;
    m.forEach((line, i) => {
      let item = list[start + i] && list[start + i].item;
      if (!item) item = Inp.addRow(s, new Array(ncols).fill(''));
      line.forEach((v, j) => { if (c0 + j < ncols) Inp.setCell(item, c0 + j, v.trim()); });
    });
    refreshTable(); renderSide();
    toast(`${m.length} linha(s) coladas`);
  }

  /* ------------------------------------------------------------------ séries */
  function curSeries(s) { return s.series.find(x => x.name === S.selSeries[s.name]); }
  function renderSeries(s) {
    if (!S.selSeries[s.name] && s.series.length) S.selSeries[s.name] = s.series[0].name;
    main.innerHTML = sechead(s) + `<div class="split"><div class="slist">
      <input id="sflt" type="search" placeholder="Buscar série…" value="${esc(S.sFilter)}">
      <div class="items" id="sitems"></div>
      <button data-act="snew">+ Nova série</button>
      ${s.skind === 'ts' ? '<button data-act="hyeto" class="primary">Gerar hietograma…</button>' : ''}
    </div><div class="seditor" id="sed"></div></div>`;
    drawSeriesList(); drawSeriesEditor();
  }
  function drawSeriesList() {
    const s = sec(), q = S.sFilter.trim().toLowerCase();
    const list = s.series.filter(x => !q || x.name.toLowerCase().includes(q));
    $('#sitems').innerHTML = list.map(x => `<button data-act="spick" data-n="${esc(x.name)}" class="${x.name === S.selSeries[s.name] ? 'on' : ''}"><span>${esc(x.name)}</span><em>${x.file != null ? 'arq.' : x.rows.length}</em></button>`).join('')
      || '<p class="note" style="padding:8px">Nenhuma série.</p>';
  }
  const CURVE_TYPES = ['Storage', 'Shape', 'Diversion', 'Tidal', 'Pump1', 'Pump2', 'Pump3', 'Pump4', 'Rating', 'Control', 'Weir'];
  function seriesPoints(s, ser) {
    const ys = ser.rows.map(r => num(r[r.length - 1]));
    let xs;
    if (ser.kind === 'ts') xs = ser.rows.map(r => Inp.timeToHours(r[1]));
    else if (ser.kind === 'curve') xs = ser.rows.map(r => num(r[0]));
    else xs = ser.rows.map((r, i) => i);
    if (xs.some(x => !isFinite(x))) xs = ser.rows.map((r, i) => i);
    return { xs, ys };
  }
  function drawChart() {
    const s = sec(), ser = curSeries(s), el = $('#chart');
    if (!ser || !el) return;
    const { xs, ys } = seriesPoints(s, ser);
    el.innerHTML = chartSVG(xs, ys, { kind: ser.kind === 'curve' ? 'line' : 'bars', xlabel: ser.kind === 'ts' ? 'h' : '' });
  }
  function drawSeriesEditor() {
    const s = sec(), ser = curSeries(s), el = $('#sed');
    if (!ser) { el.innerHTML = '<p class="note">Selecione ou crie uma série.</p>'; return; }
    const cols = Inp.seriesCols(ser.kind);
    const hasType = ser.kind === 'curve' && s.swmm || ser.kind === 'pattern' && s.swmm;
    const typeList = ser.kind === 'curve' ? CURVE_TYPES : ['MONTHLY', 'DAILY', 'HOURLY', 'WEEKEND'];
    const note = ser.comments.filter(c => c.trim() && c.trim() !== ';').map(c => esc(c.replace(/^[;\s]+/, ''))).join(' · ');
    let h = `<div class="card"><div class="toolbar">
      <label class="muted">Nome <input id="sname" value="${esc(ser.name)}" style="width:170px"></label>
      ${hasType ? `<label class="muted">Tipo <input id="stype" list="stypes" value="${esc(ser.ptype)}" style="width:120px"><datalist id="stypes">${typeList.map(t => `<option>${t}</option>`).join('')}</datalist></label>` : ''}
      <span class="spacer"></span>
      <button class="small" data-act="sdup">Duplicar</button>
      <button class="small" data-act="sscale">Escalar valores…</button>
      <button class="small" data-act="scopy">Copiar (TSV)</button>
      <button class="small danger" data-act="sdel">Excluir série</button></div>`;
    if (note) h += `<p class="note">${note}</p>`;
    if (ser.file != null) {
      h += `<p class="warn">Esta série lê dados de arquivo externo (FILE ${esc(ser.file)}). Edite na aba “Texto”.</p></div>`;
      el.innerHTML = h; return;
    }
    h += `<div id="chart"></div></div><div class="tblwrap" style="max-height:calc(100vh - 470px);min-height:160px"><table class="grid"><thead><tr><th>#</th>${cols.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>`;
    ser.rows.forEach((r, i) => {
      h += `<tr data-r="${i}"><td class="n">${i + 1}</td>${cols.map((c, ci) => `<td><input data-sc="${ci}" value="${esc(r[ci] == null ? '' : r[ci])}"></td>`).join('')}<td><button class="small" data-act="srowdel" data-r="${i}" title="Remover linha">×</button></td></tr>`;
    });
    h += `</tbody></table></div><div class="toolbar" style="margin-top:8px"><button data-act="srowadd">+ Ponto</button><span class="muted">${ser.rows.length} ponto(s) — cole colunas do Excel direto nas células.</span></div>`;
    el.innerHTML = h;
    drawChart();
  }
  function newSeriesRow(ser) {
    if (ser.kind === 'ts') return ['', '', '0'];
    if (ser.kind === 'curve') return ['0', '0'];
    return ['1'];
  }
  function onSeriesPaste(e, input) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    const s = sec(), ser = curSeries(s);
    const r0 = +input.closest('tr').dataset.r, c0 = +input.dataset.sc;
    const ncols = Inp.seriesCols(ser.kind).length;
    snapshot();
    parseClip(text).forEach((line, i) => {
      while (ser.rows.length <= r0 + i) ser.rows.push(newSeriesRow(ser).map(() => ''));
      line.forEach((v, j) => { if (c0 + j < ncols) ser.rows[r0 + i][c0 + j] = v.trim(); });
    });
    ser.dirty = true;
    drawSeriesEditor(); drawSeriesList();
  }
  function uniqueName(s, base) {
    let n = base, k = 2;
    while (s.series.some(x => x.name === n)) n = base + '_' + k++;
    return n;
  }

  /* ------------------------------------------------------------------ gráfico SVG */
  function fmtAx(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : (+v.toFixed(2)).toString(); }
  function chartSVG(xs, ys, o) {
    const pts = ys.map((y, i) => ({ x: xs[i], y })).filter(p => isFinite(p.x) && isFinite(p.y));
    if (!pts.length) return '<div class="note">Sem dados numéricos para exibir.</div>';
    const W = 640, H = 190, L = 42, R = 10, T = 10, B = 24;
    const xmin = Math.min(...pts.map(p => p.x));
    let xmax = Math.max(...pts.map(p => p.x));
    const bars = o.kind === 'bars';
    let lastW = 1;
    if (bars && pts.length > 1) lastW = pts[pts.length - 1].x - pts[pts.length - 2].x || 1;
    if (bars) xmax += lastW;
    if (xmax === xmin) xmax = xmin + 1;
    const ymin = Math.min(0, ...pts.map(p => p.y)), ymaxRaw = Math.max(...pts.map(p => p.y));
    const ymax = ymaxRaw === ymin ? ymin + 1 : ymaxRaw;
    const X = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
    const Y = y => H - B - (y - ymin) / (ymax - ymin) * (H - B - T);
    let g = `<line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>`;
    [ymin, (ymin + ymax) / 2, ymax].forEach(v => { g += `<text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${fmtAx(v)}</text><line class="ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke-dasharray="2 3"/>`; });
    g += `<text x="${L}" y="${H - 8}">${fmtAx(xmin)}${o.xlabel ? ' ' + o.xlabel : ''}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${fmtAx(xmax)}${o.xlabel ? ' ' + o.xlabel : ''}</text>`;
    if (bars) {
      pts.forEach((p, i) => {
        const nx = i < pts.length - 1 ? pts[i + 1].x : p.x + lastW;
        const x0 = X(p.x), w = Math.max(1, X(nx) - x0 - (pts.length < 120 ? 1 : 0));
        const y0 = Y(Math.max(p.y, 0)), y1 = Y(Math.min(p.y, 0));
        g += `<rect class="bar" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, y1 - y0).toFixed(1)}"/>`;
      });
    } else {
      g += `<polyline class="ln" points="${pts.map(p => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')}"/>`;
      if (pts.length < 60) pts.forEach(p => { g += `<circle class="pt" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.5"/>`; });
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }

  /* ------------------------------------------------------------------ diálogos */
  function openDialog(o) {
    dlg.innerHTML = `<div class="dh">${o.title}</div><div class="db">${o.body}</div><div class="df"><span id="dmsg" class="muted" style="margin-right:auto"></span><button id="dCancel">Cancelar</button><button id="dApply" class="primary">${o.applyLabel || 'Aplicar'}</button></div>`;
    $('#dCancel', dlg).onclick = () => dlg.close();
    $('#dApply', dlg).onclick = () => { if (o.onApply() !== false) dlg.close(); };
    if (!dlg.open) dlg.showModal();
    if (o.onOpen) o.onOpen();
  }
  const dv = id => $('#' + id, dlg).value;
  const dc = id => $('#' + id, dlg).checked;
  function dmsg(t, bad) { const m = $('#dmsg', dlg); m.textContent = t; m.style.color = bad ? 'var(--danger)' : ''; }

  /* ---- operação em lote (tabela atual) */
  function openBulk() {
    const s = sec();
    if (!s || s.type !== 'table') return;
    const cols = Inp.columns(s, S.M.program);
    const nFilt = S.ctx.all ? S.ctx.all.length : Inp.rows(s).length;
    openDialog({
      title: `Operação em lote — [${esc(s.name)}]`, applyLabel: 'Aplicar',
      body: `<div class="form">
      <label>Coluna<select id="b_col">${cols.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label>Operação<select id="b_op"><option value="set">Definir valor</option><option value="mul">Multiplicar por</option><option value="add">Somar</option><option value="replace">Substituir texto</option><option value="expr">Expressão JavaScript</option></select></label>
      <label id="b_vl"><span id="b_vlt">Valor</span><input id="b_val"></label>
      <label id="b_v2l" class="hide">Substituir por<input id="b_val2"></label>
      <label>Casas decimais<input id="b_dec" type="number" min="0" max="12" value="4"></label>
      <div class="wide"><div class="radios"><span class="muted">Linhas:</span>
        <label><input type="radio" name="b_sc" value="all" checked> Todas (${Inp.rows(s).length})</label>
        <label><input type="radio" name="b_sc" value="filt"> Filtradas (${nFilt})</label>
        <label><input type="radio" name="b_sc" value="sel" ${S.selected.size ? '' : 'disabled'}> Selecionadas (${S.selected.size})</label></div></div>
      <label class="wide">Condição opcional (JavaScript, ex.: <code>r.Elev &gt; 700 &amp;&amp; r.Demand == 0</code>)<input id="b_cond" placeholder="deixe em branco para todas"></label>
    </div><p class="note" id="b_hint"></p><div id="b_prev"></div>`,
      onOpen() {
        const upd = () => {
          const op = dv('b_op');
          $('#b_v2l', dlg).classList.toggle('hide', op !== 'replace');
          $('#b_vlt', dlg).textContent = { set: 'Valor', mul: 'Fator', add: 'Valor a somar', replace: 'Texto a procurar', expr: 'Expressão' }[op];
          $('#b_hint', dlg).textContent = op === 'expr' ? 'Variáveis: v = valor atual, i = índice da linha, r = linha (r.NomeDaColuna). Ex.: v * 0.3048   ou   r.Demand * 1.2' : '';
          const plan = bulkPlan();
          if (!plan) return;
          $('#b_prev', dlg).innerHTML = `<div class="stat"><span><b>${plan.length}</b> célula(s) serão alteradas</span></div>` + (plan.length ? `<div class="preview"><table><tr><th>Linha</th><th>Atual</th><th>Novo</th></tr>${plan.slice(0, 12).map(p => `<tr><td>${esc(p.item.cells[0])}</td><td>${esc(p.old)}</td><td>${esc(p.neu)}</td></tr>`).join('')}</table></div>` : '');
          dmsg('');
        };
        dlg.oninput = dlg.onchange = upd;
        upd();
      },
      onApply() {
        const plan = bulkPlan();
        if (!plan || !plan.length) { dmsg('Nada a alterar.', true); return false; }
        snapshot(); Inp.applyPlan(plan);
        refreshTable(); toast(`${plan.length} célula(s) alteradas`);
      },
    });
    function bulkPlan() {
      const sc = (dlg.querySelector('input[name=b_sc]:checked') || {}).value;
      let items = null;
      if (sc === 'filt') items = new Set(S.ctx.all.map(x => x.item));
      if (sc === 'sel') items = new Set(S.selected);
      try {
        return Inp.bulkPlan(s, S.M.program, { column: dv('b_col'), op: dv('b_op'), value: dv('b_val'), value2: dv('b_val2'), cond: dv('b_cond'), decimals: +dv('b_dec'), items });
      } catch (e) { dmsg('Erro: ' + e.message, true); $('#b_prev', dlg).innerHTML = ''; return null; }
    }
  }

  /* ---- EPANET: demandas */
  const DEMAND_MODES = [
    ['set', 'Definir demanda de cada nó', 'Valor'],
    ['mul', 'Multiplicar demanda atual', 'Fator'],
    ['add', 'Somar à demanda atual', 'Valor a somar'],
    ['total-equal', 'Distribuir vazão total — igualmente entre os nós', 'Vazão total'],
    ['total-prop', 'Distribuir vazão total — proporcional à demanda atual', 'Vazão total'],
    ['total-len', 'Distribuir vazão total — proporcional ao comprimento dos trechos conectados', 'Vazão total'],
    ['perlen', 'Vazão por comprimento (taxa × ½ comprimento dos trechos conectados)', 'Vazão por unidade de comprimento'],
  ];
  function openDemand() {
    const js = Inp.getSection(S.M, 'JUNCTIONS');
    if (!js) { toast('O modelo não tem [JUNCTIONS].'); return; }
    const pats = (Inp.getSection(S.M, 'PATTERNS') || { series: [] }).series.map(p => p.name);
    const nSel = sec() === js ? S.selected.size : 0;
    const units = Inp.optionValue(S.M, 'Units') || 'unidade do modelo';
    openDialog({
      title: 'Demandas dos nós — [JUNCTIONS]', applyLabel: 'Aplicar demandas',
      body: `<div class="form">
      <label class="wide">Operação<select id="d_mode">${DEMAND_MODES.map(m => `<option value="${m[0]}">${m[1]}</option>`).join('')}</select></label>
      <label><span id="d_vlt">Valor</span><input id="d_val" value="1"></label>
      <label>Casas decimais<input id="d_dec" type="number" min="0" max="10" value="4"></label>
      <div class="wide"><div class="radios"><span class="muted">Nós:</span>
        <label><input type="radio" name="d_sc" value="all" checked> Todos (${Inp.rows(js).length})</label>
        <label><input type="radio" name="d_sc" value="pos"> Com demanda &gt; 0</label>
        <label><input type="radio" name="d_sc" value="zero"> Com demanda = 0</label>
        <label><input type="radio" name="d_sc" value="items" ${nSel ? '' : 'disabled'}> Selecionados na tabela (${nSel})</label></div></div>
      <label class="wide">Condição opcional (JavaScript, ex.: <code>r.Elev &lt; 700</code>)<input id="d_cond" placeholder="deixe em branco para todos"></label>
      <div class="wide"><div class="radios"><span class="muted">Padrão temporal:</span>
        <label><input type="radio" name="d_pt" value="keep" checked> Manter</label>
        <label><input type="radio" name="d_pt" value="set"> Definir:</label>
        <input id="d_pat" list="d_pats" style="width:110px" placeholder="ID do padrão"><datalist id="d_pats">${pats.map(p => `<option>${esc(p)}</option>`).join('')}</datalist>
        <label><input type="radio" name="d_pt" value="clear"> Remover</label></div></div>
    </div><p class="note">Unidade de vazão do modelo: <b>${esc(units)}</b>. Demandas adicionais da seção [DEMANDS] não são alteradas.</p>
    <div id="d_prev"></div>`,
      onOpen() {
        const upd = () => {
          const mode = DEMAND_MODES.find(m => m[0] === dv('d_mode'));
          $('#d_vlt', dlg).textContent = mode[2];
          const p = plan();
          if (!p) return;
          const dec = +dv('d_dec');
          $('#d_prev', dlg).innerHTML = `<div class="stat"><span><b>${p.rows.length}</b> nós</span><span>Σ atual: <b>${Inp.fmtNum(p.sumOld, dec)}</b></span><span>Σ novo: <b>${Inp.fmtNum(p.sumNew, dec)}</b></span></div>`
            + p.warn.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')
            + `<div class="preview"><table><tr><th>Nó</th><th>Atual</th><th>Novo</th><th>Padrão</th></tr>${p.rows.slice(0, 15).map(r => `<tr><td>${esc(r.id)}</td><td>${r.old}</td><td>${r.neu}</td><td>${esc(r.newPat)}</td></tr>`).join('')}${p.rows.length > 15 ? `<tr><td colspan="4" class="muted">… e mais ${p.rows.length - 15}</td></tr>` : ''}</table></div>`;
          dmsg('');
        };
        dlg.oninput = dlg.onchange = upd;
        upd();
      },
      onApply() {
        const p = plan();
        if (!p || !p.rows.length) { dmsg('Nenhum nó selecionado.', true); return false; }
        if (isNaN(num(dv('d_val')))) { dmsg('Informe um valor numérico.', true); return false; }
        snapshot();
        Inp.applyDemandPlan(p, radio('d_pt'), +dv('d_dec'));
        if (S.M.sections[S.cur] === js) refreshTable();
        else goSection('JUNCTIONS');
        toast(`Demandas atualizadas em ${p.rows.length} nós`);
      },
    });
    function radio(n) { return (dlg.querySelector(`input[name=${n}]:checked`) || {}).value; }
    function plan() {
      try {
        return Inp.demandPlan(S.M, {
          scope: radio('d_sc'), items: S.selected, cond: dv('d_cond'), mode: dv('d_mode'), value: dv('d_val'),
          decimals: +dv('d_dec'), pattern: { mode: radio('d_pt'), value: dv('d_pat').trim() }
        });
      } catch (e) { dmsg('Erro: ' + e.message, true); return null; }
    }
  }

  /* ---- SWMM: hietograma */
  function openHyeto() {
    const units = Inp.optionValue(S.M, 'FLOW_UNITS') || '?';
    const us = /^(CFS|GPM|MGD)$/i.test(units);
    const rgs = (Inp.getSection(S.M, 'RAINGAGES') || { items: [] }).items;
    openDialog({
      title: 'Gerador de hietogramas — SWMM', applyLabel: 'Inserir no modelo',
      body: `<div class="form">
      <label class="wide">Método<select id="h_method"><option value="alt">Blocos alternados (a partir da IDF)</option><option value="chicago">Chicago (Keifer &amp; Chu, a partir da IDF)</option><option value="rect">Retangular (intensidade média da IDF)</option></select></label>
      <label>K<input id="h_K" type="number" step="any" value="1000"></label>
      <label>a<input id="h_a" type="number" step="any" value="0.2"></label>
      <label>b<input id="h_b" type="number" step="any" value="10"></label>
      <label>c<input id="h_c" type="number" step="any" value="0.8"></label>
      <label>T — retorno (anos)<input id="h_T" type="number" step="any" value="10"></label>
      <label>Duração (min)<input id="h_D" type="number" step="any" value="120"></label>
      <label>Intervalo Δt (min)<input id="h_dt" type="number" step="1" min="1" value="5"></label>
      <label>Posição do pico (0–1)<input id="h_r" type="number" step="0.05" min="0" max="1" value="0.5"></label>
      <label>2º maior bloco<select id="h_fa"><option value="1">depois do pico</option><option value="0">antes do pico</option></select></label>
      <label>Altura total fixa (mm) — opcional<input id="h_P" type="number" step="any" placeholder="vazio = da IDF"></label>
      <label>Formato do pluviômetro<select id="h_fmt"><option value="INTENSITY">INTENSITY (valores em mm/h)</option><option value="VOLUME">VOLUME (mm por intervalo)</option></select></label>
      <label>Nome da série<input id="h_name" value="TR10"></label>
      <label>Casas decimais<input id="h_dec" type="number" min="0" max="6" value="2"></label>
      <label class="inline"><input id="h_zero" type="checkbox" checked> Zero no final</label>
      <label class="inline"><input id="h_rg" type="checkbox" checked> Criar/atualizar pluviômetro</label>
      <label>Nome do pluviômetro<input id="h_rgn" value="RG1" list="h_rgs"><datalist id="h_rgs">${rgs.filter(r => r.kind === 'row').map(r => `<option>${esc(r.cells[0])}</option>`).join('')}</datalist></label>
      <label>SCF<input id="h_scf" type="number" step="any" value="1"></label>
    </div>
    <p class="note">IDF: <b>i = K·T<sup>a</sup> / (t + b)<sup>c</sup></b>, com t em minutos e i em mm/h. Os valores acima são apenas um exemplo — use os parâmetros da sua localidade.
    ${us ? `<span class="warn">FLOW_UNITS = ${esc(units)} (unidades US): o SWMM espera chuva em polegadas — converta a IDF para in/h e “altura” para in.</span>` : `FLOW_UNITS = ${esc(units)} (SI: mm e mm/h).`}</p>
    <div id="h_prev"></div>`,
      onOpen() {
        const upd = () => { const r = calc(); show(r); };
        dlg.oninput = dlg.onchange = upd;
        upd();
      },
      onApply() {
        const r = calc();
        if (!r.ok) { dmsg(r.err, true); return false; }
        const name = dv('h_name').trim();
        if (!name || /\s/.test(name)) { dmsg('Nome da série inválido (sem espaços).', true); return false; }
        const exists = (Inp.getSection(S.M, 'TIMESERIES') || { series: [] }).series.some(x => x.name === name);
        if (exists && !confirm(`A série "${name}" já existe e será substituída. Continuar?`)) return false;
        const p = r.p, fmt = dv('h_fmt');
        const rows = Inp.hyetographRows(r.h, fmt, +dv('h_dec'), dc('h_zero'));
        const label = { alt: 'Blocos alternados', chicago: 'Chicago', rect: 'Retangular' }[p.method];
        const comment = `Hietograma (${label}): i=${p.K}*T^${p.a}/(t+${p.b})^${p.c}, T=${p.T} anos, D=${p.D} min, dt=${p.dt} min${p.method !== 'rect' ? ', pico=' + p.r : ''}`;
        const gage = dc('h_rg') ? { name: dv('h_rgn').trim() || 'RG1', format: fmt, scf: dv('h_scf') || 1 } : null;
        snapshot();
        Inp.applyHyetograph(S.M, name, rows, gage, r.h, comment);
        S.selSeries.TIMESERIES = name;
        goSection('TIMESERIES');
        toast(`Série ${name} inserida${gage ? ' e pluviômetro ' + gage.name + ' atualizado' : ''}`);
      },
    });
    function calc() {
      const g = id => num(dv(id));
      const p = {
        method: dv('h_method'), K: g('h_K'), a: g('h_a'), b: g('h_b'), c: g('h_c'), T: g('h_T'), D: g('h_D'), dt: Math.round(g('h_dt')),
        r: g('h_r'), firstAfter: dv('h_fa') === '1', ptotal: g('h_P')
      };
      if ([p.K, p.a, p.b, p.c, p.T, p.D, p.dt, p.r].some(x => isNaN(x))) return { ok: false, err: 'Preencha todos os parâmetros.' };
      if (p.dt < 1 || p.D < p.dt) return { ok: false, err: 'Duração deve ser ≥ Δt, e Δt ≥ 1 min.' };
      if (p.D / p.dt > 5000) return { ok: false, err: 'Blocos demais (>5000).' };
      return { ok: true, p, h: Inp.hyetograph(p) };
    }
    function show(r) {
      const el = $('#h_prev', dlg);
      if (!r.ok) { el.innerHTML = `<div class="warn">${esc(r.err)}</div>`; return; }
      const fmt = dv('h_fmt'), dec = +dv('h_dec');
      const vals = r.h.blocks.map(b => fmt === 'VOLUME' ? b.depth : b.intensity);
      const exact = Math.abs(r.h.D - r.p.D) < 1e-9;
      el.innerHTML = `<div class="stat"><span>Altura total: <b>${Inp.fmtNum(r.h.total, 2)} mm</b></span><span>Intensidade máx.: <b>${Inp.fmtNum(r.h.peak, 1)} mm/h</b></span><span>Blocos: <b>${r.h.n}</b></span><span>Duração: <b>${Inp.minToHHMM(r.h.D)}</b></span></div>`
        + (exact ? '' : `<div class="warn">Duração ajustada para ${r.h.D} min (múltiplo de Δt).</div>`)
        + r.h.warn.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')
        + chartSVG(r.h.blocks.map(b => b.t0), vals, { kind: 'bars', xlabel: 'min' })
        + `<div class="note">Eixo Y: ${fmt === 'VOLUME' ? 'mm por intervalo' : 'mm/h'} · primeiros valores: ${vals.slice(0, 8).map(v => Inp.fmtNum(v, dec)).join(', ')}${vals.length > 8 ? '…' : ''}</div>`;
      dmsg('');
    }
  }

  /* ---- localizar / substituir */
  function openFind() {
    openDialog({
      title: 'Localizar e substituir (arquivo inteiro)', applyLabel: 'Substituir tudo',
      body: `<div class="form"><label class="wide">Localizar<input id="f_find"></label><label class="wide">Substituir por<input id="f_rep"></label>
      <label class="inline"><input id="f_re" type="checkbox"> Expressão regular</label><label class="inline"><input id="f_cs" type="checkbox"> Diferenciar maiúsculas</label>
      <label class="inline"><input id="f_wd" type="checkbox"> Palavra inteira</label></div><p class="note" id="f_cnt"></p>`,
      onOpen() { dlg.oninput = dlg.onchange = () => { const r = build(); $('#f_cnt', dlg).textContent = r.err || (r.re ? `${(Inp.serialize(S.M).match(r.re) || []).length} ocorrência(s)` : ''); }; },
      onApply() {
        const r = build();
        if (r.err || !r.re) { dmsg(r.err || 'Informe o texto a localizar.', true); return false; }
        const text = Inp.serialize(S.M);
        const n = (text.match(r.re) || []).length;
        if (!n) { dmsg('Nenhuma ocorrência.', true); return false; }
        const rep = dv('f_rep');
        snapshot();
        const out = dc('f_re') ? text.replace(r.re, rep) : text.replace(r.re, () => rep);
        const keep = S.cur;
        S.M = Inp.parse(out); S.cur = Math.min(keep, S.M.sections.length - 1); S.selected.clear();
        renderAll(); toast(`${n} ocorrência(s) substituída(s)`);
      },
    });
    function build() {
      const f = dv('f_find');
      if (!f) return {};
      try {
        let src = dc('f_re') ? f : f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (dc('f_wd')) src = '\\b' + src + '\\b';
        return { re: new RegExp(src, 'g' + (dc('f_cs') ? '' : 'i')) };
      } catch (e) { return { err: 'Expressão inválida: ' + e.message }; }
    }
  }

  /* ------------------------------------------------------------------ eventos */
  const fltDebounced = debounce(v => { S.filter = v; S.page = 0; refreshTable(); }, 150);
  function bindEvents() {
    $('#btnOpen').onclick = () => $('#file').click();
    $('#file').onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; };
    $('#btnSave').onclick = save;
    $('#btnUndo').onclick = undo;
    $('#btnDemand').onclick = openDemand;
    $('#btnHyeto').onclick = openHyeto;
    $('#btnFind').onclick = openFind;
    $('#secSearch').oninput = renderSide;
    $('#secs').onclick = e => {
      const a = e.target.closest('[data-add]');
      if (a) { snapshot(); Inp.ensureSection(S.M, a.dataset.add, undefined, undefined, { auto: true }); S.sFilter = ''; return goSection(a.dataset.add); }
      const b = e.target.closest('.sec');
      if (b) { S.cur = +b.dataset.i; S.filter = ''; S.page = 0; S.selected.clear(); S.sFilter = ''; renderAll(); }
    };
    window.addEventListener('beforeunload', e => { if (S.modified) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && S.M) { e.preventDefault(); save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && S.M && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
    });
    // arrastar e soltar
    document.addEventListener('dragover', e => { e.preventDefault(); const d = $('#drop'); if (d) d.classList.add('over'); });
    document.addEventListener('dragleave', () => { const d = $('#drop'); if (d) d.classList.remove('over'); });
    document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

    main.addEventListener('click', onMainClick);
    main.addEventListener('change', onMainChange);
    main.addEventListener('input', e => {
      if (e.target.id === 'flt') fltDebounced(e.target.value);
      if (e.target.id === 'sflt') { S.sFilter = e.target.value; drawSeriesList(); }
      if (e.target.id === 'gflt') { S.gFilter = e.target.value; drawGroupList(); }
    });
    main.addEventListener('paste', e => {
      const t = e.target;
      if (t.matches && t.matches('input[data-c]')) onTablePaste(e, t);
      else if (t.matches && t.matches('input[data-sc]')) onSeriesPaste(e, t);
      else if (t.matches && t.matches('input[data-gc]')) onGroupPaste(e, t);
    });
    main.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches('.grid input[data-c],.grid input[data-sc],.grid input[data-gc]')) return;
      const td = e.target.closest('td'), tr = td.closest('tr'), idx = [...tr.children].indexOf(td);
      const next = (e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling);
      if (next) { const inp = next.children[idx].querySelector('input'); if (inp) { inp.focus(); inp.select(); } }
    });
  }

  function onMainClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, s = sec();
    switch (act) {
      case 'open': return $('#file').click();
      case 'new-epanet': return setModel(Inp.newModel('epanet'), 'novo_epanet.inp');
      case 'new-swmm': return setModel(Inp.newModel('swmm'), 'novo_swmm.inp');
      case 'view': s.view = b.dataset.v; return renderMain();
      case 'prev': S.page--; return refreshTable();
      case 'next': S.page++; return refreshTable();
      case 'bulk': return openBulk();
      case 'hyeto': return openHyeto();
      case 'addrow': {
        snapshot();
        const cols = Inp.columns(s, S.M.program);
        const sel = [...S.selected].pop();
        Inp.addRow(s, new Array(Math.max(1, cols.length)).fill(''), sel);
        S.filter = ''; S.page = 1e9; refreshTable(); renderSide();
        const last = main.querySelector('tbody tr:last-child input[data-c]'); if (last) last.focus();
        return;
      }
      case 'duprow': {
        if (!S.selected.size) return toast('Selecione linhas (caixa à esquerda).');
        snapshot();
        let at;
        [...S.selected].forEach(it => { at = Inp.addRow(s, it.cells.slice(), at || it); at.comment = it.comment; });
        S.selected.clear(); refreshTable(); renderSide(); return;
      }
      case 'delrow': {
        if (!S.selected.size) return toast('Selecione linhas (caixa à esquerda).');
        if (!confirm(`Excluir ${S.selected.size} linha(s)?`)) return;
        snapshot(); Inp.removeItems(s, S.selected); S.selected.clear(); refreshTable(); renderSide(); return;
      }
      case 'copytsv': {
        const txt = S.ctx.all.map(({ item }) => S.ctx.cols.map((c, i) => item.cells[i] || '').join('\t')).join('\n');
        const head = S.ctx.cols.join('\t') + '\n';
        return navigator.clipboard.writeText(head + txt).then(() => toast(`${S.ctx.all.length} linha(s) copiadas`), () => toast('Não foi possível copiar.'));
      }
      case 'gpick': S.selGroup[s.name] = b.dataset.n; drawGroupList(); return drawGroupEditor();
      case 'gnew': {
        const n = (prompt('ID do novo objeto:', '') || '').trim();
        if (!n || /\s/.test(n)) return;
        if (Inp.groups(s).has(n)) return toast('Já existe um objeto com esse ID.');
        const cols = Inp.columns(s, S.M.program), xy = xyCols(cols);
        snapshot();
        Inp.addRow(s, [n, ...cols.slice(1).map((c, i) => xy && xy.includes(i + 1) ? '0' : '')]);
        S.selGroup[s.name] = n; S.gFilter = ''; renderGroup(s); renderSide(); return;
      }
      case 'gdup': {
        const items = curGroup(s); if (!items.length) return;
        let n = S.selGroup[s.name] + '_2', k = 3; const gs = Inp.groups(s);
        while (gs.has(n)) n = S.selGroup[s.name] + '_' + k++;
        snapshot();
        let at = items[items.length - 1];
        items.forEach(it => { const r = Inp.addRow(s, [n, ...it.cells.slice(1)], at); r.comment = it.comment; at = r; });
        S.selGroup[s.name] = n; renderGroup(s); renderSide(); return;
      }
      case 'gdel': {
        const items = curGroup(s);
        if (!items.length || !confirm('Excluir o objeto "' + S.selGroup[s.name] + '" (' + items.length + ' linha(s))?')) return;
        snapshot(); Inp.removeItems(s, new Set(items)); S.selGroup[s.name] = undefined; renderGroup(s); renderSide(); return;
      }
      case 'grev': snapshot(); Inp.reverseGroup(curGroup(s)); return drawGroupEditor();
      case 'gcopy': {
        const cols = Inp.columns(s, S.M.program);
        return navigator.clipboard.writeText(curGroup(s).map(it => cols.slice(1).map((c, i) => it.cells[i + 1] || '').join('\t')).join('\n')).then(() => toast('Copiado'), () => toast('Não foi possível copiar.'));
      }
      case 'gup': case 'gdown': {
        const items = curGroup(s), i = +b.dataset.g, j = act === 'gup' ? i - 1 : i + 1;
        if (!items[j]) return;
        snapshot(); Inp.swapRows(items[i], items[j]); return drawGroupEditor();
      }
      case 'growadd': {
        const items = curGroup(s), last = items[items.length - 1], cols = Inp.columns(s, S.M.program), xy = xyCols(cols);
        snapshot();
        Inp.addRow(s, [S.selGroup[s.name], ...cols.slice(1).map((c, i) => last && xy && last.cells[i + 1] ? last.cells[i + 1] : '')], last);
        drawGroupEditor(); drawGroupList(); renderSide();
        const ins = main.querySelectorAll('#ged tbody tr:last-child input'); if (ins[0]) ins[0].focus();
        return;
      }
      case 'growdel': {
        const items = curGroup(s); snapshot(); Inp.removeItems(s, new Set([items[+b.dataset.g]]));
        if (items.length === 1) { S.selGroup[s.name] = undefined; return renderGroup(s); }
        drawGroupEditor(); drawGroupList(); renderSide(); return;
      }
      case 'spick': S.selSeries[s.name] = b.dataset.n; drawSeriesList(); return drawSeriesEditor();
      case 'snew': {
        const n = prompt('Nome da nova série:', uniqueName(s, s.skind === 'ts' ? 'TS1' : s.skind === 'curve' ? 'CURVA1' : 'PAD1'));
        if (!n || /\s/.test(n.trim())) return;
        if (s.series.some(x => x.name === n.trim())) return toast('Já existe uma série com esse nome.');
        snapshot();
        const ser = Inp.addSeries(s, n.trim(), [newSeriesRow({ kind: s.skind })], { ptype: s.swmm && s.skind === 'pattern' ? 'HOURLY' : s.swmm && s.skind === 'curve' ? 'Storage' : '' });
        S.selSeries[s.name] = ser.name; renderSeries(s); renderSide(); return;
      }
      case 'sdup': {
        const ser = curSeries(s); if (!ser) return;
        snapshot();
        const c = Inp.addSeries(s, uniqueName(s, ser.name), ser.rows.map(r => r.slice()), { ptype: ser.ptype });
        S.selSeries[s.name] = c.name; renderSeries(s); renderSide(); return;
      }
      case 'sdel': {
        const ser = curSeries(s); if (!ser || !confirm(`Excluir a série "${ser.name}"?`)) return;
        snapshot();
        s.series.splice(s.series.indexOf(ser), 1);
        S.selSeries[s.name] = s.series[0] && s.series[0].name;
        renderSeries(s); renderSide(); return;
      }
      case 'sscale': {
        const ser = curSeries(s); if (!ser) return;
        const k = num(prompt('Multiplicar todos os valores por:', '1'));
        if (isNaN(k)) return;
        snapshot();
        const li = ser.rows[0] ? ser.rows[0].length - 1 : 0;
        ser.rows.forEach(r => { const v = num(r[li]); if (!isNaN(v)) r[li] = Inp.fmtNum(v * k, 6); });
        ser.dirty = true; drawSeriesEditor(); return;
      }
      case 'scopy': {
        const ser = curSeries(s); if (!ser) return;
        return navigator.clipboard.writeText(ser.rows.map(r => r.join('\t')).join('\n')).then(() => toast('Copiado'), () => toast('Não foi possível copiar.'));
      }
      case 'srowadd': {
        const ser = curSeries(s); snapshot();
        const last = ser.rows[ser.rows.length - 1];
        ser.rows.push(ser.kind === 'ts' && last ? ['', '', last[2]] : newSeriesRow(ser));
        ser.dirty = true; drawSeriesEditor(); drawSeriesList(); return;
      }
      case 'srowdel': {
        const ser = curSeries(s); snapshot();
        ser.rows.splice(+b.dataset.r, 1); ser.dirty = true; drawSeriesEditor(); drawSeriesList(); return;
      }
    }
  }

  function onMainChange(e) {
    const t = e.target, s = sec();
    if (!s) return;
    if (t.id === 'raw') { snapshot(); Inp.setSectionLines(S.M, s, t.value.split('\n')); renderSide(); return toast('Seção atualizada'); }
    if (t.id === 'ps') { S.ps = +t.value; S.page = 0; return refreshTable(); }
    if (t.id === 'selAll') {
      S.ctx.all.forEach(({ item }) => t.checked ? S.selected.add(item) : S.selected.delete(item));
      return refreshTable();
    }
    if (s.view === 'form') {
      const def = Inp.formFor(S.M.program, s.name);
      if (t.id === 'kvx') { snapshot(); s.lines = Inp.kvSetExtras(s.lines, def, t.value.split('\n')); renderSide(); return renderForm(s); }
      if (t.dataset.k !== undefined) { snapshot(); Inp.kvSet(s.lines, t.dataset.k, t.value); return renderSide(); }
      if (t.dataset.choice !== undefined || t.dataset.cv !== undefined) {
        const idx = t.dataset.choice !== undefined ? t.dataset.choice : t.dataset.cv;
        const key = main.querySelector(`[data-choice="${idx}"]`).value, val = main.querySelector(`[data-cv="${idx}"]`).value;
        snapshot();
        def[idx][2].forEach(k => Inp.kvSet(s.lines, k[0], ''));
        if (key) Inp.kvSet(s.lines, key, t.dataset.choice !== undefined ? '' : val, true);
        renderSide();
        if (t.dataset.choice !== undefined) renderForm(s);
        return;
      }
      return;
    }
    const tr = t.closest('tr');
    if (t.matches('input.sel') && tr) {
      const item = S.ctx.rows[+tr.dataset.i].item;
      t.checked ? S.selected.add(item) : S.selected.delete(item);
      tr.classList.toggle('sel', t.checked);
      return refreshTable();
    }
    if (t.matches('input[data-gc]') && tr) {
      snapshot(); Inp.setCell(curGroup(s)[+tr.dataset.g], +t.dataset.gc, t.value.trim()); return drawGroupChart();
    }
    if (t.id === 'gname') {
      const items = curGroup(s), n = t.value.trim(), old = S.selGroup[s.name];
      if (!n || /\s/.test(n)) { t.value = old; return toast('ID inválido (sem espaços).'); }
      if (n !== old && Inp.groups(s).has(n)) { t.value = old; return toast('Já existe um objeto com esse ID.'); }
      snapshot(); Inp.renameGroup(items, n); S.selGroup[s.name] = n; drawGroupList();
      return toast('Renomeado. O ID deve coincidir com o elemento de referência (trecho/sub-bacia).');
    }
    if (t.matches('input[data-c]') && tr) {
      snapshot(); Inp.setCell(S.ctx.rows[+tr.dataset.i].item, +t.dataset.c, t.value.trim()); return;
    }
    if (t.matches('input.cm') && tr) {
      snapshot();
      const item = S.ctx.rows[+tr.dataset.i].item;
      let v = t.value.trim(); if (v && v[0] !== ';') v = ';' + v;
      item.comment = v; item.dirty = true; return;
    }
    if (t.matches('input[data-sc]') && tr) {
      const ser = curSeries(s); snapshot();
      ser.rows[+tr.dataset.r][+t.dataset.sc] = t.value.trim(); ser.dirty = true; drawChart(); return;
    }
    if (t.id === 'sname') {
      const ser = curSeries(s), n = t.value.trim();
      if (!n || /\s/.test(n)) { t.value = ser.name; return toast('Nome inválido (sem espaços).'); }
      if (s.series.some(x => x !== ser && x.name === n)) { t.value = ser.name; return toast('Já existe uma série com esse nome.'); }
      snapshot(); ser.name = n; ser.dirty = true; S.selSeries[s.name] = n; drawSeriesList();
      return toast('Renomeada. Referências em outras seções não são atualizadas (use Localizar/substituir).');
    }
    if (t.id === 'stype') { const ser = curSeries(s); snapshot(); ser.ptype = t.value.trim(); ser.dirty = true; }
  }

  bindEvents();
  renderAll();
  window.__S = S; // depuração
})();
