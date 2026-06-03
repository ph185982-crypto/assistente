import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = 'https://dzkfwttquhjudsryqhyu.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6a2Z3dHRxdWhqdWRzcnlxaHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODE0OTksImV4cCI6MjA5NTU1NzQ5OX0.5YeYdNoIfvf37OoovZUtNDam4RXncn_6ODOCISi_0oY';
const ACCESS_TOKEN = Deno.env.get('DASHBOARD_TOKEN') ?? 'max2025';

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Max — Finanças</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif;min-height:100vh}
.header{background:#111118;border-bottom:1px solid #1e1e2e;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:20px;font-weight:700;color:#a78bfa}
.header .sync{font-size:12px;color:#64748b}
.container{padding:24px;max-width:1200px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.card{background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:20px}
.card .label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.card .value{font-size:28px;font-weight:700}
.card .sub{font-size:12px;color:#64748b;margin-top:4px}
.green{color:#22c55e}.red{color:#f87171}.yellow{color:#fbbf24}.purple{color:#a78bfa}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
@media(max-width:768px){.grid2{grid-template-columns:1fr}}
.panel{background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:20px}
.panel h2{font-size:14px;font-weight:600;color:#94a3b8;margin-bottom:16px;text-transform:uppercase;letter-spacing:.05em}
.chart-wrap{position:relative;height:220px}
.dividas{display:flex;flex-direction:column;gap:12px}
.divida-item{display:flex;flex-direction:column;gap:4px}
.divida-header{display:flex;justify-content:space-between;font-size:13px}
.divida-name{color:#e2e8f0}.divida-val{color:#94a3b8}
.progress{background:#1e1e2e;border-radius:999px;height:6px;overflow:hidden}
.progress-bar{height:100%;border-radius:999px;background:linear-gradient(90deg,#a78bfa,#7c3aed);transition:width .5s}
.progress-bar.red{background:linear-gradient(90deg,#f87171,#dc2626)}
.progress-bar.yellow{background:linear-gradient(90deg,#fbbf24,#d97706)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;color:#64748b;font-weight:500;border-bottom:1px solid #1e1e2e;text-transform:uppercase;font-size:11px;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #0f0f1a}
tr:hover td{background:#0f0f18}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:500}
.badge-red{background:#3f1212;color:#f87171}
.badge-green{background:#0f2f1a;color:#22c55e}
.filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.btn{background:#1e1e2e;border:1px solid #2a2a3e;color:#94a3b8;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;transition:all .15s}
.btn:hover,.btn.active{background:#7c3aed;border-color:#7c3aed;color:#fff}
.empty{text-align:center;color:#374151;padding:40px;font-size:14px}
.meta-bar{margin-top:8px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.tag-prioridade{background:#3f1000;color:#fb923c;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600}
</style>
</head>
<body>

<div class="header">
  <h1>⚡ Max — Finanças</h1>
  <span class="sync" id="sync-time">Carregando...</span>
</div>

<div class="container">

  <!-- Cards -->
  <div class="cards" id="cards">
    <div class="card"><div class="label">Receitas</div><div class="value green" id="c-receitas">—</div><div class="sub" id="c-rec-sub"></div></div>
    <div class="card"><div class="label">Despesas</div><div class="value red" id="c-despesas">—</div><div class="sub" id="c-desp-sub"></div></div>
    <div class="card"><div class="label">Saldo</div><div class="value" id="c-saldo">—</div><div class="sub">mês atual</div></div>
    <div class="card"><div class="label">Meta R$8.000</div><div class="value yellow" id="c-meta">—</div><div class="meta-bar"><div class="progress"><div class="progress-bar yellow" id="meta-bar" style="width:0%"></div></div></div></div>
  </div>

  <!-- Gráficos -->
  <div class="grid2">
    <div class="panel">
      <h2>Despesas por Categoria</h2>
      <div class="chart-wrap"><canvas id="chart-cat"></canvas></div>
    </div>
    <div class="panel">
      <h2>Últimos 6 Meses</h2>
      <div class="chart-wrap"><canvas id="chart-hist"></canvas></div>
    </div>
  </div>

  <!-- Dívidas + Lembretes -->
  <div class="grid2" style="margin-bottom:24px">
    <div class="panel">
      <h2>Dívidas</h2>
      <div class="dividas" id="dividas-list"></div>
    </div>
    <div class="panel">
      <h2>Próximos Lembretes</h2>
      <div id="lembretes-list"><div class="empty">Nenhum lembrete</div></div>
    </div>
  </div>

  <!-- Extrato -->
  <div class="panel">
    <h2>Extrato</h2>
    <div class="filters">
      <button class="btn active" data-p="mes" onclick="setFiltro(this,'mes')">Este mês</button>
      <button class="btn" data-p="semana" onclick="setFiltro(this,'semana')">Semana</button>
      <button class="btn" data-p="hoje" onclick="setFiltro(this,'hoje')">Hoje</button>
      <button class="btn" data-p="mes_passado" onclick="setFiltro(this,'mes_passado')">Mês passado</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Negócio</th><th>Tipo</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody id="extrato-body"><tr><td colspan="6" class="empty">Carregando...</td></tr></tbody>
      </table>
    </div>
  </div>

</div>

<script>
const SUPA_URL = '${SUPABASE_URL}';
const SUPA_KEY = '${SUPABASE_ANON}';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtDate = s => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR');
let filtroPeriodo = 'mes';

const DIVIDAS = [
  {nome:'Adijo (nome sujo)',total:300,saldo:300,cor:'red',prioridade:true},
  {nome:'Americanas',total:6000,saldo:6000,cor:'red'},
  {nome:'CNPJ esposa',total:8000,saldo:8000,cor:'red'},
  {nome:'Mercado Pago',total:20000,saldo:20000,cor:'yellow'},
  {nome:'Infinity Pay',total:14000,saldo:14000,cor:'yellow'},
  {nome:'Condomínio',total:4200,saldo:4200,cor:'yellow'},
  {nome:'Fernando',total:17219.98,saldo:6719.98,cor:'purple'},
  {nome:'MRV',total:46000,saldo:30000,cor:'purple'},
  {nome:'Caixa Econômica',total:4680,saldo:2680,cor:'purple'},
];

function setFiltro(btn, periodo) {
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filtroPeriodo = periodo;
  loadExtrato();
}

function getPeriodo(p) {
  const hoje = new Date();
  const pad = n => String(n).padStart(2,'0');
  const ymd = d => d.toISOString().slice(0,10);
  if (p === 'hoje') return {ini: ymd(hoje), fim: ymd(hoje)};
  if (p === 'semana') {
    const ini = new Date(hoje); ini.setDate(hoje.getDate() - hoje.getDay());
    return {ini: ymd(ini), fim: ymd(hoje)};
  }
  if (p === 'mes') {
    const ini = ymd(hoje).slice(0,7) + '-01';
    const fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0);
    return {ini, fim: ymd(fim)};
  }
  if (p === 'mes_passado') {
    const mp = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return {ini: ymd(mp), fim: ymd(fim)};
  }
  return {ini: ymd(hoje).slice(0,7)+'-01', fim: ymd(hoje)};
}

let chartCat = null, chartHist = null;

async function loadCards() {
  const {ini, fim} = getPeriodo('mes');
  const {data} = await db.from('transacoes').select('*').eq('confirmado',true).gte('data_transacao',ini).lte('data_transacao',fim);
  if (!data) return;
  const rec = data.filter(t=>t.tipo==='receita').reduce((s,t)=>s+Number(t.valor),0);
  const desp = data.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+Number(t.valor),0);
  const saldo = rec - desp;
  document.getElementById('c-receitas').textContent = fmt(rec);
  document.getElementById('c-rec-sub').textContent = data.filter(t=>t.tipo==='receita').length + ' lançamentos';
  document.getElementById('c-despesas').textContent = fmt(desp);
  document.getElementById('c-desp-sub').textContent = data.filter(t=>t.tipo==='despesa').length + ' lançamentos';
  const cSaldo = document.getElementById('c-saldo');
  cSaldo.textContent = fmt(saldo);
  cSaldo.className = 'value ' + (saldo >= 0 ? 'green' : 'red');
  const pct = Math.min(100, Math.round((rec/8000)*100));
  document.getElementById('c-meta').textContent = pct + '%';
  document.getElementById('meta-bar').style.width = pct + '%';
  loadChartCat(data);
}

function loadChartCat(data) {
  const desp = data.filter(t=>t.tipo==='despesa');
  const cats = {};
  desp.forEach(t => { cats[t.categoria||'Outros'] = (cats[t.categoria||'Outros']||0) + Number(t.valor); });
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const colors = ['#7c3aed','#a78bfa','#6d28d9','#8b5cf6','#5b21b6','#c4b5fd','#4c1d95','#ddd6fe'];
  if (chartCat) chartCat.destroy();
  chartCat = new Chart(document.getElementById('chart-cat'), {
    type: 'doughnut',
    data: { labels: sorted.map(([k])=>k), datasets:[{data: sorted.map(([,v])=>v), backgroundColor: colors, borderWidth:0, hoverOffset:4}] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{color:'#94a3b8',font:{size:11},boxWidth:12} } } }
  });
}

async function loadChartHist() {
  const hoje = new Date();
  const meses = [];
  for (let i=5;i>=0;i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    meses.push(d.toISOString().slice(0,7));
  }
  const labels = meses.map(m => {
    const [y,mo] = m.split('-');
    return new Date(y,mo-1,1).toLocaleString('pt-BR',{month:'short'});
  });
  const recs = [], desps = [];
  for (const mes of meses) {
    const ini = mes+'-01';
    const fim = new Date(mes.split('-')[0], Number(mes.split('-')[1]), 0).toISOString().slice(0,10);
    const {data} = await db.from('transacoes').select('tipo,valor').eq('confirmado',true).gte('data_transacao',ini).lte('data_transacao',fim);
    if (data) {
      recs.push(data.filter(t=>t.tipo==='receita').reduce((s,t)=>s+Number(t.valor),0));
      desps.push(data.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+Number(t.valor),0));
    } else { recs.push(0); desps.push(0); }
  }
  if (chartHist) chartHist.destroy();
  chartHist = new Chart(document.getElementById('chart-hist'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {label:'Receitas', data:recs, backgroundColor:'#16a34a', borderRadius:4},
        {label:'Despesas', data:desps, backgroundColor:'#dc2626', borderRadius:4}
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{color:'#94a3b8',font:{size:11}} } },
      scales:{
        x:{ticks:{color:'#64748b'},grid:{color:'#1e1e2e'}},
        y:{ticks:{color:'#64748b',callback:v=>'R$'+v.toLocaleString('pt-BR')},grid:{color:'#1e1e2e'}}
      }
    }
  });
}

function loadDividas() {
  const el = document.getElementById('dividas-list');
  el.innerHTML = DIVIDAS.map(d => {
    const pago = d.total - d.saldo;
    const pct = Math.round((pago/d.total)*100);
    return \`<div class="divida-item">
      <div class="divida-header">
        <span class="divida-name">\${d.nome}\${d.prioridade?' <span class="tag-prioridade">PRIORIDADE</span>':''}</span>
        <span class="divida-val">\${fmt(d.saldo)}</span>
      </div>
      <div class="progress"><div class="progress-bar \${d.cor}" style="width:\${pct}%"></div></div>
    </div>\`;
  }).join('');
}

async function loadLembretes() {
  const {data} = await db.from('lembretes').select('*').eq('enviado',false).gte('data_hora', new Date().toISOString()).order('data_hora',{ascending:true}).limit(6);
  const el = document.getElementById('lembretes-list');
  if (!data || data.length===0) { el.innerHTML = '<div class="empty">Nenhum lembrete</div>'; return; }
  el.innerHTML = data.map(l => {
    const dt = new Date(l.data_hora);
    const dateStr = dt.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return \`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e1e2e">
      <span style="font-size:13px">\${l.descricao}</span>
      <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px">\${dateStr}</span>
    </div>\`;
  }).join('');
}

async function loadExtrato() {
  const {ini, fim} = getPeriodo(filtroPeriodo);
  const {data} = await db.from('transacoes').select('*').eq('confirmado',true).gte('data_transacao',ini).lte('data_transacao',fim).order('data_transacao',{ascending:false}).order('criado_em',{ascending:false});
  const tbody = document.getElementById('extrato-body');
  if (!data || data.length===0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Sem transações neste período</td></tr>'; return; }
  tbody.innerHTML = data.map(t => \`<tr>
    <td style="color:#64748b">\${fmtDate(t.data_transacao)}</td>
    <td>\${t.descricao||'—'}</td>
    <td><span style="color:#94a3b8">\${t.categoria||'—'}</span></td>
    <td style="color:#64748b">\${t.tipo_negocio||'—'}</td>
    <td><span class="badge \${t.tipo==='receita'?'badge-green':'badge-red'}">\${t.tipo}</span></td>
    <td style="text-align:right;font-weight:600" class="\${t.tipo==='receita'?'green':'red'}">\${fmt(t.valor)}</td>
  </tr>\`).join('');
}

async function init() {
  await Promise.all([loadCards(), loadChartHist(), loadLembretes()]);
  loadDividas();
  loadExtrato();
  document.getElementById('sync-time').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');

  // Real-time
  db.channel('transacoes').on('postgres_changes',{event:'*',schema:'public',table:'transacoes'}, () => {
    loadCards();
    loadExtrato();
    document.getElementById('sync-time').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
  }).subscribe();
  db.channel('lembretes').on('postgres_changes',{event:'*',schema:'public',table:'lembretes'}, loadLembretes).subscribe();
}

init();
setInterval(() => { loadCards(); loadExtrato(); loadLembretes(); }, 60000);
</script>
</body>
</html>`;

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? req.headers.get('x-dashboard-token') ?? '';

  if (token !== ACCESS_TOKEN) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#0a0a0f;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
      <div style="font-size:48px">🔐</div>
      <form method="get" style="display:flex;gap:8px">
        <input name="t" type="password" placeholder="Token de acesso" autofocus
          style="background:#111118;border:1px solid #1e1e2e;color:#e2e8f0;padding:10px 16px;border-radius:8px;outline:none;font-size:14px">
        <button type="submit" style="background:#7c3aed;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px">Entrar</button>
      </form>
      </body></html>`,
      { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
