const TOLERANCIA_MINUTOS = 1;

// 1. Tenta pegar a API do LocalStorage ou da URL
let API_URL = localStorage.getItem('API_URL');
const urlParams = new URLSearchParams(window.location.search);

// Se a pessoa ainda usar o link com ?api=, ele salva também
if (urlParams.has('api')) {
    API_URL = urlParams.get('api');
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
            <input type="text" id="apiInput" placeholder="https://sua-api.trycloudflare.com" style="padding:15px; width:100%; max-width:350px; border-radius:8px; border:2px solid #333; background:#2a2d34; color:white; margin-bottom:20px; text-align:center; font-family:monospace; font-size:16px; outline:none;">
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
            const estadoAnterior = c.estado;
            
            c.sensor_aberto = remoto.sensor_aberto;
            c.horario = remoto.horario;
            c.dataAlvo = remoto.dataAlvo;
            c.ativo = (remoto.estado !== "sem_config");

            if (remoto.sensor_aberto === true) {
                if (remoto.estado === "em_alerta" && estadoAnterior !== "tomado") {
                    c.estado = "tomado";
                    registrarEvento(c.id, "✅ Sucesso: Medicamento retirado no horário.");
                    atualizarAPI(c.id, { estado: "tomado", led: false });
                } 
                else if (remoto.estado === "problema" && estadoAnterior !== "tomado_atrasado") {
                    c.estado = "tomado_atrasado";
                    registrarEvento(c.id, "⚠️ Aviso: Medicamento retirado com atraso.");
                    atualizarAPI(c.id, { estado: "tomado_atrasado", led: false });
                }
                else if (remoto.estado === "aguardando" && estadoAnterior !== "tomado_antecipado") {
                    c.estado = "tomado_antecipado";
                    registrarEvento(c.id, "⚠️ Aviso: Medicamento tomado antecipadamente.");
                    atualizarAPI(c.id, { estado: "tomado_antecipado", led: false });
                }
                else if (remoto.estado === "sem_config" && estadoAnterior !== "vazio_aberto") {
                    c.estado = "vazio_aberto";
                    registrarEvento(c.id, "ℹ️ Nota: Compartimento vazio aberto.");
                }
            } else {
                c.estado = remoto.estado;
            }
        });
        render();
    } catch (e) {
        console.error("Erro ao sincronizar:", e);
    }
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
    } 
    else if (agora >= dataLimite && c.estado !== "problema") {
      await registrarEvento(c.id, "🔥 ATRASO CRÍTICO detectado.");
      await atualizarAPI(c.id, { estado: "problema", led: true });
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
            controleHtml = `<button onclick="desativar(${c.id})">Cancelar</button>`;
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
      sem_config: "Livre", vazio_aberto: "Livre", aguardando: "Monitorando", 
      em_alerta: "🚨 Hora do Medicamento", tomado: "✅ Tomado no Horário", 
      tomado_antecipado: "⚠️ Tomado Antecipado", tomado_atrasado: "⚠️ Tomado Atrasado",
      problema: "🔥 ATRASADO" 
  };
  return mapa[e] || e;
}

function abrirConfiguracao(id) {
  const comp = compartimentos.find(x => x.id === id);
  if (comp.sensor_aberto) return alert("Feche antes de configurar.");

  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  
  let horasHTML = "";
  for(let i=0; i<24; i++) {
    let num = i.toString().padStart(2,'0');
    horasHTML += `<div class="time-option" id="opt-h-${num}" onclick="selecionarLista('h', '${num}')">${num}</div>`;
  }
  
  let minHTML = "";
  for(let i=0; i<60; i++) {
    let num = i.toString().padStart(2,'0');
    minHTML += `<div class="time-option" id="opt-m-${num}" onclick="selecionarLista('m', '${num}')">${num}</div>`;
  }

  content.innerHTML = `
    <h2 style="text-align:center;">Agendar C${id}</h2>
    <div class="custom-time-picker">
      <div class="time-input-box">
        <input type="text" id="time-input" value="00:00" data-raw="" onkeydown="handleTimeInput(event)">
      </div>
      <div class="time-lists">
        <div class="time-col" id="col-hora">${horasHTML}</div>
        <div class="time-col" id="col-min">${minHTML}</div>
      </div>
    </div>
    <div style="display:flex; gap:10px;">
      <button style="flex:1; background:var(--tomado); color:black;" onclick="validarHorario(${id})">Salvar</button>
      <button style="flex:1;" onclick="fecharModal()">Voltar</button>
    </div>
  `;
  modal.classList.add("show");
}

function handleTimeInput(e) {
    if (["Tab", "ArrowLeft", "ArrowRight", "Delete", "Enter"].includes(e.key)) return;
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

function selecionarLista(tipo, valor) {
    const input = document.getElementById('time-input');
    let h = input.value.split(":")[0];
    let m = input.value.split(":")[1];

    if (tipo === 'h') h = valor;
    if (tipo === 'm') m = valor;

    input.value = `${h}:${m}`;
    input.dataset.raw = h + m; 

    atualizarSelecaoVisual('h', h);
    atualizarSelecaoVisual('m', m);
}

function atualizarSelecaoVisual(tipo, valor) {
    document.querySelectorAll(`[id^='opt-${tipo}-']`).forEach(el => el.classList.remove('active'));
    let opt = document.getElementById(`opt-${tipo}-${valor}`);
    if(opt) {
        opt.classList.add('active');
        opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
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