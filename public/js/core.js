/* INP core: parser/serializador fiel para arquivos .INP do EPANET e SWMM + ferramentas.
 * Sem dependências de DOM — pode ser testado no Node. */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ esquemas */
  const SCHEMAS = {
    epanet: {
      JUNCTIONS: ['ID', 'Elev', 'Demand', 'Pattern'],
      RESERVOIRS: ['ID', 'Head', 'Pattern'],
      TANKS: ['ID', 'Elevation', 'InitLevel', 'MinLevel', 'MaxLevel', 'Diameter', 'MinVol', 'VolCurve', 'Overflow'],
      PIPES: ['ID', 'Node1', 'Node2', 'Length', 'Diameter', 'Roughness', 'MinorLoss', 'Status'],
      PUMPS: ['ID', 'Node1', 'Node2', 'Parameters'],
      VALVES: ['ID', 'Node1', 'Node2', 'Diameter', 'Type', 'Setting', 'MinorLoss'],
      TAGS: ['Type', 'ID', 'Tag'],
      DEMANDS: ['Junction', 'Demand', 'Pattern', 'Category'],
      STATUS: ['ID', 'Status/Setting'],
      EMITTERS: ['Junction', 'Coefficient'],
      QUALITY: ['Node', 'InitQual'],
      SOURCES: ['Node', 'Type', 'Quality', 'Pattern'],
      MIXING: ['Tank', 'Model', 'Fraction'],
      COORDINATES: ['Node', 'X-Coord', 'Y-Coord'],
      VERTICES: ['Link', 'X-Coord', 'Y-Coord'],
      LABELS: ['X-Coord', 'Y-Coord', 'Label', 'Anchor'],
    },
    swmm: {
      JUNCTIONS: ['Name', 'Elevation', 'MaxDepth', 'InitDepth', 'SurDepth', 'Aponded'],
      OUTFALLS: ['Name', 'Elevation', 'Type', 'Stage Data', 'Gated', 'Route To'],
      CONDUITS: ['Name', 'From Node', 'To Node', 'Length', 'Roughness', 'InOffset', 'OutOffset', 'InitFlow', 'MaxFlow'],
      PUMPS: ['Name', 'From Node', 'To Node', 'Pump Curve', 'Status', 'Startup', 'Shutoff'],
      ORIFICES: ['Name', 'From Node', 'To Node', 'Type', 'Offset', 'Qcoeff', 'Gated', 'CloseTime'],
      WEIRS: ['Name', 'From Node', 'To Node', 'Type', 'CrestHt', 'Qcoeff', 'Gated', 'EndCon', 'EndCoeff', 'Surcharge', 'RoadWidth', 'RoadSurf', 'Coeff. Curve'],
      OUTLETS: ['Name', 'From Node', 'To Node', 'Offset', 'Type', 'QTable/Qcoeff', 'Qexpon', 'Gated'],
      XSECTIONS: ['Link', 'Shape', 'Geom1', 'Geom2', 'Geom3', 'Geom4', 'Barrels', 'Culvert'],
      LOSSES: ['Link', 'Kentry', 'Kexit', 'Kavg', 'FlapGate', 'Seepage'],
      SUBCATCHMENTS: ['Name', 'Rain Gage', 'Outlet', 'Area', '%Imperv', 'Width', '%Slope', 'CurbLen', 'SnowPack'],
      SUBAREAS: ['Subcatchment', 'N-Imperv', 'N-Perv', 'S-Imperv', 'S-Perv', 'PctZero', 'RouteTo', 'PctRouted'],
      RAINGAGES: ['Name', 'Format', 'Interval', 'SCF', 'Source', 'Series/File'],
      DWF: ['Node', 'Constituent', 'Baseline', 'Patterns'],
      INFLOWS: ['Node', 'Constituent', 'Time Series', 'Type', 'Mfactor', 'Sfactor', 'Baseline', 'Pattern'],
      COORDINATES: ['Node', 'X-Coord', 'Y-Coord'],
      VERTICES: ['Link', 'X-Coord', 'Y-Coord'],
      POLYGONS: ['Subcatchment', 'X-Coord', 'Y-Coord'],
      SYMBOLS: ['Gage', 'X-Coord', 'Y-Coord'],
      LABELS: ['X-Coord', 'Y-Coord', 'Label'],
      TAGS: ['Element', 'Name', 'Tag'],
    },
  };

  const TEXT_SECTIONS = new Set(['TITLE', 'OPTIONS', 'TIMES', 'REPORT', 'REACTIONS', 'ENERGY', 'CONTROLS', 'RULES',
    'MAP', 'BACKDROP', 'EVAPORATION', 'TEMPERATURE', 'ADJUSTMENTS', 'FILES', 'LID_CONTROLS', 'TRANSECTS',
    'STREETS', 'INLETS', 'HYDRAULICS', 'PROFILES', 'END']);

  const SERIES_KINDS = {
    epanet: { PATTERNS: 'pattern', CURVES: 'curve' },
    swmm: { TIMESERIES: 'ts', CURVES: 'curve', PATTERNS: 'pattern' },
  };

  Object.assign(SCHEMAS.swmm, {
    DIVIDERS: ['Name', 'Elevation', 'Diverted Link', 'Type', 'Parameters'],
    POLLUTANTS: ['Name', 'Units', 'Crain', 'Cgw', 'Crdii', 'Kdecay', 'SnowOnly', 'CoPollutant', 'CoFrac', 'Cdwf', 'Cinit'],
    LANDUSES: ['Name', 'SweepInterval', 'Availability', 'LastSweep'],
    COVERAGES: ['Subcatchment', 'Landuse', 'Percent'],
    LOADINGS: ['Subcatchment', 'Pollutant', 'InitBuildup'],
    BUILDUP: ['Landuse', 'Pollutant', 'Function', 'Coeff1', 'Coeff2', 'Coeff3', 'PerUnit'],
    WASHOFF: ['Landuse', 'Pollutant', 'Function', 'Coeff1', 'Coeff2', 'SweepRmvl', 'BmpRmvl'],
    TREATMENT: ['Node', 'Pollutant', 'Function'],
    RDII: ['Node', 'UnitHydrograph', 'SewerArea'],
    AQUIFERS: ['Name', 'Por', 'WP', 'FC', 'Ksat', 'Kslope', 'Tslope', 'ETu', 'ETs', 'Seep', 'Ebot', 'Egw', 'Umc', 'ETupat'],
    GROUNDWATER: ['Subcatchment', 'Aquifer', 'Node', 'Esurf', 'A1', 'B1', 'A2', 'B2', 'A3', 'Dsw', 'Egwt', 'Ebot', 'Egw', 'Umc'],
    LID_USAGE: ['Subcatchment', 'LID Process', 'Number', 'Area', 'Width', 'InitSatur', 'FromImperv', 'ToPerv', 'RptFile', 'DrainTo', 'FromPerv'],
    INLET_USAGE: ['Conduit', 'Inlet', 'Node', 'Number', '%Clogged', 'MaxFlow', 'hDStore', 'wDStore', 'Placement'],
    STORAGE: ['Name', 'Elev', 'MaxDepth', 'InitDepth', 'Shape', 'Param1', 'Param2', 'Param3', 'SurDepth', 'Fevap', 'Psi', 'Ksat', 'IMD'],
  });
  TEXT_SECTIONS.add('SNOWPACKS'); TEXT_SECTIONS.add('HYDROGRAPHS');

  /* ordem canônica das seções (usada para inserir/oferecer seções ausentes) */
  const STANDARD = {
    epanet: ['TITLE', 'JUNCTIONS', 'RESERVOIRS', 'TANKS', 'PIPES', 'PUMPS', 'VALVES', 'TAGS', 'DEMANDS', 'STATUS', 'PATTERNS', 'CURVES',
      'CONTROLS', 'RULES', 'ENERGY', 'EMITTERS', 'QUALITY', 'SOURCES', 'REACTIONS', 'MIXING', 'TIMES', 'REPORT', 'OPTIONS',
      'COORDINATES', 'VERTICES', 'LABELS', 'BACKDROP'],
    swmm: ['TITLE', 'OPTIONS', 'REPORT', 'FILES', 'RAINGAGES', 'EVAPORATION', 'TEMPERATURE', 'ADJUSTMENTS', 'SUBCATCHMENTS', 'SUBAREAS',
      'INFILTRATION', 'LID_CONTROLS', 'LID_USAGE', 'AQUIFERS', 'GROUNDWATER', 'SNOWPACKS', 'JUNCTIONS', 'OUTFALLS', 'DIVIDERS', 'STORAGE',
      'CONDUITS', 'PUMPS', 'ORIFICES', 'WEIRS', 'OUTLETS', 'XSECTIONS', 'TRANSECTS', 'STREETS', 'INLETS', 'INLET_USAGE', 'LOSSES',
      'CONTROLS', 'POLLUTANTS', 'LANDUSES', 'COVERAGES', 'LOADINGS', 'BUILDUP', 'WASHOFF', 'TREATMENT', 'INFLOWS', 'DWF', 'RDII',
      'HYDROGRAPHS', 'CURVES', 'TIMESERIES', 'PATTERNS', 'MAP', 'POLYGONS', 'COORDINATES', 'VERTICES', 'SYMBOLS', 'LABELS', 'BACKDROP', 'TAGS'],
  };
  function orderIndex(program, name) {
    const i = (STANDARD[program] || []).indexOf(name);
    return i < 0 ? 1e6 : i;
  }
  function defaultHeader(program, name) {
    const kind = (SERIES_KINDS[program] || {})[name];
    const sw = program === 'swmm', p = sw ? ';;' : ';';
    const j = a => p + a.join('\t');
    if (kind === 'ts') return [j(['Name', 'Date', 'Time', 'Value']), j(['--------------', '----------', '----------', '----------'])];
    if (kind === 'pattern') return [j([sw ? 'Name' : 'ID', ...(sw ? ['Type'] : []), 'Multipliers'])];
    if (kind === 'curve') return [j([sw ? 'Name' : 'ID', ...(sw ? ['Type'] : []), 'X-Value', 'Y-Value'])];
    const cols = (SCHEMAS[program] || {})[name];
    return cols && !FORMS[program][name] ? [j(cols)] : [];
  }

  /* ------------------------------------------------------------------ formulários (seções chave/valor)
   * campo: [chave, rótulo, tipo, opções|dica]  tipos: sel (opções separadas por |), txt, num, date, time, yn
   * '#' = título de grupo; '@choice' = escolha exclusiva entre chaves */
  const FORMS = { epanet: {}, swmm: {} };
  FORMS.swmm.OPTIONS = [
    ['#', 'Geral'],
    ['FLOW_UNITS', 'Unidades de vazão', 'sel', 'CFS|GPM|MGD|CMS|LPS|MLD'],
    ['INFILTRATION', 'Modelo de infiltração', 'sel', 'HORTON|MODIFIED_HORTON|GREEN_AMPT|MODIFIED_GREEN_AMPT|CURVE_NUMBER'],
    ['FLOW_ROUTING', 'Propagação do escoamento', 'sel', 'STEADY|KINWAVE|DYNWAVE'],
    ['LINK_OFFSETS', 'Offsets das ligações', 'sel', 'DEPTH|ELEVATION'],
    ['FORCE_MAIN_EQUATION', 'Equação de condutos forçados', 'sel', 'H-W|D-W'],
    ['IGNORE_RAINFALL', 'Ignorar chuva', 'yn'], ['IGNORE_SNOWMELT', 'Ignorar neve', 'yn'], ['IGNORE_GROUNDWATER', 'Ignorar águas subterrâneas', 'yn'],
    ['IGNORE_RDII', 'Ignorar RDII', 'yn'], ['IGNORE_ROUTING', 'Ignorar propagação', 'yn'], ['IGNORE_QUALITY', 'Ignorar qualidade', 'yn'],
    ['ALLOW_PONDING', 'Permitir empoçamento', 'yn'], ['SKIP_STEADY_STATE', 'Pular regime permanente inicial', 'yn'],
    ['#', 'Datas e horários'],
    ['START_DATE', 'Data inicial', 'date'], ['START_TIME', 'Hora inicial', 'time'],
    ['REPORT_START_DATE', 'Data inicial do relatório', 'date'], ['REPORT_START_TIME', 'Hora inicial do relatório', 'time'],
    ['END_DATE', 'Data final', 'date'], ['END_TIME', 'Hora final', 'time'],
    ['SWEEP_START', 'Início da varrição (MM/DD)', 'txt', '01/01'], ['SWEEP_END', 'Fim da varrição (MM/DD)', 'txt', '12/31'],
    ['DRY_DAYS', 'Dias secos antecedentes', 'num'],
    ['#', 'Passos de tempo'],
    ['REPORT_STEP', 'Passo de relatório', 'time'], ['WET_STEP', 'Passo — tempo úmido', 'time'], ['DRY_STEP', 'Passo — tempo seco', 'time'],
    ['ROUTING_STEP', 'Passo de propagação (s ou hh:mm:ss)', 'txt', '0:00:30'], ['RULE_STEP', 'Passo das regras de controle', 'time'],
    ['LENGTHENING_STEP', 'Passo de alongamento (s)', 'num'], ['VARIABLE_STEP', 'Fator de passo variável (0–1)', 'num'], ['MINIMUM_STEP', 'Passo mínimo (s)', 'num'],
    ['#', 'Onda dinâmica'],
    ['INERTIAL_DAMPING', 'Amortecimento inercial', 'sel', 'NONE|PARTIAL|FULL'],
    ['NORMAL_FLOW_LIMITED', 'Limite de vazão normal', 'sel', 'SLOPE|FROUDE|BOTH'],
    ['SURCHARGE_METHOD', 'Método de sobrecarga', 'sel', 'EXTRAN|SLOT'],
    ['MIN_SURFAREA', 'Área superficial mínima dos nós', 'num'], ['MIN_SLOPE', 'Declividade mínima (%)', 'num'],
    ['MAX_TRIALS', 'Máximo de iterações', 'num'], ['HEAD_TOLERANCE', 'Tolerância de carga', 'num'],
    ['SYS_FLOW_TOL', 'Tolerância de vazão do sistema (%)', 'num'], ['LAT_FLOW_TOL', 'Tolerância de vazão lateral (%)', 'num'],
    ['THREADS', 'Threads', 'num'], ['TEMPDIR', 'Pasta temporária', 'txt'],
  ];
  FORMS.swmm.REPORT = [
    ['INPUT', 'Listar dados de entrada', 'yn'], ['CONTROLS', 'Listar ações de controle', 'yn'],
    ['SUBCATCHMENTS', 'Sub-bacias no relatório', 'txt', 'ALL | NONE | lista de IDs'],
    ['NODES', 'Nós no relatório', 'txt', 'ALL | NONE | lista de IDs'],
    ['LINKS', 'Ligações no relatório', 'txt', 'ALL | NONE | lista de IDs'],
    ['LID', 'Relatório de LID', 'txt', 'nome  subcatchment  arquivo'],
  ];
  FORMS.swmm.EVAPORATION = [
    ['@choice', 'Fonte de evaporação', [['CONSTANT', 'valor (mm/dia)'], ['MONTHLY', '12 valores mensais'], ['TIMESERIES', 'nome da série'], ['TEMPERATURE', 'sem parâmetros'], ['FILE', '12 coeficientes (opcional)']]],
    ['RECOVERY', 'Padrão de recuperação', 'txt', 'nome do padrão'],
    ['DRY_ONLY', 'Evaporar apenas em tempo seco', 'yn'],
  ];
  FORMS.swmm.TEMPERATURE = [
    ['TIMESERIES', 'Série temporal de temperatura', 'txt'], ['FILE', 'Arquivo climático', 'txt', 'arquivo [início]'],
    ['WINDSPEED', 'Velocidade do vento', 'txt', 'MONTHLY v1..v12 | FILE'], ['SNOWMELT', 'Parâmetros de degelo', 'txt', '6 valores'],
    ['ADC IMPERVIOUS', 'ADC — áreas impermeáveis', 'txt', '10 valores'], ['ADC PERVIOUS', 'ADC — áreas permeáveis', 'txt', '10 valores'],
  ];
  FORMS.swmm.ADJUSTMENTS = [
    ['TEMPERATURE', 'Ajuste mensal de temperatura', 'txt', '12 valores'], ['EVAPORATION', 'Ajuste mensal de evaporação', 'txt', '12 valores'],
    ['RAINFALL', 'Ajuste mensal de chuva', 'txt', '12 valores'], ['CONDUCTIVITY', 'Ajuste mensal de condutividade', 'txt', '12 valores'],
  ];
  FORMS.swmm.MAP = [
    ['DIMENSIONS', 'Extensão do mapa', 'txt', 'X1 Y1 X2 Y2'], ['UNITS', 'Unidades do mapa', 'sel', 'None|Feet|Meters|Degrees'],
  ];
  FORMS.epanet.TIMES = [
    ['Duration', 'Duração da simulação', 'time', 'h:mm'], ['Hydraulic Timestep', 'Passo hidráulico', 'time'], ['Quality Timestep', 'Passo de qualidade', 'time'],
    ['Rule Timestep', 'Passo das regras', 'time'], ['Pattern Timestep', 'Passo dos padrões', 'time'], ['Pattern Start', 'Início dos padrões', 'time'],
    ['Report Timestep', 'Passo do relatório', 'time'], ['Report Start', 'Início do relatório', 'time'],
    ['Start ClockTime', 'Hora inicial do relógio', 'txt', '12 am'], ['Statistic', 'Estatística', 'sel', 'NONE|AVERAGED|MINIMUM|MAXIMUM|RANGE'],
  ];
  FORMS.epanet.OPTIONS = [
    ['#', 'Hidráulica'],
    ['Units', 'Unidades de vazão', 'sel', 'CFS|GPM|MGD|IMGD|AFD|LPS|LPM|MLD|CMH|CMD'],
    ['Headloss', 'Fórmula de perda de carga', 'sel', 'H-W|D-W|C-M'],
    ['Hydraulics', 'Arquivo hidráulico', 'txt', 'USE|SAVE arquivo'],
    ['Specific Gravity', 'Densidade relativa', 'num'], ['Viscosity', 'Viscosidade relativa', 'num'],
    ['Trials', 'Máximo de iterações', 'num'], ['Accuracy', 'Precisão', 'num'], ['Unbalanced', 'Se não convergir', 'txt', 'STOP | CONTINUE [n]'],
    ['Pattern', 'Padrão global de demanda', 'txt'], ['Demand Multiplier', 'Multiplicador de demanda', 'num'],
    ['Demand Model', 'Modelo de demanda', 'sel', 'DDA|PDA'], ['Minimum Pressure', 'Pressão mínima (PDA)', 'num'],
    ['Required Pressure', 'Pressão requerida (PDA)', 'num'], ['Pressure Exponent', 'Expoente de pressão (PDA)', 'num'],
    ['Emitter Exponent', 'Expoente dos emissores', 'num'],
    ['CHECKFREQ', 'Frequência de verificação', 'num'], ['MAXCHECK', 'Máximo de verificações', 'num'], ['DAMPLIMIT', 'Limite de amortecimento', 'num'],
    ['#', 'Qualidade'],
    ['Quality', 'Parâmetro de qualidade', 'txt', 'NONE | CHEMICAL mg/L | AGE | TRACE nó'],
    ['Diffusivity', 'Difusividade relativa', 'num'], ['Tolerance', 'Tolerância de qualidade', 'num'],
    ['Map', 'Arquivo de mapa', 'txt'],
  ];
  FORMS.epanet.REPORT = [
    ['Status', 'Relatório de status', 'sel', 'No|Yes|Full'], ['Summary', 'Resumo', 'sel', 'No|Yes'], ['Energy', 'Relatório de energia', 'sel', 'No|Yes'],
    ['Nodes', 'Nós', 'txt', 'None | All | lista de IDs'], ['Links', 'Trechos', 'txt', 'None | All | lista de IDs'],
    ['Page', 'Linhas por página', 'num'], ['File', 'Arquivo de relatório', 'txt'],
  ];
  FORMS.epanet.ENERGY = [
    ['Global Efficiency', 'Eficiência global (%)', 'num'], ['Global Price', 'Preço global de energia', 'num'],
    ['Global Pattern', 'Padrão de preço', 'txt'], ['Demand Charge', 'Taxa de demanda', 'num'],
  ];
  FORMS.epanet.REACTIONS = [
    ['Order Bulk', 'Ordem da reação no volume', 'num'], ['Order Tank', 'Ordem da reação nos tanques', 'num'], ['Order Wall', 'Ordem da reação na parede', 'num'],
    ['Global Bulk', 'Coeficiente global (volume)', 'num'], ['Global Wall', 'Coeficiente global (parede)', 'num'],
    ['Limiting Potential', 'Potencial limitante', 'num'], ['Roughness Correlation', 'Correlação com rugosidade', 'num'],
  ];
  FORMS.epanet.BACKDROP = [
    ['DIMENSIONS', 'Dimensões', 'txt', 'X1 Y1 X2 Y2'], ['UNITS', 'Unidades', 'sel', 'None|Feet|Meters|Degrees'],
    ['FILE', 'Arquivo de imagem', 'txt'], ['OFFSET', 'Deslocamento', 'txt', 'X Y'],
  ];

  /* ---- leitura/escrita chave/valor sobre as linhas da seção */
  function kvIndex(lines, key) {
    const kt = key.toUpperCase().split(' ');
    for (let i = 0; i < lines.length; i++) {
      const tk = tokenize(lines[i]).cells;
      if (tk.length >= kt.length && kt.every((k, j) => tk[j].toUpperCase() === k)) return i;
    }
    return -1;
  }
  function kvGet(lines, key) {
    const i = kvIndex(lines, key);
    if (i < 0) return null;
    return tokenize(lines[i]).cells.slice(key.split(' ').length).join(' ');
  }
  function kvSet(lines, key, value, keepEmpty) {
    const i = kvIndex(lines, key);
    value = String(value).trim();
    if (value === '' && !keepEmpty) { if (i >= 0) lines.splice(i, 1); return; }
    if (i >= 0) {
      const t = tokenize(lines[i]);
      const keyText = t.cells.slice(0, key.split(' ').length).join(' ');
      lines[i] = (pad(keyText, 20) + value + (t.comment ? '  ' + t.comment : '')).trimEnd();
      return;
    }
    let at = lines.length;
    while (at > 0 && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, (pad(key, 20) + value).trimEnd());
  }
  function formKeys(def) {
    const keys = [];
    def.forEach(f => { if (f[0] === '@choice') f[2].forEach(c => keys.push(c[0])); else if (f[0] !== '#') keys.push(f[0]); });
    return keys;
  }
  /* linhas não reconhecidas pelo formulário (comentários, chaves específicas etc.) */
  function kvExtras(lines, def) {
    const keys = formKeys(def);
    return lines.filter(l => l.trim() !== '' && !keys.some(k => kvIndex([l], k) === 0));
  }
  function kvSetExtras(lines, def, extras) {
    const keys = formKeys(def);
    const known = lines.filter(l => l.trim() !== '' && keys.some(k => kvIndex([l], k) === 0));
    return [...known, ...extras.filter(l => l.trim() !== ''), ''];
  }
  function formFor(program, name) { return (FORMS[program] || {})[name] || null; }

  /* seções em que várias linhas pertencem ao mesmo objeto (1ª coluna = ID repetido) */
  const GROUPS = {
    epanet: { VERTICES: 1, DEMANDS: 1 },
    swmm: { VERTICES: 1, POLYGONS: 1, COVERAGES: 1, LOADINGS: 1, LID_USAGE: 1, BUILDUP: 1, WASHOFF: 1, TREATMENT: 1, INFLOWS: 1, DWF: 1 },
  };
  const GROUP_DEFAULT = {
    epanet: ['VERTICES', 'DEMANDS'],
    swmm: ['VERTICES', 'POLYGONS', 'COVERAGES', 'LOADINGS', 'LID_USAGE'],
  };

  /* ------------------------------------------------------------------ utilidades */
  function num(s) {
    if (s == null) return NaN;
    const t = String(s).trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  function fmtNum(x, dec) {
    return String(parseFloat(Number(x).toFixed(dec == null ? 6 : dec)));
  }
  function tokenize(line) {
    const cells = [];
    let comment = '', i = 0;
    const n = line.length;
    while (i < n) {
      const ch = line[i];
      if (ch === ';') { comment = line.slice(i); break; }
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let j = i + 1;
        while (j < n && line[j] !== '"') j++;
        cells.push(line.slice(i, j + 1));
        i = j + 1;
        continue;
      }
      let j = i;
      while (j < n && !/\s/.test(line[j]) && line[j] !== ';') j++;
      cells.push(line.slice(i, j));
      i = j;
    }
    return { cells, comment };
  }
  function quoteCell(c) {
    c = String(c);
    return /\s/.test(c) && !/^".*"$/.test(c) ? '"' + c + '"' : c;
  }
  function pad(s, w) { s = String(s); return s.length >= w ? s + ' ' : s + ' '.repeat(w - s.length); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function minToHHMM(m) { return pad2(Math.floor(m / 60)) + ':' + pad2(Math.round(m % 60)); }
  function timeToHours(t) {
    t = String(t).trim();
    if (t.includes(':')) {
      const p = t.split(':').map(Number);
      return (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600;
    }
    return num(t);
  }

  /* ------------------------------------------------------------------ tabelas */
  function parseTable(lines) {
    return lines.map(raw => {
      const t = tokenize(raw);
      if (!t.cells.length) return { kind: raw.trim() === '' ? 'blank' : 'comment', raw };
      return { kind: 'row', raw, cells: t.cells, comment: t.comment, dirty: false };
    });
  }
  function tableWidths(items) {
    const w = [];
    for (const it of items) {
      if (it.kind !== 'row') continue;
      it.cells.forEach((c, i) => { w[i] = Math.max(w[i] || 0, quoteCell(c).length); });
    }
    return w.map((x, i) => Math.max(x + 2, i === 0 ? 16 : 10));
  }
  function tableLines(items) {
    const anyDirty = items.some(i => i.kind === 'row' && i.dirty);
    const widths = anyDirty ? tableWidths(items) : null;
    return items.map(it => {
      if (it.kind !== 'row' || !it.dirty) return it.raw;
      const cells = it.cells.slice();
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      let s = cells.map((c, i) => (i === cells.length - 1 && !it.comment) ? quoteCell(c) : pad(quoteCell(c), widths[i] || 10)).join('');
      if (it.comment) s += it.comment;
      return s.replace(/\s+$/, '');
    });
  }
  function headerColumns(items) {
    for (const it of items) {
      if (it.kind === 'row') break;
      if (it.kind !== 'comment') continue;
      const t = it.raw.replace(/^[\s;]+/, '').trim();
      if (!t || /^[-\s]+$/.test(t)) continue;
      const cols = t.split(/\t+|\s{2,}/).map(x => x.trim()).filter(Boolean);
      if (cols.length >= 2) return cols;
    }
    return null;
  }
  function columns(sec, program) {
    let cols = (SCHEMAS[program] || {})[sec.name];
    if (!cols) cols = headerColumns(sec.items);
    cols = cols ? cols.slice() : [];
    let max = 0;
    for (const it of sec.items) if (it.kind === 'row') max = Math.max(max, it.cells.length);
    while (cols.length < max) cols.push('Col ' + (cols.length + 1));
    return cols;
  }
  function rows(sec) { return sec.items.filter(i => i.kind === 'row'); }
  function setCell(item, idx, val) {
    while (item.cells.length <= idx) item.cells.push('');
    item.cells[idx] = String(val);
    item.dirty = true;
  }
  function rowObj(cols, item) {
    const o = {};
    cols.forEach((c, i) => {
      const v = item.cells[i] == null ? '' : item.cells[i];
      const n = num(v);
      o[c] = isNaN(n) ? v : n;
    });
    return o;
  }
  function addRow(sec, cells, afterItem) {
    const it = { kind: 'row', raw: '', cells: cells.map(String), comment: '', dirty: true };
    let at;
    if (afterItem && sec.items.includes(afterItem)) at = sec.items.indexOf(afterItem) + 1;
    else {
      at = sec.items.length;
      while (at > 0 && sec.items[at - 1].kind === 'blank') at--;
    }
    sec.items.splice(at, 0, it);
    return it;
  }
  /* ---- visão por objeto */
  function groups(sec) {
    const m = new Map();
    rows(sec).forEach(it => { const k = it.cells[0]; if (!m.has(k)) m.set(k, []); m.get(k).push(it); });
    return m;
  }
  function swapRows(a, b) {
    [a.cells, b.cells] = [b.cells, a.cells];
    [a.comment, b.comment] = [b.comment, a.comment];
    a.dirty = b.dirty = true;
  }
  function reverseGroup(items) { for (let i = 0, j = items.length - 1; i < j; i++, j--) swapRows(items[i], items[j]); }
  function renameGroup(items, id) { items.forEach(it => setCell(it, 0, id)); }
  const LINK_SECS = { epanet: ['PIPES', 'PUMPS', 'VALVES'], swmm: ['CONDUITS', 'PUMPS', 'ORIFICES', 'WEIRS', 'OUTLETS'] };
  /* extremidades [de, para] de um trecho, em coordenadas (ou null) */
  function linkEnds(model, id) {
    const co = getSection(model, 'COORDINATES');
    if (!co) return null;
    for (const n of LINK_SECS[model.program] || []) {
      const sec = getSection(model, n);
      const r = sec && rows(sec).find(x => x.cells[0] === id);
      if (!r) continue;
      const pt = nid => { const c = rows(co).find(x => x.cells[0] === nid); return c ? [num(c.cells[1]), num(c.cells[2])] : null; };
      return [pt(r.cells[1]), pt(r.cells[2])];
    }
    return null;
  }
  function removeItems(sec, set) { sec.items = sec.items.filter(i => !set.has(i)); }

  /* ------------------------------------------------------------------ séries */
  function isNum(t) { return !isNaN(num(t)); }
  function isDateTok(t) { return /\//.test(t) || /^[A-Za-z]{3}-\d/.test(t) || /^\d+-\d+-\d+$/.test(t); }

  function addTokens(s, toks, kind, program) {
    if (kind === 'pattern') {
      if (!s.rows.length && !s.ptype && toks.length && !isNum(toks[0])) s.ptype = toks.shift();
      toks.forEach(t => s.rows.push([t]));
    } else if (kind === 'curve') {
      if (program === 'swmm' && toks.length >= 3) { if (!s.ptype) s.ptype = toks[0]; toks = toks.slice(1); }
      if (toks.length >= 2) s.rows.push([toks[0], toks[1]]);
    } else if (kind === 'ts') {
      if (toks[0] && toks[0].toUpperCase() === 'FILE') { s.file = toks.slice(1).join(' '); return; }
      let i = 0;
      while (i < toks.length) {
        let date = '';
        if (isDateTok(toks[i])) date = toks[i++];
        const time = toks[i++], val = toks[i++];
        if (time === undefined || val === undefined) break;
        s.rows.push([date, time, val]);
      }
    }
  }
  function parseSeries(lines, kind, program) {
    const out = { head: [], series: [], tail: [] };
    const byName = new Map();
    let pending = [], cur = null, seen = false;
    for (const raw of lines) {
      const t = tokenize(raw);
      if (!t.cells.length) { pending.push(raw); continue; }
      const name = t.cells[0];
      if (!cur || cur.name !== name) {
        let s = byName.get(name);
        if (s) {
          s.dirty = true; s.comments.push(...pending); pending = [];
        } else {
          s = { name, kind, comments: [], rows: [], raw: [], dirty: false, ptype: '', file: null };
          if (!seen) out.head = pending; else s.comments = pending;
          pending = []; seen = true;
          byName.set(name, s); out.series.push(s);
        }
        cur = s;
      } else if (pending.length) { cur.raw.push(...pending); pending = []; }
      cur.raw.push(raw);
      addTokens(cur, t.cells.slice(1), kind, program);
    }
    out.tail = pending;
    return out;
  }
  function seriesLines(s) {
    if (!s.dirty || s.file != null) return [...s.comments, ...s.raw];
    const out = [...s.comments];
    const nm = pad(s.name, 16);
    if (s.kind === 'pattern') {
      for (let i = 0; i < s.rows.length || i === 0; i += 6) {
        const vals = s.rows.slice(i, i + 6).map(r => pad(r[0], 12)).join('');
        out.push((nm + (i === 0 && s.ptype ? pad(s.ptype, 10) : '') + vals).trimEnd());
      }
    } else if (s.kind === 'curve') {
      s.rows.forEach((r, i) => {
        if (s.swmm) out.push((nm + pad(i === 0 ? s.ptype : '', 10) + pad(r[0], 12) + r[1]).trimEnd());
        else out.push((nm + pad(r[0], 12) + r[1]).trimEnd());
      });
    } else if (s.kind === 'ts') {
      s.rows.forEach(r => out.push((nm + pad(r[0], 12) + pad(r[1], 10) + r[2]).trimEnd()));
    }
    return out;
  }
  function seriesCols(kind) {
    return kind === 'ts' ? ['Data', 'Hora', 'Valor'] : kind === 'curve' ? ['X', 'Y'] : ['Multiplicador'];
  }
  function addSeries(sec, name, rowsArr, opts) {
    opts = opts || {};
    const s = {
      name, kind: sec.skind, comments: opts.comments || [], rows: rowsArr, raw: [], dirty: true,
      ptype: opts.ptype || '', file: null, swmm: sec.swmm
    };
    sec.series.push(s);
    return s;
  }

  /* ------------------------------------------------------------------ modelo */
  function detect(model) {
    const names = new Set(model.sections.map(s => s.name));
    if (['PIPES', 'RESERVOIRS', 'TANKS', 'VALVES'].some(n => names.has(n))) return 'epanet';
    if (['SUBCATCHMENTS', 'CONDUITS', 'RAINGAGES', 'XSECTIONS', 'OUTFALLS', 'TIMESERIES'].some(n => names.has(n))) return 'swmm';
    for (const s of model.sections) if (s.name === 'OPTIONS' && s.lines.some(l => /FLOW_UNITS|FLOW_ROUTING/i.test(l))) return 'swmm';
    return names.has('JUNCTIONS') ? 'epanet' : 'swmm';
  }
  function buildSection(sec, program) {
    const kind = (SERIES_KINDS[program] || {})[sec.name];
    const view = sec.view;
    delete sec.items; delete sec.series;
    if (kind) {
      sec.type = 'series'; sec.skind = kind; sec.swmm = program === 'swmm';
      Object.assign(sec, parseSeries(sec.lines, kind, program));
      sec.series.forEach(s => { s.swmm = sec.swmm; });
      delete sec.lines;
    } else if (TEXT_SECTIONS.has(sec.name)) {
      sec.type = 'text';
    } else {
      sec.type = 'table';
      sec.items = parseTable(sec.lines);
      delete sec.lines;
    }
    sec.form = sec.type === 'text' && !!formFor(program, sec.name);
    sec.groupable = sec.type === 'table' && !!(GROUPS[program] || {})[sec.name];
    const grpDefault = sec.groupable && GROUP_DEFAULT[program].includes(sec.name);
    sec.view = view || (sec.form ? 'form' : grpDefault ? 'group' : sec.type === 'text' ? 'text' : 'table');
  }
  function sectionLines(sec) {
    if (sec.type === 'text') return sec.lines;
    if (sec.type === 'table') return tableLines(sec.items);
    const out = [...sec.head];
    sec.series.forEach(s => out.push(...seriesLines(s)));
    out.push(...sec.tail);
    return out;
  }
  function setSectionLines(model, sec, lines) {
    sec.lines = lines;
    buildSection(sec, model.program);
  }
  function parse(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const model = { eol, preamble: [], sections: [], program: null };
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const m = /^\s*\[([^\]]*)\]/.exec(raw);
      if (m) { cur = { header: raw, name: m[1].trim().toUpperCase(), lines: [] }; model.sections.push(cur); }
      else (cur ? cur.lines : model.preamble).push(raw);
    }
    model.program = detect(model);
    model.sections.forEach(s => buildSection(s, model.program));
    return model;
  }
  function serialize(model) {
    const out = [...model.preamble];
    for (const s of model.sections) {
      if (s.auto && sectionCount(s) === 0) continue;
      out.push(s.header); out.push(...sectionLines(s));
    }
    return out.join(model.eol);
  }
  function sectionCount(s) {
    if (s.type === 'table') return rows(s).length;
    if (s.type === 'series') return s.series.length;
    return s.lines.filter(l => l.trim() && !l.trim().startsWith(';')).length;
  }
  function getSection(model, name) { return model.sections.find(s => s.name === name); }
  /* cria a seção na posição canônica. opts.auto: não é gravada enquanto estiver vazia */
  function ensureSection(model, name, headerLines, afterNames, opts) {
    let sec = getSection(model, name);
    if (sec) return sec;
    const hdr = headerLines || defaultHeader(model.program, name);
    sec = { header: '[' + name + ']', name, lines: [...hdr, ''] };
    if (opts && opts.auto) sec.auto = true;
    buildSection(sec, model.program);
    const oi = orderIndex(model.program, name);
    let at = -1;
    model.sections.forEach((s, i) => { if (s.name !== 'END' && orderIndex(model.program, s.name) < oi) at = i; });
    if (at >= 0) model.sections.splice(at + 1, 0, sec);
    else {
      const end = model.sections.findIndex(s => s.name === 'END');
      model.sections.splice(end < 0 ? model.sections.length : end, 0, sec);
    }
    return sec;
  }
  function missingSections(model) {
    const have = new Set(model.sections.map(s => s.name));
    return (STANDARD[model.program] || []).filter(n => !have.has(n));
  }
  function optionValue(model, key) {
    const sec = getSection(model, 'OPTIONS');
    if (!sec) return '';
    for (const l of sec.lines) {
      const t = tokenize(l).cells;
      if (t.length >= 2 && t[0].toUpperCase() === key.toUpperCase()) return t.slice(1).join(' ');
    }
    return '';
  }
  const NEW_DEFAULTS = {
    swmm: {
      TITLE: ['Novo modelo SWMM'],
      OPTIONS: ['FLOW_UNITS          	LPS', 'INFILTRATION        	HORTON', 'FLOW_ROUTING        	KINWAVE', 'LINK_OFFSETS        	DEPTH',
        'START_DATE          	01/01/2024', 'START_TIME          	00:00:00', 'REPORT_START_DATE   	01/01/2024', 'REPORT_START_TIME   	00:00:00',
        'END_DATE            	01/01/2024', 'END_TIME            	06:00:00', 'REPORT_STEP         	00:05:00', 'WET_STEP            	00:05:00',
        'DRY_STEP            	01:00:00', 'ROUTING_STEP        	00:00:30'],
      REPORT: ['INPUT               NO', 'CONTROLS            NO', 'SUBCATCHMENTS       ALL', 'NODES               ALL', 'LINKS               ALL'],
      EVAPORATION: ['CONSTANT            	0.0', 'DRY_ONLY            	NO'],
    },
    epanet: {
      TITLE: ['Novo modelo EPANET'],
      TIMES: ['Duration           	24:00', 'Hydraulic Timestep 	1:00', 'Quality Timestep   	0:05', 'Pattern Timestep   	1:00',
        'Pattern Start      	0:00', 'Report Timestep    	1:00', 'Report Start       	0:00', 'Start ClockTime    	12 am', 'Statistic          	NONE'],
      REPORT: ['Status             	No', 'Summary            	Yes', 'Page               	0'],
      OPTIONS: ['Units              	LPS', 'Headloss           	H-W', 'Specific Gravity   	1.0', 'Viscosity          	1.0', 'Trials             	40',
        'Accuracy           	0.001', 'Unbalanced         	Continue 10', 'Pattern            	1', 'Demand Multiplier  	1.0', 'Emitter Exponent   	0.5',
        'Quality            	None', 'Diffusivity        	1.0', 'Tolerance          	0.01'],
      ENERGY: ['Global Efficiency  	75', 'Global Price       	0.0', 'Demand Charge      	0.0'],
      REACTIONS: ['Order Bulk            	1', 'Order Tank            	1', 'Order Wall            	1', 'Global Bulk           	0', 'Global Wall           	0',
        'Limiting Potential    	0.0', 'Roughness Correlation 	0.0'],
    },
  };
  /* modelo vazio com todas as seções padrão */
  function newModel(program) {
    const out = [];
    STANDARD[program].forEach(name => {
      out.push('[' + name + ']');
      const def = NEW_DEFAULTS[program][name];
      if (def) out.push(...def); else out.push(...defaultHeader(program, name));
      out.push('');
    });
    out.push('[END]', '');
    return parse(out.join('\n'));
  }

  /* ------------------------------------------------------------------ operação em lote */
  function compileExpr(expr, args) {
    // eslint-disable-next-line no-new-func
    return new Function(...args, 'return (' + expr + ');');
  }
  /* Calcula o plano de alterações de uma coluna. Retorna [{item, old, neu}] */
  function bulkPlan(sec, program, o) {
    const cols = columns(sec, program);
    const ci = cols.indexOf(o.column);
    if (ci < 0) throw new Error('Coluna inválida');
    const cond = o.cond && o.cond.trim() ? compileExpr(o.cond, ['r', 'i', 'Math']) : null;
    let expr = null;
    if (o.op === 'expr') expr = compileExpr(o.value, ['v', 'i', 'r', 'Math']);
    const list = [];
    const dec = o.decimals == null ? 6 : o.decimals;
    const k = num(o.value);
    rows(sec).forEach((item, i) => {
      if (o.items && !o.items.has(item)) return;
      const r = rowObj(cols, item);
      if (cond && !cond(r, i, Math)) return;
      const oldS = item.cells[ci] == null ? '' : item.cells[ci];
      const oldN = num(oldS);
      let neu;
      switch (o.op) {
        case 'set': neu = String(o.value); break;
        case 'mul': if (isNaN(oldN) || isNaN(k)) return; neu = fmtNum(oldN * k, dec); break;
        case 'add': if (isNaN(oldN) || isNaN(k)) return; neu = fmtNum(oldN + k, dec); break;
        case 'replace': neu = oldS.split(o.value).join(o.value2 || ''); break;
        case 'expr': {
          const v = isNaN(oldN) ? oldS : oldN;
          const res = expr(v, i, r, Math);
          neu = typeof res === 'number' ? fmtNum(res, dec) : String(res);
          break;
        }
        default: return;
      }
      if (neu !== oldS) list.push({ item, ci, old: oldS, neu });
    });
    return list;
  }
  function applyPlan(plan) { plan.forEach(p => setCell(p.item, p.ci, p.neu)); }

  /* ------------------------------------------------------------------ EPANET: demandas */
  function connectedLength(model) {
    const pipes = getSection(model, 'PIPES');
    const m = new Map();
    if (!pipes) return m;
    for (const it of rows(pipes)) {
      const L = num(it.cells[3]);
      if (isNaN(L)) continue;
      [it.cells[1], it.cells[2]].forEach(n => m.set(n, (m.get(n) || 0) + L / 2));
    }
    return m;
  }
  /* o: {scope:'all'|'pos'|'zero'|'items', items:Set, cond, mode, value, decimals, pattern:{mode:'keep'|'set'|'clear', value}} */
  function demandPlan(model, o) {
    const sec = getSection(model, 'JUNCTIONS');
    if (!sec) throw new Error('Sem seção [JUNCTIONS]');
    const cols = columns(sec, 'epanet');
    const cond = o.cond && o.cond.trim() ? compileExpr(o.cond, ['r', 'i', 'Math']) : null;
    const len = connectedLength(model);
    const sel = [];
    rows(sec).forEach((item, i) => {
      const d = num(item.cells[2]) || 0;
      if (o.scope === 'pos' && !(d > 0)) return;
      if (o.scope === 'zero' && d !== 0) return;
      if (o.scope === 'items' && !(o.items && o.items.has(item))) return;
      if (cond && !cond(rowObj(cols, item), i, Math)) return;
      sel.push({ item, id: item.cells[0], old: d, oldPat: item.cells[3] || '', len: len.get(item.cells[0]) || 0 });
    });
    const v = num(o.value);
    const sumOld = sel.reduce((a, b) => a + b.old, 0);
    const sumLen = sel.reduce((a, b) => a + b.len, 0);
    const warn = [];
    if (isNaN(v)) warn.push('Informe um valor numérico.');
    sel.forEach(r => {
      switch (o.mode) {
        case 'set': r.neu = v; break;
        case 'mul': r.neu = r.old * v; break;
        case 'add': r.neu = r.old + v; break;
        case 'perlen': r.neu = v * r.len; break;
        case 'total-equal': r.neu = sel.length ? v / sel.length : 0; break;
        case 'total-prop': r.neu = sumOld ? v * r.old / sumOld : NaN; break;
        case 'total-len': r.neu = sumLen ? v * r.len / sumLen : NaN; break;
        default: r.neu = r.old;
      }
      if (isNaN(r.neu)) r.neu = r.old;
      r.neu = Number(r.neu.toFixed(o.decimals == null ? 4 : o.decimals));
      r.newPat = o.pattern.mode === 'set' ? o.pattern.value : o.pattern.mode === 'clear' ? '' : r.oldPat;
    });
    if (o.mode === 'total-prop' && !sumOld) warn.push('Soma das demandas atuais é zero — não dá para distribuir proporcionalmente.');
    if (o.mode === 'total-len' && !sumLen) warn.push('Nenhum trecho conectado encontrado nos nós selecionados.');
    if (o.mode === 'perlen' || o.mode === 'total-len') {
      const noLen = sel.filter(r => !r.len).length;
      if (noLen) warn.push(noLen + ' nó(s) sem trechos conectados (ficam com demanda 0).');
    }
    return { rows: sel, sumOld, sumNew: sel.reduce((a, b) => a + b.neu, 0), warn };
  }
  function applyDemandPlan(plan, patternMode, decimals) {
    plan.rows.forEach(r => {
      setCell(r.item, 2, fmtNum(r.neu, decimals == null ? 4 : decimals));
      if (patternMode !== 'keep') setCell(r.item, 3, r.newPat);
    });
  }

  /* ------------------------------------------------------------------ SWMM: hietogramas */
  function idfIntensity(p, t) { return p.K * Math.pow(p.T, p.a) / Math.pow(t + p.b, p.c); } // mm/h, t em min

  function arrangeBlocks(sortedDesc, r, firstAfter) {
    const n = sortedDesc.length, out = new Array(n);
    const p = Math.min(n - 1, Math.max(0, Math.round(r * (n - 1))));
    out[p] = sortedDesc[0];
    let left = p - 1, right = p + 1, after = !!firstAfter;
    for (let k = 1; k < n; k++) {
      if ((after && right < n) || left < 0) out[right++] = sortedDesc[k];
      else out[left--] = sortedDesc[k];
      after = !after;
    }
    return out;
  }
  /* p: {method:'alt'|'chicago'|'rect', K,a,b,c,T, D(min), dt(min), r(0-1), firstAfter, ptotal} */
  function hyetograph(p) {
    const n = Math.max(1, Math.round(p.D / p.dt));
    const warn = [];
    let depths = [];
    if (p.method === 'alt') {
      const blocks = [];
      let prev = 0;
      for (let k = 1; k <= n; k++) {
        const cum = idfIntensity(p, k * p.dt) * k * p.dt / 60;
        blocks.push(Math.max(0, cum - prev));
        prev = Math.max(prev, cum);
      }
      blocks.sort((x, y) => y - x);
      depths = arrangeBlocks(blocks, p.r, p.firstAfter);
    } else if (p.method === 'chicago') {
      const r = Math.min(0.99, Math.max(0.01, p.r));
      const A = p.K * Math.pow(p.T, p.a);
      const iAt = t => { // t = minutos desde o início
        const tp = r * n * p.dt;
        const x = t < tp ? (tp - t) / r : (t - tp) / (1 - r);
        return Math.max(0, A * ((1 - p.c) * x + p.b) / Math.pow(x + p.b, 1 + p.c));
      };
      const sub = 40;
      for (let k = 0; k < n; k++) {
        let s = 0;
        for (let j = 0; j < sub; j++) s += iAt((k + (j + 0.5) / sub) * p.dt);
        depths.push(s / sub * p.dt / 60);
      }
      if (p.c >= 1) warn.push('Com c ≥ 1 o método de Chicago pode gerar intensidades negativas (truncadas em 0).');
    } else {
      const tot = idfIntensity(p, n * p.dt) * n * p.dt / 60;
      depths = new Array(n).fill(tot / n);
    }
    let total = depths.reduce((a, b) => a + b, 0);
    if (p.ptotal > 0 && total > 0) {
      const f = p.ptotal / total;
      depths = depths.map(d => d * f);
      total = p.ptotal;
    }
    const blocks = depths.map((d, k) => ({ t0: k * p.dt, depth: d, intensity: d * 60 / p.dt }));
    const peak = Math.max(...blocks.map(b => b.intensity));
    return { dt: p.dt, n, blocks, total, peak, warn, D: n * p.dt };
  }
  /* converte hietograma em linhas de [TIMESERIES]: [data, hora, valor] */
  function hyetographRows(h, format, dec, trailingZero) {
    const out = h.blocks.map(b => ['', minToHHMM(b.t0), fmtNum(format === 'VOLUME' ? b.depth : b.intensity, dec)]);
    if (trailingZero) out.push(['', minToHHMM(h.D), '0']);
    return out;
  }
  /* aplica no modelo: cria/atualiza série e pluviômetro. g: {name, format, scf} ou null */
  function applyHyetograph(model, tsName, tsRows, g, h, comment) {
    const ts = ensureSection(model, 'TIMESERIES', [';;Name          \tDate      \tTime      \tValue', ';;--------------\t----------\t----------\t----------'],
      ['CURVES', 'RAINGAGES']);
    let s = ts.series.find(x => x.name === tsName);
    const comments = [';' + comment];
    if (s) { s.rows = tsRows; s.dirty = true; s.file = null; s.comments = comments; }
    else s = addSeries(ts, tsName, tsRows, { comments });
    if (g) {
      const rg = ensureSection(model, 'RAINGAGES', [';;Name          \tFormat   \tInterval\tSCF   \tSource'], ['TITLE', 'OPTIONS', 'EVAPORATION', 'TEMPERATURE']);
      const cells = [g.name, g.format, minToHHMM(h.dt), String(g.scf), 'TIMESERIES', tsName];
      const ex = rows(rg).find(r => r.cells[0] === g.name);
      if (ex) cells.forEach((c, i) => setCell(ex, i, c));
      else addRow(rg, cells);
    }
    return ts;
  }

  /* ------------------------------------------------------------------ export */
  const Inp = {
    groups, swapRows, reverseGroup, renameGroup, linkEnds,
    SCHEMAS, FORMS, STANDARD, formFor, kvGet, kvSet, kvExtras, kvSetExtras, kvIndex, missingSections, sectionCount, parse, serialize, getSection, ensureSection, sectionLines, setSectionLines, columns, rows, setCell, rowObj,
    addRow, removeItems, seriesCols, addSeries, optionValue, newModel, bulkPlan, applyPlan, demandPlan, applyDemandPlan,
    connectedLength, hyetograph, hyetographRows, applyHyetograph, idfIntensity, arrangeBlocks, num, fmtNum, minToHHMM,
    timeToHours, tokenize, compileExpr,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Inp;
  else root.Inp = Inp;
})(typeof window !== 'undefined' ? window : globalThis);
