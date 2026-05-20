import { supabase } from './supabaseClient.js';

const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  const n = Number(value || 0);
  return MONEY_FMT.format(Number.isFinite(n) ? n : 0);
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return escapeHtml(value);
  const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : DATE_FMT.format(date);
}

function injectStyles() {
  if (document.getElementById('conferencia-descontos-inline-styles')) return;
  const s = document.createElement('style');
  s.id = 'conferencia-descontos-inline-styles';
  s.textContent = `
    .conf-tabs{order:-1;width:100%;justify-content:flex-start;margin-bottom:10px}
    .conf-panel-head{align-items:flex-start}
    .conf-table-descontos{min-width:1180px}
    .conf-discount-total{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px}
    .conf-discount-kpi{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.50);border-radius:16px;padding:12px 14px;min-width:160px}
    .conf-discount-kpi span{display:block;color:var(--muted);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .conf-discount-kpi strong{display:block;margin-top:4px;color:#dcfce7;font-size:22px}
  `;
  document.head.appendChild(s);
}

function normalizeTabs() {
  const tabs = document.querySelector('.conf-tabs');
  if (!tabs) return false;

  const desired = [
    ['despesas', 'Despesas'],
    ['descontos', 'Descontos'],
    ['auditoria', 'Auditoria'],
    ['resultado', 'Resultado diário'],
    ['uber', 'Uber'],
  ];

  const map = new Map([...tabs.querySelectorAll('.conf-tab')].map((btn) => [btn.dataset.tab, btn]));

  for (const [key, label] of desired) {
    let btn = map.get(key);
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'conf-tab';
      btn.type = 'button';
      btn.dataset.tab = key;
      btn.addEventListener('click', () => renderDescontosTab());
    }
    btn.textContent = label;
    tabs.appendChild(btn);
  }

  [...tabs.querySelectorAll('.conf-tab')].forEach((btn) => {
    const key = btn.dataset.tab;
    const idx = desired.findIndex(([d]) => d === key);
    btn.style.order = idx >= 0 ? String(idx) : '99';
    if (key === 'descontos' && !btn.dataset.descontosBound) {
      btn.dataset.descontosBound = '1';
      btn.addEventListener('click', () => renderDescontosTab());
    }
  });

  return true;
}

async function loadDescontos() {
  let query = supabase
    .from('conferencia_descontos')
    .select('*')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1000);

  const inicio = document.getElementById('conf-inicio')?.value;
  const fim = document.getElementById('conf-fim')?.value;
  if (inicio) query = query.gte('data_referencia', inicio);
  if (fim) query = query.lte('data_referencia', fim);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function setFeedback(message, isError = false) {
  const el = document.getElementById('conf-feedback');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#fecaca' : 'var(--muted)';
}

function statusChip(status) {
  const norm = String(status || 'PENDENTE').toUpperCase();
  const cls = norm === 'OK' || norm === 'CONFERIDO' ? 'ok' : norm === 'PENDENTE' ? 'warn' : 'neutral';
  return `<span class="conf-chip conf-chip-${cls}">${escapeHtml(status || 'Pendente')}</span>`;
}

async function updateDescontoStatus(id, status) {
  setFeedback('Atualizando desconto...');
  const { error } = await supabase
    .from('conferencia_descontos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    setFeedback(`Erro ao atualizar desconto: ${error.message}`, true);
    return;
  }
  await renderDescontosTab();
  setFeedback('Desconto atualizado.');
}

export async function renderDescontosTab() {
  injectStyles();
  normalizeTabs();
  document.querySelectorAll('.conf-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === 'descontos'));
  const subtitle = document.getElementById('conf-table-subtitle');
  if (subtitle) subtitle.textContent = 'Descontos enviados pelo Patrimônio para conferência e lançamento.';

  const target = document.getElementById('conf-table');
  if (!target) return;
  target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Carregando descontos...</td></tr></tbody></table></div>`;

  try {
    const rows = await loadDescontos();
    const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const pendentes = rows.filter((row) => String(row.status || '').toUpperCase() !== 'CONFERIDO').length;

    if (!rows.length) {
      target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhum desconto encontrado para os filtros atuais.</td></tr></tbody></table></div>`;
      return;
    }

    target.innerHTML = `
      <div class="conf-discount-total">
        <div class="conf-discount-kpi"><span>Registros</span><strong>${rows.length}</strong></div>
        <div class="conf-discount-kpi"><span>Pendentes</span><strong>${pendentes}</strong></div>
        <div class="conf-discount-kpi"><span>Valor total</span><strong>${money(total)}</strong></div>
      </div>
      <div class="conf-table-wrap">
        <table class="conf-table conf-table-descontos">
          <thead>
            <tr>
              <th>Data</th>
              <th>Nome</th>
              <th>Regional</th>
              <th>UN</th>
              <th>Prazo</th>
              <th>Situação</th>
              <th>Observações</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${brDate(row.data_referencia || row.created_at)}</td>
                <td><strong>${escapeHtml(row.nome || row.colaborador || '-')}</strong><small>${escapeHtml(row.origem || 'Patrimônio')}</small></td>
                <td>${escapeHtml(row.regional || row.coordenacao || row.supervisao || '-')}</td>
                <td>${escapeHtml(row.un ?? row.quantidade ?? 0)}</td>
                <td>${brDate(row.prazo_devolucao || row.prazo)}</td>
                <td>${statusChip(row.status || row.situacao || 'PENDENTE')}</td>
                <td>${escapeHtml(row.observacoes || row.observacao || '-')}</td>
                <td><strong>${money(row.valor)}</strong></td>
                <td>
                  <div class="conf-row-actions">
                    <button class="conf-btn conf-btn-primary" data-desconto-action="CONFERIDO" data-desconto-id="${escapeHtml(row.id)}" type="button">Conferido</button>
                    <button class="conf-btn" data-desconto-action="PENDENTE" data-desconto-id="${escapeHtml(row.id)}" type="button">Pendente</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Erro ao carregar descontos: ${escapeHtml(error.message || 'erro desconhecido')}</td></tr></tbody></table></div>`;
    setFeedback(`Erro ao carregar descontos. Rode o SQL enviado no ZIP se a tabela ainda não existir. Detalhe: ${error.message}`, true);
  }
}

function bootPatch() {
  injectStyles();
  const tryNormalize = () => {
    const ok = normalizeTabs();
    if (ok && window.location.hash === '#descontos') renderDescontosTab();
  };
  tryNormalize();
  const observer = new MutationObserver(() => tryNormalize());
  observer.observe(document.body, { childList: true, subtree: true });
  document.getElementById('conf-table')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-desconto-action][data-desconto-id]');
    if (!btn) return;
    updateDescontoStatus(btn.dataset.descontoId, btn.dataset.descontoAction);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootPatch);
} else {
  bootPatch();
}
