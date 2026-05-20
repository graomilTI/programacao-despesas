import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const TABLE_ROWS_PER_PAGE = 50;
const FETCH_BATCH_SIZE = 1000;
const IGNORED_STATUS = new Set(['baixado', 'manutencao', 'manutenção']);
const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isHashDesligados() {
  return String(window.location.hash || '').replace('#', '').toLowerCase() === 'desligados';
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function onlyDate(value) {
  if (!value) return '';
  const str = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dmy = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  return '';
}

function addDaysISO(dateISO, days) {
  const base = dateISO ? new Date(`${dateISO}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  base.setDate(base.getDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function brDate(value) {
  const raw = onlyDate(value);
  if (!raw) return '-';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

function money(value) {
  const n = Number(value || 0);
  return MONEY_FMT.format(Number.isFinite(n) ? n : 0);
}

function formatDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dt);
}

function getDiasInfo(row) {
  if (row?.dias_sem_leitura === null || row?.dias_sem_leitura === undefined || row?.dias_sem_leitura === '') return { hasValue: false, value: null };
  const n = Number(row.dias_sem_leitura);
  return Number.isFinite(n) ? { hasValue: true, value: n } : { hasValue: false, value: null };
}

function getRegional(row) {
  return normalizeText(row.coordenacao || row.regional) || 'Sem regional';
}

function getNomeColaborador(row) {
  return normalizeText(row.funcionario || row.nome || row.colaborador || row.nome_colaborador || row.Nome || row.COLABORADOR);
}

function getSituacaoColaborador(row) {
  return normalizeText(row.situacao || row.status || row['Situação'] || row.SITUACAO || row.Situação);
}

function getDataDesligamento(row) {
  return onlyDate(row.desligamento || row.data_desligamento || row['Desligamento'] || row['DATA DESLIGAMENTO'] || row.data_saida || row.demissao || row['Demissão']);
}

function isColaboradorDesligado(row) {
  const sit = normalizeKey(getSituacaoColaborador(row));
  return Boolean(getDataDesligamento(row)) || sit.includes('deslig') || sit.includes('nao ativo') || sit.includes('não ativo') || sit.includes('inativo');
}

function patrimonioAtivo(row) {
  const situacao = normalizeKey(row.situacao);
  return !IGNORED_STATUS.has(situacao) && !situacao.includes('baixado') && !situacao.includes('manutencao') && !situacao.includes('manutenção');
}

function patrimonioValor(row) {
  const fields = ['valor', 'valor_atual', 'valor_compra', 'custo', 'preco', 'preço'];
  for (const f of fields) {
    const n = Number(row[f] || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function injectVisualStyles() {
  if (document.getElementById('patrimonio-relatorios-visual-styles')) return;
  const style = document.createElement('style');
  style.id = 'patrimonio-relatorios-visual-styles';
  style.textContent = `
    .patrimonio-relatorios-page .grid-cards{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:18px}
    .patrimonio-relatorios-page .grid-cards .card{border:1px solid rgba(148,163,184,.14);background:linear-gradient(180deg,rgba(3,19,17,.88),rgba(4,28,24,.92));box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
    .patrimonio-relatorios-page .hero-metric{font-size:clamp(1.8rem,2.5vw,2.3rem);line-height:1;margin-top:12px}
    .patrimonio-action-row{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:10px;margin-top:14px}
    .patrimonio-action-row .base-button{width:100%;min-height:46px}
    .patrimonio-table-card{padding:18px}.patrimonio-table-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
    .patrimonio-table-title{display:flex;flex-direction:column;gap:4px}.patrimonio-table-title strong{font-size:1.05rem}.patrimonio-table-subtitle{opacity:.72;font-size:.92rem}
    .patrimonio-legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.legend-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(15,23,42,.28);border:1px solid rgba(148,163,184,.16);font-size:.84rem;color:#dbeafe}.legend-dot{width:9px;height:9px;border-radius:999px;display:inline-block}.legend-dot.ok{background:#22c55e}.legend-dot.atraso{background:#ef4444}.legend-dot.neutro{background:#6b7280}
    .table-shell{border:1px solid rgba(148,163,184,.14);border-radius:18px;overflow:hidden;background:rgba(2,12,10,.55)}.table-scroll-x{overflow:auto;max-height:calc(100vh - 300px)}
    .patrimonio-table{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0}.patrimonio-table thead th{position:sticky;top:0;z-index:2;background:rgba(5,18,16,.98);backdrop-filter:blur(6px);box-shadow:inset 0 -1px 0 rgba(148,163,184,.14);padding:13px 12px;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;color:#dbeafe;white-space:nowrap}.patrimonio-table tbody tr:nth-child(odd) td{background:rgba(255,255,255,.018)}.patrimonio-table tbody tr:hover td{background:rgba(52,211,153,.08)}.patrimonio-table td{padding:12px;border-top:1px solid rgba(148,163,184,.1);vertical-align:top}.pat-cell-patrimonio{min-width:110px;font-weight:700;color:#f8fafc}.pat-cell-stack{display:flex;flex-direction:column;gap:2px;min-width:0}.pat-primary{font-weight:600;color:#f8fafc;overflow-wrap:anywhere}.pat-secondary{font-size:.82rem;color:#94a3b8;overflow-wrap:anywhere}.pat-tag{display:inline-flex;align-items:center;justify-content:center;padding:5px 10px;min-width:42px;border-radius:999px;font-size:.84rem;font-weight:700;border:1px solid transparent}.pat-tag.ok{color:#dcfce7;background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.34)}.pat-tag.danger{color:#fee2e2;background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.34)}.pat-tag.neutral{color:#e2e8f0;background:rgba(148,163,184,.16);border-color:rgba(148,163,184,.34)}.pat-regional-badge{display:inline-flex;max-width:100%;padding:5px 10px;border-radius:999px;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.25);color:#ccfbf1;font-weight:600;font-size:.82rem}.pagination-chip{padding:7px 12px;border-radius:999px;background:rgba(15,23,42,.34);border:1px solid rgba(148,163,184,.16);color:#e2e8f0;font-size:.9rem}
    .desligados-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px;margin-top:16px}.desligado-card{border:1px solid rgba(148,163,184,.14);border-radius:22px;background:linear-gradient(180deg,rgba(8,22,17,.86),rgba(5,16,13,.92));padding:16px;box-shadow:var(--shadow-soft)}.desligado-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.desligado-card h3{margin:0;font-size:17px}.desligado-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.desligado-meta div{border:1px solid rgba(148,163,184,.12);border-radius:14px;padding:10px;background:rgba(15,23,42,.25)}.desligado-meta span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:900}.desligado-meta strong{display:block;margin-top:4px;color:#e5e7eb}.desligado-card-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.desligado-patr-list{margin:10px 0 0;padding-left:18px;color:#cbd5e1;font-size:13px}.desligado-card.is-ok{border-color:rgba(34,197,94,.28)}.desligado-card.is-pendente{border-color:rgba(245,158,11,.34)}
    @media(max-width:900px){.patrimonio-action-row{grid-template-columns:1fr 1fr}.patrimonio-table-card{padding:14px}.patrimonio-table-toolbar{align-items:flex-start}.table-scroll-x{max-height:none}}@media(max-width:560px){.patrimonio-action-row{grid-template-columns:1fr}.desligado-meta{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function toCsv(rows) {
  const header = ['REGIONAL','PATRIMÔNIO','COORDENAÇÃO','SUPERVISÃO','FUNCIONÁRIO','IDENTIFICAÇÃO','SITUAÇÃO','ÚLTIMA LEITURA','DIAS SEM LEITURA'];
  const lines = rows.map((row) => ([getRegional(row), row.patrimonio_codigo, row.coordenacao, row.supervisao, row.funcionario, row.identificacao, row.situacao, row.ultima_leitura_fmt, row.dias_sem_leitura].map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')));
  return [header.join(';'), ...lines].join('\n');
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function formatPercent(numerator, denominator) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function computeStats(rows) {
  const registros = rows.length;
  let emDia = 0;
  let atrasados = 0;
  let semDias = 0;
  rows.forEach((row) => {
    const diasInfo = getDiasInfo(row);
    if (!diasInfo.hasValue) semDias += 1;
    else if (diasInfo.value > 10) atrasados += 1;
    else emDia += 1;
  });
  return { registros, emDia, atrasados, semDias, percentual: formatPercent(emDia, emDia + atrasados) };
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    const situacao = normalizeKey(row.situacao);
    const diasInfo = getDiasInfo(row);
    const searchBase = normalizeKey(`${row.funcionario || ''} ${row.identificacao || ''} ${row.patrimonio_codigo || ''} ${getRegional(row)}`);
    if (filters.excluirIgnorados && IGNORED_STATUS.has(situacao)) return false;
    if (filters.coordenacao && normalizeKey(getRegional(row)) !== normalizeKey(filters.coordenacao)) return false;
    if (filters.supervisao && normalizeKey(row.supervisao) !== normalizeKey(filters.supervisao)) return false;
    if (filters.busca && !searchBase.includes(normalizeKey(filters.busca))) return false;
    if (filters.tipo === 'atrasados' && (!diasInfo.hasValue || diasInfo.value <= 10)) return false;
    if (filters.tipo === 'emdia' && (!diasInfo.hasValue || diasInfo.value > 10)) return false;
    if (filters.tipo === 'semdias' && diasInfo.hasValue) return false;
    return true;
  });
}

async function loadSnapshotRows() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('patrimonios_snapshot')
      .select('*')
      .order('coordenacao', { ascending: true })
      .order('supervisao', { ascending: true })
      .order('funcionario', { ascending: true })
      .range(from, from + FETCH_BATCH_SIZE - 1);
    if (error) throw error;
    const batch = (data || []).map((row) => ({ ...row, ultima_leitura_fmt: formatDateTime(row.ultima_leitura) }));
    all.push(...batch);
    if (batch.length < FETCH_BATCH_SIZE) break;
    from += FETCH_BATCH_SIZE;
  }
  return all;
}

async function loadColaboradoresRows() {
  const tables = ['colaborador_snapshot', 'colaboradores_snapshot', 'colaboradores', 'rh_colaboradores'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(5000);
    if (!error && Array.isArray(data)) return data;
  }
  return [];
}

function renderTableRows(rows, page = 1) {
  const tbody = document.getElementById('patrimonioRows');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="pat-cell-stack"><span class="pat-primary">Nenhum registro encontrado</span><span class="pat-secondary">Tente ajustar os filtros para visualizar outros patrimônios.</span></div></td></tr>';
    return;
  }
  const start = (page - 1) * TABLE_ROWS_PER_PAGE;
  const pageRows = rows.slice(start, start + TABLE_ROWS_PER_PAGE);
  tbody.innerHTML = pageRows.map((row) => {
    const diasInfo = getDiasInfo(row);
    const diasLabel = diasInfo.hasValue ? String(diasInfo.value) : '-';
    const tagClass = !diasInfo.hasValue ? 'neutral' : diasInfo.value > 10 ? 'danger' : 'ok';
    const situacao = normalizeText(row.situacao) || 'Sem situação';
    return `
      <tr>
        <td class="pat-cell-patrimonio">${escapeHtml(row.patrimonio_codigo || '-')}</td>
        <td><div class="pat-cell-stack"><span class="pat-regional-badge">${escapeHtml(getRegional(row))}</span><span class="pat-secondary">${escapeHtml(situacao)}</span></div></td>
        <td><span class="pat-primary">${escapeHtml(row.supervisao || '-')}</span></td>
        <td><span class="pat-primary">${escapeHtml(row.funcionario || '-')}</span></td>
        <td><span class="pat-primary">${escapeHtml(row.identificacao || '-')}</span></td>
        <td><div class="pat-cell-stack"><span class="pat-primary">${escapeHtml(row.ultima_leitura_fmt || '-')}</span><span class="pat-secondary">${diasInfo.hasValue ? 'Dias calculados' : 'Sem dias informados'}</span></div></td>
        <td><span class="pat-tag ${tagClass}">${escapeHtml(diasLabel)}</span></td>
      </tr>`;
  }).join('');
}

function fillSelectOptions(selectId, values, placeholder) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const current = el.value;
  el.innerHTML = ['<option value="">' + escapeHtml(placeholder) + '</option>'].concat(values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)).join('');
  el.value = values.includes(current) ? current : '';
}

function updateSummary(rows) {
  const stats = computeStats(rows);
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
  set('sumRegistros', stats.registros);
  set('sumEmDia', stats.emDia);
  set('sumAtrasados', stats.atrasados);
  set('sumSemDias', stats.semDias);
  set('sumPercentual', stats.percentual);
}

function updatePagination(totalRows, page) {
  const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_ROWS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalRows ? ((safePage - 1) * TABLE_ROWS_PER_PAGE) + 1 : 0;
  const end = Math.min(safePage * TABLE_ROWS_PER_PAGE, totalRows);
  const info = document.getElementById('paginationInfo');
  const prev = document.getElementById('btnPrevPage');
  const next = document.getElementById('btnNextPage');
  if (info) info.textContent = totalRows ? `Página ${safePage}/${totalPages} • exibindo ${start}-${end} de ${totalRows}` : 'Página 1/1 • sem registros';
  if (prev) prev.disabled = safePage <= 1;
  if (next) next.disabled = safePage >= totalPages;
  return safePage;
}

function setFeedback(message, isError = false) {
  const el = document.getElementById('patrimonioFeedback');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fca5a5' : '#cbd5e1';
}

function archivedKey(nome, data) {
  return `${normalizeKey(nome)}::${data}`;
}

function readLocalArchived() {
  try { return new Set(JSON.parse(localStorage.getItem('patrimonios_desligados_arquivados') || '[]')); } catch { return new Set(); }
}

function saveLocalArchived(set) {
  try { localStorage.setItem('patrimonios_desligados_arquivados', JSON.stringify([...set])); } catch {}
}

function buildDesligados(colaboradores, patrimonios) {
  const ativoPatr = patrimonios.filter(patrimonioAtivo);
  const byNome = new Map();
  ativoPatr.forEach((p) => {
    const nome = normalizeKey(p.funcionario);
    if (!nome) return;
    if (!byNome.has(nome)) byNome.set(nome, []);
    byNome.get(nome).push(p);
  });
  const localArchived = readLocalArchived();
  return colaboradores
    .filter(isColaboradorDesligado)
    .map((c) => {
      const nome = getNomeColaborador(c);
      const data = getDataDesligamento(c) || todayISO();
      const items = byNome.get(normalizeKey(nome)) || [];
      const valor = items.reduce((sum, p) => sum + patrimonioValor(p), 0);
      const regional = normalizeText(c.coordenacao || c.regional || c.supervisao || c['Coordenação'] || c['Regional']) || 'Sem regional';
      const obs = normalizeText(c.observacoes || c.observacao || c['Observações'] || c.motivo || '');
      return { data, nome, regional, un: items.length, prazo: addDaysISO(data, 7), situacao: items.length ? 'PENDENTE' : 'OK', observacoes: obs, valor, patrimônios: items, archivedKey: archivedKey(nome, data) };
    })
    .filter((row) => row.nome && !localArchived.has(row.archivedKey))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function enviarDesconto(row) {
  const payload = {
    data_referencia: row.data,
    nome: row.nome,
    regional: row.regional,
    un: row.un,
    prazo_devolucao: row.prazo,
    situacao: row.situacao,
    status: 'PENDENTE',
    observacoes: row.observacoes || `Desconto gerado pelo Patrimônio. Materiais pendentes: ${row.un}.`,
    valor: row.valor || 0,
    origem: 'PATRIMONIO_DESLIGADOS',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    meta: { patrimonios: row.patrimônios.map((p) => ({ patrimonio_codigo: p.patrimonio_codigo, identificacao: p.identificacao, valor: patrimonioValor(p) })) },
  };
  const { error } = await supabase.from('conferencia_descontos').insert(payload);
  if (error) throw error;
  const localArchived = readLocalArchived();
  localArchived.add(row.archivedKey);
  saveLocalArchived(localArchived);
}

function renderDesligados(rows) {
  const wrap = document.getElementById('desligadosCards');
  if (!wrap) return;
  if (!rows.length) {
    wrap.innerHTML = '<article class="base-card"><strong>Nenhum desligamento pendente.</strong><p class="section-subtitle">Quando o RH indicar desligamento e houver vínculo na base, os cards aparecerão aqui automaticamente.</p></article>';
    return;
  }
  wrap.innerHTML = rows.map((row, index) => `
    <article class="desligado-card ${row.situacao === 'OK' ? 'is-ok' : 'is-pendente'}" data-index="${index}">
      <div class="desligado-card-head">
        <div><h3>${escapeHtml(row.nome)}</h3><div class="pat-secondary">${escapeHtml(row.regional)}</div></div>
        <span class="pat-tag ${row.situacao === 'OK' ? 'ok' : 'danger'}">${escapeHtml(row.situacao)}</span>
      </div>
      <div class="desligado-meta">
        <div><span>Data</span><strong>${brDate(row.data)}</strong></div>
        <div><span>UN</span><strong>${row.un}</strong></div>
        <div><span>Prazo</span><strong>${brDate(row.prazo)}</strong></div>
        <div><span>Valor</span><strong>${money(row.valor)}</strong></div>
      </div>
      <div class="pat-secondary"><strong>Observações:</strong> ${escapeHtml(row.observacoes || '-')}</div>
      ${row.patrimônios.length ? `<ul class="desligado-patr-list">${row.patrimônios.slice(0, 8).map((p) => `<li>${escapeHtml(p.patrimonio_codigo || '-')} — ${escapeHtml(p.identificacao || '')}</li>`).join('')}${row.patrimônios.length > 8 ? `<li>+ ${row.patrimônios.length - 8} item(ns)</li>` : ''}</ul>` : ''}
      <div class="desligado-card-actions">
        <button class="base-button ${row.situacao === 'PENDENTE' ? 'primary' : 'secondary'}" data-desconto-index="${index}" type="button">DESCONTO</button>
      </div>
    </article>`).join('');
}

function renderRelatoriosPage(content) {
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const importarUrl = toPanelUrl('importar-patrimonios');
  const statusUrl = toPanelUrl('patrimonio-status');
  const desligadosUrl = `${toPanelUrl('adm-patrimonio')}#desligados`;
  content.innerHTML = `
    <section class="base-page patrimonio-relatorios-page">
      <div class="section-heading">
        <div><h2>Relatórios de Patrimônios</h2><p class="section-subtitle">Consulta da base atual importada em <strong>RELATÓRIOS &gt; Patrimônios</strong>, com filtros por regional, supervisão e situação de atraso.</p></div>
        <div class="inline-nav"><a href="${relatoriosUrl}" class="active">Relatórios</a><a href="${desligadosUrl}">Desligados</a><a href="${importarUrl}">Importar arquivo</a><a href="${statusUrl}">Status</a></div>
      </div>
      <div class="grid-cards"><article class="card"><h3>Total filtrado</h3><div class="hero-metric" id="sumRegistros">0</div></article><article class="card"><h3>Em dia</h3><div class="hero-metric" id="sumEmDia">0</div></article><article class="card"><h3>Em atraso</h3><div class="hero-metric" id="sumAtrasados">0</div></article><article class="card"><h3>Sem dias</h3><div class="hero-metric" id="sumSemDias">0</div></article><article class="card"><h3>% em dia</h3><div class="hero-metric" id="sumPercentual">0%</div></article></div>
      <article class="base-card"><div class="base-grid"><div class="base-field third"><label class="base-label" for="fCoordenacao">Regional</label><select class="base-select" id="fCoordenacao"><option value="">Todas</option></select></div><div class="base-field third"><label class="base-label" for="fSupervisao">Supervisão</label><select class="base-select" id="fSupervisao"><option value="">Todas</option></select></div><div class="base-field third"><label class="base-label" for="fTipo">Situação</label><select class="base-select" id="fTipo"><option value="geral">Geral</option><option value="atrasados">Somente atrasados</option><option value="emdia">Somente em dia</option><option value="semdias">Somente sem dias</option></select></div><div class="base-field third"><label class="base-label" for="fIgnorados">Baixado / Manutenção</label><select class="base-select" id="fIgnorados"><option value="mostrar">Mostrar</option><option value="excluir">Excluir</option></select></div><div class="base-field"><label class="base-label" for="fBusca">Busca</label><input class="base-input" id="fBusca" type="text" placeholder="Nome, identificação ou patrimônio" /></div></div>
        <div class="patrimonio-action-row"><button class="base-button primary" id="btnAplicar">Aplicar filtros</button><button class="base-button secondary" id="btnLimpar">Limpar</button><button class="base-button secondary" id="btnCsv">Baixar CSV</button><button class="base-button secondary" id="btnZip">Gerar ZIP imagens</button><button class="base-button secondary" id="btnZipRegional">Gerar ZIP por regional</button></div>
        <pre id="patrimonioFeedback" style="white-space:pre-wrap;margin:14px 0 0;color:#cbd5e1;">Carregando base atual...</pre></article>
      <article class="base-card patrimonio-table-card"><div class="patrimonio-table-toolbar"><div class="patrimonio-table-title"><strong>Lista de patrimônios</strong><span class="patrimonio-table-subtitle">Visualização organizada por patrimônio, regional, supervisão e status de leitura.</span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><button class="base-button secondary" id="btnPrevPage" type="button">Anterior</button><span id="paginationInfo" class="pagination-chip">Página 1/1</span><button class="base-button secondary" id="btnNextPage" type="button">Próxima</button></div></div><div class="patrimonio-legend" style="margin-bottom:12px;"><span class="legend-chip"><span class="legend-dot ok"></span> Em dia</span><span class="legend-chip"><span class="legend-dot atraso"></span> Em atraso</span><span class="legend-chip"><span class="legend-dot neutro"></span> Sem dias informados</span></div><div class="table-shell"><div class="table-scroll-x"><table class="patrimonio-table"><thead><tr><th>Patrimônio</th><th>Regional</th><th>Supervisão</th><th>Funcionário</th><th>Identificação</th><th>Última leitura</th><th>Dias</th></tr></thead><tbody id="patrimonioRows"><tr><td colspan="7">Carregando...</td></tr></tbody></table></div></div></article>
    </section>`;
}

function renderDesligadosPage(content) {
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const importarUrl = toPanelUrl('importar-patrimonios');
  const statusUrl = toPanelUrl('patrimonio-status');
  const desligadosUrl = `${toPanelUrl('adm-patrimonio')}#desligados`;
  content.innerHTML = `
    <section class="base-page patrimonio-relatorios-page">
      <div class="section-heading"><div><h2>Desligados</h2><p class="section-subtitle">Cards criados com base nos colaboradores desligados pelo RH e no total de patrimônios ainda vinculados ao colaborador.</p></div><div class="inline-nav"><a href="${relatoriosUrl}">Relatórios</a><a href="${desligadosUrl}" class="active">Desligados</a><a href="${importarUrl}">Importar arquivo</a><a href="${statusUrl}">Status</a></div></div>
      <div class="grid-cards"><article class="card"><h3>Desligados</h3><div class="hero-metric" id="deslTotal">0</div></article><article class="card"><h3>Pendentes</h3><div class="hero-metric" id="deslPendentes">0</div></article><article class="card"><h3>OK</h3><div class="hero-metric" id="deslOk">0</div></article><article class="card"><h3>Valor estimado</h3><div class="hero-metric" id="deslValor" style="font-size:1.8rem">R$ 0,00</div></article></div>
      <article class="base-card"><div class="base-grid"><div class="base-field"><label class="base-label" for="deslBusca">Busca</label><input class="base-input" id="deslBusca" type="search" placeholder="Nome ou regional" /></div><div class="base-field third"><label class="base-label" for="deslSituacao">Situação</label><select class="base-select" id="deslSituacao"><option value="">Todas</option><option value="PENDENTE">Pendente</option><option value="OK">OK</option></select></div></div><div class="patrimonio-action-row" style="grid-template-columns:1fr 1fr;"><button class="base-button primary" id="deslAplicar" type="button">Aplicar filtros</button><button class="base-button secondary" id="deslAtualizar" type="button">Atualizar</button></div><pre id="patrimonioFeedback" style="white-space:pre-wrap;margin:14px 0 0;color:#cbd5e1;">Carregando desligados...</pre></article>
      <div id="desligadosCards" class="desligados-card-grid"></div>
    </section>`;
}

function setDesligadosSummary(rows) {
  const total = rows.length;
  const pend = rows.filter(r => r.situacao === 'PENDENTE').length;
  const ok = rows.filter(r => r.situacao === 'OK').length;
  const valor = rows.reduce((sum, r) => sum + Number(r.valor || 0), 0);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('deslTotal', total);
  set('deslPendentes', pend);
  set('deslOk', ok);
  set('deslValor', money(valor));
}

initProtectedPage('Relatórios de Patrimônios', (content) => {
  injectVisualStyles();
  const state = { allRows: [], filteredRows: [], page: 1, desligados: [], desligadosFiltrados: [] };

  const bootRelatorios = async () => {
    renderRelatoriosPage(content);
    const readFilters = () => ({ coordenacao: document.getElementById('fCoordenacao')?.value || '', supervisao: document.getElementById('fSupervisao')?.value || '', tipo: document.getElementById('fTipo')?.value || 'geral', busca: document.getElementById('fBusca')?.value || '', excluirIgnorados: (document.getElementById('fIgnorados')?.value || 'mostrar') === 'excluir' });
    const refreshSupervisoes = () => { const coord = document.getElementById('fCoordenacao')?.value || ''; const source = coord ? state.allRows.filter((row) => normalizeKey(getRegional(row)) === normalizeKey(coord)) : state.allRows; const supervisoes = [...new Set(source.map((row) => normalizeText(row.supervisao)).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); fillSelectOptions('fSupervisao', supervisoes, 'Todas'); };
    const applyAndRender = () => { state.filteredRows = applyFilters(state.allRows, readFilters()); state.page = updatePagination(state.filteredRows.length, state.page); renderTableRows(state.filteredRows, state.page); updateSummary(state.filteredRows); const stats = computeStats(state.filteredRows); setFeedback(`${state.filteredRows.length} registro(s) exibido(s) na tela. | Com dias informados: ${stats.emDia + stats.atrasados} | Sem dias informados: ${stats.semDias}`); };
    document.getElementById('btnAplicar')?.addEventListener('click', () => { state.page = 1; applyAndRender(); });
    document.getElementById('btnLimpar')?.addEventListener('click', () => { document.getElementById('fCoordenacao').value = ''; refreshSupervisoes(); document.getElementById('fSupervisao').value = ''; document.getElementById('fTipo').value = 'geral'; document.getElementById('fIgnorados').value = 'mostrar'; document.getElementById('fBusca').value = ''; state.page = 1; applyAndRender(); });
    document.getElementById('fCoordenacao')?.addEventListener('change', () => { refreshSupervisoes(); state.page = 1; applyAndRender(); });
    ['fSupervisao','fTipo','fIgnorados'].forEach(id => document.getElementById(id)?.addEventListener('change', () => { state.page = 1; applyAndRender(); }));
    document.getElementById('fBusca')?.addEventListener('input', () => { state.page = 1; applyAndRender(); });
    document.getElementById('btnPrevPage')?.addEventListener('click', () => { state.page = Math.max(1, state.page - 1); state.page = updatePagination(state.filteredRows.length, state.page); renderTableRows(state.filteredRows, state.page); });
    document.getElementById('btnNextPage')?.addEventListener('click', () => { const maxPage = Math.max(1, Math.ceil(state.filteredRows.length / TABLE_ROWS_PER_PAGE)); state.page = Math.min(maxPage, state.page + 1); state.page = updatePagination(state.filteredRows.length, state.page); renderTableRows(state.filteredRows, state.page); });
    document.getElementById('btnCsv')?.addEventListener('click', () => { if (!state.filteredRows.length) { setFeedback('Não há registros filtrados para exportar.', true); return; } const blob = new Blob([toCsv(state.filteredRows)], { type: 'text/csv;charset=utf-8' }); downloadBlob('relatorio-patrimonios.csv', blob); setFeedback('CSV gerado com sucesso.'); });
    document.getElementById('btnZip')?.addEventListener('click', () => setFeedback('A geração de imagens permanece no fluxo antigo. Use Baixar CSV para esta versão compacta ou mantenha o arquivo anterior caso precise do pacote visual.', true));
    document.getElementById('btnZipRegional')?.addEventListener('click', () => setFeedback('ZIP por regional permanece no fluxo antigo. Use Baixar CSV ou mantenha o arquivo anterior caso precise do pacote visual.', true));
    try { state.allRows = await loadSnapshotRows(); const coordenacoes = [...new Set(state.allRows.map((row) => getRegional(row)).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); fillSelectOptions('fCoordenacao', coordenacoes, 'Todas'); refreshSupervisoes(); applyAndRender(); } catch (error) { console.error(error); renderTableRows([]); updateSummary([]); setFeedback(error?.message || 'Erro ao carregar base de patrimônios.', true); }
  };

  const bootDesligados = async () => {
    renderDesligadosPage(content);
    const load = async () => { setFeedback('Carregando colaboradores desligados e patrimônios vinculados...'); const [patrimonios, colaboradores] = await Promise.all([loadSnapshotRows(), loadColaboradoresRows()]); state.desligados = buildDesligados(colaboradores, patrimonios); apply(); setFeedback(`${state.desligados.length} card(s) de desligamento carregado(s).`); };
    const apply = () => { const busca = normalizeKey(document.getElementById('deslBusca')?.value || ''); const sit = document.getElementById('deslSituacao')?.value || ''; state.desligadosFiltrados = state.desligados.filter(row => (!sit || row.situacao === sit) && (!busca || normalizeKey(`${row.nome} ${row.regional}`).includes(busca))); setDesligadosSummary(state.desligadosFiltrados); renderDesligados(state.desligadosFiltrados); };
    document.getElementById('deslAplicar')?.addEventListener('click', apply);
    document.getElementById('deslAtualizar')?.addEventListener('click', () => load().catch(e => setFeedback(e.message, true)));
    document.getElementById('deslBusca')?.addEventListener('input', apply);
    document.getElementById('deslSituacao')?.addEventListener('change', apply);
    content.addEventListener('click', async (event) => { const btn = event.target.closest('[data-desconto-index]'); if (!btn) return; const row = state.desligadosFiltrados[Number(btn.dataset.descontoIndex)]; if (!row) return; btn.disabled = true; btn.textContent = 'Enviando...'; try { await enviarDesconto(row); state.desligados = state.desligados.filter((r) => r.archivedKey !== row.archivedKey); apply(); setFeedback(`Desconto enviado para Conferência > Descontos: ${row.nome}.`); } catch (error) { console.error(error); setFeedback(`Falha ao enviar desconto. Rode o SQL enviado no ZIP se a tabela ainda não existir. Detalhe: ${error.message}`, true); btn.disabled = false; btn.textContent = 'DESCONTO'; } });
    try { await load(); } catch (error) { console.error(error); setFeedback(error?.message || 'Erro ao carregar desligados.', true); }
  };

  if (isHashDesligados()) bootDesligados(); else bootRelatorios();
  window.addEventListener('hashchange', () => { if (isHashDesligados()) bootDesligados(); else bootRelatorios(); });
});
