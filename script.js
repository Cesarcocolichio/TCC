const TOLERANCIA_MINUTOS = 1;

let estadosAnteriores = {}; // Guarda o último estado de cada compartimento

// 1. Tenta pegar a API do LocalStorage ou da URL
let API_URL = localStorage.getItem('API_URL');
const urlParams = new URLSearchParams(window.location.search);

// Se a pessoa ainda usar o link com ?api=, ele salva também
if (urlParams.has('api')) {
    API_URL = urlParams.get('api');
    if (API_URL.endsWith('/')) {
        API_URL = API_URL.slice(0, -1);
    }
    if (!API_URL.endsWith('/api')) {
        API_URL += '/api';
    }
    localStorage.setItem('API_URL', API_URL);
    // Limpa a URL para ficar elegante
    window.history.replaceState({}, document.title, window.location.pathname);
}

// 2. Bloqueio de Segurança / Tela de Input de API
if (!API_URL) {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; text-align:center; padding:20px; background:#1e1f24; color:#e4e6eb; font-family:'Segoe UI', Tahoma, sans-serif;">
            <h2 style="color:#3498db; margin-bottom: 10px;">Conectar ao Sistema</h2>
            <p style="margin-bottom: 20px;">Informe o endereço da API para iniciar o monitoramento.</p>
            <input type="text" id="apiInput" onkeydown="if(event.key === 'Enter') salvarApiManual()" placeholder="https://sua-api.trycloudflare.com" style="padding:15px; width:100%; max-width:350px; border-radius:8px; border:2px solid #333; background:#2a2d34; color:white; margin-bottom:20px; text-align:center; font-family:monospace; font-size:16px; outline:none;">
            <button onclick="salvarApiManual()" style="background:#3498db; color:white; padding:12px 30px; font-size:16px; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">Salvar e Entrar</button>
            <p style="font-size:12px; opacity:0.6; margin-top:20px;">O endereço ficará salvo neste dispositivo.</p>
        </div>
        <style>
            #apiInput:focus { border-color: #3498db !important; }
            button:hover { filter: brightness(1.2); }
        </style>
    `;

    window.salvarApiManual = function() {
        let val = document.getElementById('apiInput').value.trim();
        if (val) {
            // Remove a barra final se o usuário colocar sem querer
            if (val.endsWith('/')) {
                val = val.slice(0, -1);
            }
            // Adiciona o /api se não existir
            if (!val.endsWith('/api')) {
                val += '/api';
            }
            localStorage.setItem('API_URL', val);
            window.location.reload(); // Recarrega a página com a API salva
        } else {
            alert("Por favor, insira um link válido da API.");
        }
    };

    throw new Error("API_URL não definida. Exibindo tela de configuração.");
}

const API_KEY = "SUA_CHAVE_DE_API_SIMBOLICA_AQUI"; 

const headersAPI = { 
    'Content-Type': 'application/json',
    'x-api-key': API_KEY 
};

let compartimentos = [
  { id: 1, horario: null, ativo: false, estado: "sem_config", dataAlvo: null, sensor_aberto: false },
  { id: 2, horario: null, ativo: false, estado: "sem_config", dataAlvo: null, sensor_aberto: false },
  { id: 3, horario: null, ativo: false, estado: "sem_config", dataAlvo: null, sensor_aberto: false }
];

let historico = [];

window.onload = async () => {
    await carregarHistorico();
    await sincronizarComAPI();
    setInterval(tick, 1000);
};

async function tick() {
    const agora = new Date();
    const relogio = document.getElementById('relogio-digital');
    if (relogio) relogio.innerText = agora.toLocaleTimeString('pt-BR');
    
    await verificarAlertas(agora);
    await sincronizarComAPI();
}

async function carregarHistorico() {
    try {
        const res = await fetch(`${API_URL}/historico`, { headers: headersAPI });
        historico = await res.json();
    } catch (e) {
        console.error("Erro ao carregar log do banco:", e);
    }
}

async function sincronizarComAPI() {
    try {
        const response = await fetch(`${API_URL}/status`, { headers: headersAPI });
        const dadosRemotos = await response.json();
        
        compartimentos.forEach(c => {
            const remoto = dadosRemotos[c.id];
            const estadoAnteriorNoLoop = c.estado; 
            
            c.sensor_aberto = remoto.sensor_aberto;
            c.horario = remoto.horario;
            c.dataAlvo = remoto.dataAlvo;
            c.ativo = (remoto.estado !== "sem_config");

            let dispararNotificacao = null;

            if (c.sensor_aberto === true) {
                // Só processa mudança de estado e notificação se houver um alarme pendente
                const temAlarmeAtivo = ['em_alerta', 'problema', 'aguardando'].includes(remoto.estado) || 
                                     ['em_alerta', 'problema', 'aguardando'].includes(estadoAnteriorNoLoop);

                if (temAlarmeAtivo) {
                    const jaEstavaResolvido = ['tomado', 'tomado_atrasado', 'tomado_antecipado'].includes(estadoAnteriorNoLoop);

                    if (remoto.estado === "em_alerta" || estadoAnteriorNoLoop === "em_alerta") {
                        c.estado = "tomado";
                        if (!jaEstavaResolvido) dispararNotificacao = { titulo: `C${c.id} Aberto`, msg: `Aberto no horário.`, tipo: `sucesso` };
                        registrarEvento(c.id, "✅ Compartimento aberto no horário.");
                        atualizarAPI(c.id, { estado: "tomado", led: false });
                    } 
                    else if (remoto.estado === "problema" || estadoAnteriorNoLoop === "problema") {
                        c.estado = "tomado_atrasado";
                        if (!jaEstavaResolvido) dispararNotificacao = { titulo: `C${c.id} Aberto`, msg: `Aberto com atraso.`, tipo: `atraso` };
                        registrarEvento(c.id, "⚠️ Compartimento aberto com atraso.");
                        atualizarAPI(c.id, { estado: "tomado_atrasado", led: false });
                    }
                    else if (remoto.estado === "aguardando" || estadoAnteriorNoLoop === "aguardando") {
                        c.estado = "tomado_antecipado";
                        if (!jaEstavaResolvido) dispararNotificacao = { titulo: `C${c.id} Aberto`, msg: `Aberto antecipadamente.`, tipo: `antecipado` };
                        registrarEvento(c.id, "ℹ️ Compartimento aberto antes da hora.");
                        atualizarAPI(c.id, { estado: "tomado_antecipado", led: false });
                    }
                } else {
                    c.estado = remoto.estado; // Mantém o estado original (Livre, etc)
                }
            } else {
                c.estado = remoto.estado;
            }

            if (dispararNotificacao) {
                NotificationManager.send(dispararNotificacao.titulo, dispararNotificacao.msg, c.id, `${dispararNotificacao.tipo}-${Date.now()}`);
            }
        });
        
        render();
    } catch (e) {
        console.error("Erro ao sincronizar:", e);
    }
}

function traduzirEstado(e) {
  const mapa = { 
      sem_config: "Livre", vazio_aberto: "Livre", aguardando: "Monitorando", 
      em_alerta: "🚨 Hora do Medicamento", tomado: "✅ Aberto no Horário", 
      tomado_antecipado: "⚠️ Aberto Antecipado", tomado_atrasado: "⚠️ Aberto Atrasado",
      problema: "🔥 ATRASADO" 
  };
  return mapa[e] || e;
}

async function atualizarAPI(id, dados) {
    try {
        await fetch(`${API_URL}/update`, {
            method: 'POST',
            headers: headersAPI,
            body: JSON.stringify({ id, ...dados })
        });
    } catch (e) {
        console.error("Erro ao atualizar API:", e);
    }
}


async function verificarAlertas(agora) {
  for (const c of compartimentos) {
    if (!c.ativo || !c.dataAlvo) continue;
    if (c.estado !== "aguardando" && c.estado !== "em_alerta") continue;

    const dataAlvoObj = new Date(c.dataAlvo);
    const dataLimite = new Date(dataAlvoObj.getTime() + (TOLERANCIA_MINUTOS * 60000));

    if (agora >= dataAlvoObj && agora < dataLimite && c.estado === "aguardando") {
      await registrarEvento(c.id, "🔔 Hora do medicamento!");
      await atualizarAPI(c.id, { estado: "em_alerta", led: true });
      
      // Notificação: Hora do Remédio
      NotificationManager.send(
        `C${c.id}: Hora!`, 
        `Abra o compartimento ${c.id}.`,
        c.id,
        `alerta-${Date.now()}`
      );
    } 
    else if (agora >= dataLimite && c.estado !== "problema") {
      await registrarEvento(c.id, "🔥 ATRASO CRÍTICO detectado.");
      await atualizarAPI(c.id, { estado: "problema", led: true });
      
      // Notificação: Atraso Crítico
      NotificationManager.send(
        `C${c.id}: Atraso!`, 
        `Compartimento esquecido!`,
        c.id,
        `atraso-${Date.now()}`
      );
    }
  }
}

async function registrarEvento(id, msg) {
  const agora = new Date().toLocaleTimeString('pt-BR');
  await atualizarAPI(id, { log: msg });
  if (!historico.length || historico[0].msg !== msg) {
      historico.unshift({ comp: id, msg: msg, hora: agora });
  }
}

function render() {
  const container = document.getElementById("compartimentos");
  if (!container) return;
  
  container.innerHTML = "";
  compartimentos.forEach(c => {
    let controleHtml = "";
    let dataFormatada = "";
    const estaAberto = c.sensor_aberto === true;
    const cicloEncerrado = (c.estado === "tomado" || c.estado === "tomado_antecipado" || c.estado === "tomado_atrasado");

    if (c.dataAlvo) {
        const d = new Date(c.dataAlvo);
        dataFormatada = `<span style="font-size:10px; display:block; opacity:0.8;">${d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</span>`;
    }

    if (estaAberto && !cicloEncerrado) {
        controleHtml = `<span style="color:var(--problema); font-weight:bold; font-size:10px;">FECHE A GAVETA</span>`;
    } else {
        if (c.estado === "sem_config" || c.estado === "vazio_aberto") {
            controleHtml = `<button onclick="abrirConfiguracao(${c.id})" style="background:var(--aguardando)">Agendar</button>`;
        } else if (c.estado === "aguardando") {
            // MUDANÇA: Adicionado botão de Editar junto ao de Excluir
            controleHtml = `
                <div style="display:flex; gap:5px;">
                    <button onclick="abrirConfiguracao(${c.id})" style="background:#f39c12; padding: 5px 10px; flex:1;">Editar</button>
                    <button onclick="desativar(${c.id})" style="padding: 5px 10px; flex:1;">Excluir</button>
                </div>`;
        } else if (cicloEncerrado) {
            controleHtml = `<button onclick="reabastecer(${c.id})">Reabastecer</button>`;
        } else {
            controleHtml = `<span style="color:var(--text); font-size:10px; opacity:0.6;">AGUARDANDO...</span>`;
        }
    }

    let classeCard = c.estado;
    if (c.estado === 'tomado_antecipado' || c.estado === 'tomado_atrasado') classeCard = 'em_alerta';
    else if (c.estado === 'vazio_aberto') classeCard = 'sem_config';

    container.innerHTML += `
      <div class="card ${classeCard}">
        <div class="card-info">
          <div class="card-title">Compartimento ${c.id}</div>
          <div class="card-status">${traduzirEstado(c.estado)} ${estaAberto ? " (Aberta)" : ""}</div>
        </div>
        <div class="card-controls">
          <div class="horario-display">
            ${dataFormatada}
            ${c.horario || "--:--"}
          </div>
          ${controleHtml}
        </div>
      </div>
    `;
  });
}

function traduzirEstado(e) {
  const mapa = { 
      sem_config: "Livre", vazio_aberto: "Livre",  aguardando: "Monitorando", 
      em_alerta: "🚨 Hora do Medicamento", tomado: "✅ Aberto no Horário", 
      tomado_antecipado: "⚠️ Aberto Antecipado", tomado_atrasado: "⚠️ Aberto Atrasado",
      problema: "🔥 ATRASADO" 
  };
  return mapa[e] || e;
}

// Função para detectar a rolagem do "despertador"
function detectarScroll(tipo) {
    const col = document.getElementById(tipo === 'h' ? 'col-hora' : 'col-min');
    const options = col.querySelectorAll('.time-option');

    const colCenter = col.scrollTop + col.clientHeight / 2;

    let closest = null;
    let closestDist = Infinity;

    options.forEach(opt => {
        const optCenter = opt.offsetTop + opt.offsetHeight / 2;
        const dist = Math.abs(colCenter - optCenter);

        if (dist < closestDist) {
            closestDist = dist;
            closest = opt;
        }
    });

    if (closest) {
        const valor = closest.innerText;
        selecionarLista(tipo, valor, true);
    }
}

function rolarTime(e, tipo) {
    e.preventDefault();

    const col = document.getElementById(tipo === 'h' ? 'col-hora' : 'col-min');
    if (!col) return;

    const passo = col.querySelector('.time-option')?.offsetHeight || 50;
    const max = tipo === 'h' ? 23 : 59;

    const atual = Math.round(col.scrollTop / passo);
    const direcao = e.deltaY > 0 ? 1 : -1;
    const proximo = Math.max(0, Math.min(max, atual + direcao));

    col.scrollTo({
        top: proximo * passo,
        behavior: 'smooth'
    });

    selecionarLista(tipo, String(proximo).padStart(2, '0'), true);
}

function abrirConfiguracao(id) {
  const comp = compartimentos.find(x => x.id === id);
  if (comp.sensor_aberto) return alert("Feche antes de configurar.");

  // MUDANÇA: Lógica para carregar o horário já existente ou 00:00
  const horarioAtual = comp.horario || "00:00";
  const [hInicial, mInicial] = horarioAtual.split(":");
  const rawInicial = hInicial + mInicial;

  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  
  // Adicionado padding vazio para centralizar o primeiro e último item
  let horasHTML = "<div style='height:50px; flex-shrink:0;'></div>";
  for(let i=0; i<24; i++) {
    let num = i.toString().padStart(2,'0');
    horasHTML += `<div class="time-option" id="opt-h-${num}" onclick="selecionarLista('h', '${num}')">${num}</div>`;
  }
  horasHTML += "<div style='height:50px; flex-shrink:0;'></div>";
  
  let minHTML = "<div style='height:50px; flex-shrink:0;'></div>";
  for(let i=0; i<60; i++) {
    let num = i.toString().padStart(2,'0');
    minHTML += `<div class="time-option" id="opt-m-${num}" onclick="selecionarLista('m', '${num}')">${num}</div>`;
  }
  minHTML += "<div style='height:50px; flex-shrink:0;'></div>";

  content.innerHTML = `
    <style>
      .custom-time-picker { display:flex; flex-direction:column; align-items:center; gap:15px; margin:20px 0; }
      #time-input { font-size:2rem; text-align:center; background:#2a2d34; color:#3498db; border:2px solid #333; border-radius:8px; padding:10px; width:100%; max-width:150px; font-family:monospace; outline:none; pointer-events:none; }
      .time-lists-wrapper { position:relative; background:#1e1f24; padding:10px; border-radius:10px; border:1px solid #333; box-shadow:inset 0 0 10px rgba(0,0,0,0.5); width:100%; max-width: 250px; }
      .time-lists-wrapper::before, .time-lists-wrapper::after { content:''; position:absolute; left:0; right:0; height:50px; pointer-events:none; z-index:2; }
      .time-lists-wrapper::before { top:0; background:linear-gradient(to bottom, #1e1f24 20%, transparent); border-radius:10px 10px 0 0; }
      .time-lists-wrapper::after { bottom:0; background:linear-gradient(to top, #1e1f24 20%, transparent); border-radius:0 0 10px 10px; }
      .time-lists { display:flex; gap:20px; align-items:center; justify-content:center; }
      .time-col { height:150px; width:70px; overflow-y:auto; scroll-snap-type:y mandatory; scrollbar-width:none; position:relative; scroll-behavior:smooth; }
      .time-col::-webkit-scrollbar { display:none; }
      .time-option { height:50px; display:flex; align-items:center; justify-content:center; font-size:1.4rem; color:#555; scroll-snap-align:center; cursor:pointer; transition:0.2s; user-select:none; }
      .time-option.active { color:#3498db; font-size:1.8rem; font-weight:bold; }
      .time-separator { font-size:2rem; font-weight:bold; color:#555; padding-bottom:5px; }
    </style>
    <h2 style="text-align:center;">Agendar C${id}</h2>
    <div class="custom-time-picker">
      <div class="time-input-box">
        <input type="text" id="time-input" value="${horarioAtual}" data-raw="${rawInicial}" data-id="${id}" readonly inputmode="none" onkeydown="handleTimeInput(event)">
      </div>
      <div class="time-lists-wrapper">
        <div class="time-lists">
          <div class="time-col" id="col-hora" onscroll="detectarScroll('h')" onwheel="rolarTime(event, 'h')">${horasHTML}</div>
          <div class="time-separator">:</div>
          <div class="time-col" id="col-min" onscroll="detectarScroll('m')" onwheel="rolarTime(event, 'm')">${minHTML}</div>
        </div>
      </div>
    </div>
    <div style="display:flex; gap:10px;">
      <button style="flex:1; background:var(--tomado); color:black;" onclick="validarHorario(${id})">Salvar</button>
      <button style="flex:1;" onclick="fecharModal()">Voltar</button>
    </div>
  `;
  modal.classList.add("show");

  // MUDANÇA: Posiciona a rolagem inicial no horário que já estava configurado
  setTimeout(() => {
      selecionarLista('h', hInicial);
      selecionarLista('m', mInicial);
  }, 50);
}

// Bloqueado pelo readonly e inputmode
function handleTimeInput(e) {
    if (e.key === "Enter") {
        const id = parseInt(e.target.dataset.id);
        validarHorario(id);
        return;
    }
    
    if (["Tab", "ArrowLeft", "ArrowRight", "Delete"].includes(e.key)) return;
    e.preventDefault();
    let input = e.target;
    let raw = input.dataset.raw || "";

    if (e.key === "Backspace") {
        raw = raw.slice(0, -1);
    } else if (/\d/.test(e.key) && raw.length < 4) {
        raw += e.key;
    }

    input.dataset.raw = raw;

    let formatado = "00:00";
    if (raw.length === 1) formatado = `0${raw[0]}:00`;
    else if (raw.length === 2) formatado = `${raw[0]}${raw[1]}:00`;
    else if (raw.length === 3) formatado = `${raw[0]}${raw[1]}:0${raw[2]}`;
    else if (raw.length === 4) formatado = `${raw[0]}${raw[1]}:${raw[2]}${raw[3]}`;

    input.value = formatado;

    let h = formatado.split(":")[0];
    let m = formatado.split(":")[1];
    atualizarSelecaoVisual('h', h);
    if (raw.length >= 2) atualizarSelecaoVisual('m', m);
}

function selecionarLista(tipo, valor, isScroll = false) {
    const input = document.getElementById('time-input');
    let h = input.value.split(":")[0];
    let m = input.value.split(":")[1];

    if (tipo === 'h') h = valor;
    if (tipo === 'm') m = valor;

    input.value = `${h}:${m}`;
    input.dataset.raw = h + m; 

    atualizarSelecaoVisual(tipo, valor, isScroll);
}

function atualizarSelecaoVisual(tipo, valor, isScroll = false) {
    document.querySelectorAll(`[id^='opt-${tipo}-']`)
        .forEach(el => el.classList.remove('active'));

    let opt = document.getElementById(`opt-${tipo}-${valor}`);

    if (opt) {
        opt.classList.add('active');

        if (!isScroll) {
            const col = document.getElementById(tipo === 'h' ? 'col-hora' : 'col-min');

            const target =
                opt.offsetTop -
                (col.clientHeight / 2) +
                (opt.offsetHeight / 2);

            col.scrollTo({
                top: target,
                behavior: 'smooth'
            });
        }
    }
}

function validarHorario(id) {
  let val = document.getElementById('time-input').value.replace(/\D/g, "");
  let h = val.slice(0,2);
  let m = val.slice(2,4);
  
  if (parseInt(h) > 23) h = "23";
  if (parseInt(m) > 59) m = "59";

  const agora = new Date();
  const alvo = new Date();
  alvo.setHours(parseInt(h), parseInt(m), 0, 0);

  if (alvo <= agora) {
    const content = document.getElementById("modalContent");
    content.innerHTML = `
      <h2>Agendar para amanhã?</h2>
      <p style="font-size: 14px; margin-bottom: 20px;">O horário ${h}:${m} já passou hoje.</p>
      <div style="display:flex; gap:10px;">
        <button style="flex:1; background:var(--tomado); color:black;" onclick="salvarConfiguracao(${id}, '${h}', '${m}', true)">Sim</button>
        <button style="flex:1;" onclick="abrirConfiguracao(${id})">Corrigir</button>
      </div>
    `;
  } else {
    salvarConfiguracao(id, h, m, false);
  }
}

function salvarConfiguracao(id, h, m, paraAmanha) {
  const comp = compartimentos.find(x => x.id === id);
  const dataAlvo = new Date();
  dataAlvo.setHours(parseInt(h), parseInt(m), 0, 0);
  if (paraAmanha) dataAlvo.setDate(dataAlvo.getDate() + 1);

  comp.horario = `${h}:${m}`;
  comp.dataAlvo = dataAlvo.getTime();
  comp.estado = "aguardando";
  comp.ativo = true;

  atualizarAPI(id, { estado: "aguardando", horario: comp.horario, dataAlvo: comp.dataAlvo, led: false });
  registrarEvento(id, `Agendado para ${comp.horario}.`);
  fecharModal();
  render();
}

function desativar(id) {
  const comp = compartimentos.find(x => x.id === id);
  comp.ativo = false;
  comp.estado = "sem_config";
  comp.horario = null;
  comp.dataAlvo = null;
  atualizarAPI(id, { estado: "sem_config", horario: null, dataAlvo: null, led: false });
  render();
}

function reabastecer(id) {
  const comp = compartimentos.find(x => x.id === id);
  comp.ativo = false;
  comp.estado = "sem_config";
  comp.horario = null;
  comp.dataAlvo = null;
  atualizarAPI(id, { estado: "sem_config", horario: null, dataAlvo: null, led: false });
  render();
}

function abrirHistorico() {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  let html = historico.map(h => `
    <div style="border-bottom: 1px solid #444; padding: 8px 0; font-size: 12px;">
      <span style="color:var(--aguardando)">[${h.hora}]</span> <strong>C${h.comp}:</strong> ${h.msg}
    </div>`).join("");
  content.innerHTML = `<h2>Log de Atividades</h2><div style="max-height: 300px; overflow-y: auto;">${historico.length ? html : "Nenhum registro encontrado."}</div><button style="width:100%; margin-top:10px;" onclick="fecharModal()">Fechar</button>`;
  modal.classList.add("show");
}

function fecharModal() { document.getElementById("modal").classList.remove("show"); }

// Nova função para redefinir o link da API
function resetarApi() {
    if(confirm("Deseja desconectar a API atual e inserir um novo link?")) {
        localStorage.removeItem('API_URL');
        window.location.reload();
    }
}