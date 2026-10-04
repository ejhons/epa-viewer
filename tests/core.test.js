'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Inp = require('../js/core.js');

const FIX = path.join(__dirname, 'fixtures');
const read = f => fs.readFileSync(path.join(FIX, f), 'latin1');
const fixtures = fs.readdirSync(FIX).filter(f => f.endsWith('.inp'));

test('há fixtures para testar', () => assert.ok(fixtures.length >= 4));

test('round-trip: parse + serialize devolve o arquivo idêntico', () => {
  for (const f of fixtures) {
    const text = read(f);
    assert.equal(Inp.serialize(Inp.parse(text)), text, f);
  }
});

test('detecta o programa', () => {
  assert.equal(Inp.parse(read('net1.inp')).program, 'epanet');
  assert.equal(Inp.parse(read('Culvert_Model.inp')).program, 'swmm');
});

test('preserva fim de linha CRLF', () => {
  const text = read('net1.inp').replace(/\r?\n/g, '\r\n');
  assert.equal(Inp.serialize(Inp.parse(text)), text);
});

test('tokenize respeita aspas e comentário', () => {
  const t = Inp.tokenize('  A  "b c"  3.5 ; nota');
  assert.deepEqual(t.cells, ['A', '"b c"', '3.5']);
  assert.equal(t.comment, '; nota');
});

test('editar célula só reescreve a linha alterada', () => {
  const text = read('net1.inp');
  const m = Inp.parse(text);
  const j = Inp.getSection(m, 'JUNCTIONS');
  Inp.setCell(Inp.rows(j)[1], 2, '999');
  const a = text.split('\n'), b = Inp.serialize(m).split('\n');
  assert.equal(a.length, b.length);
  const diff = a.filter((l, i) => l !== b[i]);
  assert.equal(diff.length, 1);
});

/* ------------------------------------------------------------ séries */
test('séries: padrões do EPANET e curvas do SWMM são regravados corretamente', () => {
  const e = Inp.parse(read('net1.inp'));
  const pat = Inp.getSection(e, 'PATTERNS').series[0];
  assert.equal(pat.rows.length, 12);
  pat.rows.push(['2.0']); pat.dirty = true;
  const again = Inp.getSection(Inp.parse(Inp.serialize(e)), 'PATTERNS').series[0];
  assert.equal(again.rows.length, 13);
  assert.equal(again.rows[12][0], '2.0');

  const s = Inp.parse(read('Culvert_Model.inp'));
  const cv = Inp.getSection(s, 'CURVES').series[0];
  assert.equal(cv.ptype, 'Storage');
  cv.rows[1][1] = '5'; cv.dirty = true;
  const cv2 = Inp.getSection(Inp.parse(Inp.serialize(s)), 'CURVES').series[0];
  assert.equal(cv2.ptype, 'Storage');
  assert.equal(cv2.rows[1][1], '5');
});

/* ------------------------------------------------------------ lote */
test('operação em lote: multiplicar e expressão com condição', () => {
  const m = Inp.parse(read('net1.inp'));
  const j = Inp.getSection(m, 'JUNCTIONS');
  const plan = Inp.bulkPlan(j, 'epanet', { column: 'Demand', op: 'mul', value: '2', decimals: 2 });
  Inp.applyPlan(plan);
  assert.equal(Inp.rows(j)[1].cells[2], '300');

  const p2 = Inp.bulkPlan(j, 'epanet', { column: 'Elev', op: 'expr', value: 'v * 0.5', cond: 'r.Elev > 700', decimals: 2 });
  assert.ok(p2.length > 0 && p2.every(p => Number(p.old) > 700));
});

/* ------------------------------------------------------------ demandas (EPANET) */
test('demandas: distribuir vazão total conserva o total', () => {
  const m = Inp.parse(read('net1.inp'));
  for (const mode of ['total-equal', 'total-prop', 'total-len']) {
    const p = Inp.demandPlan(m, { scope: 'all', mode, value: 1000, decimals: 6, pattern: { mode: 'keep' } });
    assert.ok(Math.abs(p.sumNew - 1000) < 1e-3, mode);
  }
});

test('demandas: taxa por comprimento e padrão', () => {
  const m = Inp.parse(read('net1.inp'));
  const p = Inp.demandPlan(m, { scope: 'all', mode: 'perlen', value: 0.01, decimals: 4, pattern: { mode: 'set', value: '1' } });
  Inp.applyDemandPlan(p, 'set', 4);
  const j = Inp.rows(Inp.getSection(m, 'JUNCTIONS'));
  const len = Inp.connectedLength(m);
  j.forEach(r => {
    assert.equal(Number(r.cells[2]), Number(((len.get(r.cells[0]) || 0) * 0.01).toFixed(4)));
    assert.equal(r.cells[3], '1');
  });
  assert.equal(Inp.parse(Inp.serialize(m)).program, 'epanet');
});

/* ------------------------------------------------------------ hietogramas (SWMM) */
const IDF = { K: 1000, a: 0.2, b: 10, c: 0.8, T: 10, D: 60, dt: 10, r: 0.5, firstAfter: true };

test('blocos alternados: altura total = i(D)·D e pico no centro', () => {
  const h = Inp.hyetograph({ method: 'alt', ...IDF });
  assert.equal(h.n, 6);
  assert.ok(Math.abs(h.total - Inp.idfIntensity(IDF, 60)) < 1e-9);
  const iMax = h.blocks.findIndex(b => b.intensity === h.peak);
  assert.equal(iMax, 3);
  const sorted = h.blocks.map(b => b.depth).sort((x, y) => y - x);
  assert.ok(sorted[0] >= sorted[1] && sorted[1] >= sorted[2]);
});

test('Chicago: pico na posição pedida e total próximo ao da IDF', () => {
  const h = Inp.hyetograph({ method: 'chicago', ...IDF, r: 0.4 });
  assert.equal(h.blocks.findIndex(b => b.intensity === h.peak), 2);
  assert.ok(Math.abs(h.total - Inp.idfIntensity(IDF, 60)) / h.total < 0.01);
});

test('altura total fixa reescala o hietograma', () => {
  const h = Inp.hyetograph({ method: 'rect', ...IDF, ptotal: 50 });
  assert.ok(Math.abs(h.total - 50) < 1e-9);
});

test('aplicar hietograma cria série e pluviômetro, e o resultado é re-lido', () => {
  const m = Inp.parse(read('Culvert_Model.inp'));
  const h = Inp.hyetograph({ method: 'alt', ...IDF });
  Inp.applyHyetograph(m, 'TR10', Inp.hyetographRows(h, 'INTENSITY', 2, true), { name: 'RG1', format: 'INTENSITY', scf: 1 }, h, 'teste');
  const out = Inp.serialize(m);
  const m2 = Inp.parse(out);
  const ts = Inp.getSection(m2, 'TIMESERIES').series.find(s => s.name === 'TR10');
  assert.equal(ts.rows.length, 7);
  assert.deepEqual(ts.rows[6], ['', '01:00', '0']);
  const rg = Inp.rows(Inp.getSection(m2, 'RAINGAGES')).find(r => r.cells[0] === 'RG1');
  assert.deepEqual(rg.cells.slice(1), ['INTENSITY', '00:10', '1', 'TIMESERIES', 'TR10']);
  assert.equal(Inp.serialize(m2), out);
});

/* ------------------------------------------------------------ formulários (chave/valor) */
test('kvSet: altera, insere e remove parâmetros', () => {
  const lines = ['FLOW_UNITS  CFS', 'INFILTRATION HORTON', ''];
  assert.equal(Inp.kvGet(lines, 'flow_units'), 'CFS');
  Inp.kvSet(lines, 'FLOW_UNITS', 'CMS');
  Inp.kvSet(lines, 'MIN_SLOPE', '0.5');
  Inp.kvSet(lines, 'INFILTRATION', '');
  assert.equal(Inp.kvGet(lines, 'FLOW_UNITS'), 'CMS');
  assert.equal(Inp.kvGet(lines, 'MIN_SLOPE'), '0.5');
  assert.equal(Inp.kvGet(lines, 'INFILTRATION'), null);
  assert.equal(lines[lines.length - 1], '');
});

test('kvGet: chaves de várias palavras do EPANET', () => {
  const t = Inp.getSection(Inp.parse(read('net1.inp')), 'TIMES');
  assert.equal(Inp.kvGet(t.lines, 'Hydraulic Timestep'), '1:00');
  assert.equal(Inp.kvGet(t.lines, 'Start ClockTime'), '12 am');
});

test('formulário: linhas desconhecidas ficam em "extras"', () => {
  const def = Inp.FORMS.swmm.OPTIONS;
  const lines = [';;Option Value', 'FLOW_UNITS CFS', 'PARAM_NOVO 1', ''];
  assert.deepEqual(Inp.kvExtras(lines, def), [';;Option Value', 'PARAM_NOVO 1']);
  const out = Inp.kvSetExtras(lines, def, ['PARAM_NOVO 2']);
  assert.deepEqual(out, ['FLOW_UNITS CFS', 'PARAM_NOVO 2', '']);
});

/* ------------------------------------------------------------ seções ausentes / novos modelos */
test('modelo novo vem com todas as seções padrão e faz round-trip', () => {
  for (const prog of ['swmm', 'epanet']) {
    const m = Inp.newModel(prog);
    assert.deepEqual(Inp.missingSections(m), []);
    const text = Inp.serialize(m);
    assert.equal(Inp.serialize(Inp.parse(text)), text);
    assert.equal(Inp.parse(text).program, prog);
  }
});

test('seção ausente: inserida na ordem canônica e omitida enquanto vazia', () => {
  const m = Inp.parse(read('Culvert_Model.inp'));
  const before = Inp.serialize(m);
  assert.ok(Inp.missingSections(m).includes('LOSSES'));
  const s = Inp.ensureSection(m, 'LOSSES', undefined, undefined, { auto: true });
  assert.equal(Inp.serialize(m), before, 'vazia não é gravada');
  const names = m.sections.map(x => x.name);
  assert.ok(names.indexOf('LOSSES') > names.indexOf('XSECTIONS'));
  Inp.addRow(s, ['Culvert', '0.5', '0.5', '0']);
  assert.match(Inp.serialize(m), /\[LOSSES\]\r?\n;;Link[^\n]*\r?\nCulvert +0\.5/);
});

/* ------------------------------------------------------------ visão por objeto */
test('grupos: agrupa por ID, inverte, renomeia e acha as pontas do trecho', () => {
  const m = Inp.parse(read('Culvert_Model.inp'));
  const v = Inp.getSection(m, 'VERTICES');
  assert.equal(v.view, 'group');
  const items = Inp.groups(v).get('Roadway');
  assert.equal(items.length, 2);
  const [x0, x1] = items.map(i => i.cells[1]);
  Inp.reverseGroup(items);
  assert.deepEqual(items.map(i => i.cells[1]), [x1, x0]);
  const ends = Inp.linkEnds(m, 'Roadway');
  assert.equal(ends.length, 2);
  assert.ok(ends.every(p => p && isFinite(p[0]) && isFinite(p[1])));
  Inp.renameGroup(items, 'Outro');
  assert.ok(Inp.groups(v).has('Outro'));
  assert.equal(Inp.parse(Inp.serialize(m)).sections.length, m.sections.length);
});

test('POLYGONS e COVERAGES abrem por objeto; tabelas comuns não', () => {
  const m = Inp.parse(read('Site_Drainage_Model.inp'));
  assert.equal(Inp.getSection(m, 'POLYGONS').view, 'group');
  assert.equal(Inp.getSection(m, 'COVERAGES').view, 'group');
  assert.equal(Inp.getSection(m, 'JUNCTIONS').view, 'table');
});
