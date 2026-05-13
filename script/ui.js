import { compartimentos, historico } from './state.js';

export function render() {
  const container = document.getElementById("compartimentos");
  if (!container) return;

  // ✅ Monta tudo numa string só, depois atribui UMA VEZ (evita o bug de botões não-clicáveis)
  let html = "";
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
            controleHtml = `<button onclick="window.abrirConfiguracao(${c.id})" style="background:var(--aguardando)">Agendar</button>`;
        } else if (c.estado === "aguardando") {
            controleHtml = `
                <div style="display:flex; gap:5px;">
                    <button onclick="window.abrirConfiguracao(${c.id})" style="background:#f39c12; padding: 5px 10px; flex:1;">Editar</button>
                    <button onclick="window.desativar(${c.id})" style="padding: 5px 10px; flex:1;">Excluir</button>
                </div>`;
        } else if (cicloEncerrado) {
            controleHtml = `<button onclick="window.reabastecer(${c.id})">Reabastecer</button>`;
        } else {
            controleHtml = `<span style="color:var(--text); font-size:10px; opacity:0.6;">AGUARDANDO...</span>`;
        }
    }

    let classeCard = c.estado;
    if (c.estado === 'tomado_antecipado' || c.estado === 'tomado_atrasado') classeCard = 'em_alerta';
    else if (c.estado === 'vazio_aberto') classeCard = 'sem_config';

    html += `
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

  container.innerHTML = html; // ✅ Uma única atribuição no final
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

window.detectarScroll = function(tipo) {
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
        window.selecionarLista(tipo, valor, true);
    }
};

window.rolarTime = function(e, tipo) {
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

    window.selecionarLista(tipo, String(proximo).padStart(2, '0'), true);
};

window.abrirConfiguracao = function(id) {
  const comp = compartimentos.find(x => x.id === id);
  if (comp.sensor_aberto) return alert("Feche antes de configurar.");

  const horarioAtual = comp.horario || "00:00";
  const [hInicial, mInicial] = horarioAtual.split(":");
  const rawInicial = hInicial + mInicial;

  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  
  let horasHTML = "<div style='height:50px; flex-shrink:0;'></div>";
  for(let i=0; i<24; i++) {
    let num = i.toString().padStart(2,'0');
    horasHTML += `<div class="time-option" id="opt-h-${num}" onclick="window.selecionarLista('h', '${num}')">${num}</div>`;
  }
  horasHTML += "<div style='height:50px; flex-shrink:0;'></div>";
  
  let minHTML = "<div style='height:50px; flex-shrink:0;'></div>";
  for(let i=0; i<60; i++) {
    let num = i.toString().padStart(2,'0');
    minHTML += `<div class="time-option" id="opt-m-${num}" onclick="window.selecionarLista('m', '${num}')">${num}</div>`;
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
        <input type="text" id="time-input" value="${horarioAtual}" data-raw="${rawInicial}" data-id="${id}" readonly inputmode="none" onkeydown="window.handleTimeInput(event)">
      </div>
      <div class="time-lists-wrapper">
        <div class="time-lists">
          <div class="time-col" id="col-hora" onscroll="window.detectarScroll('h')" onwheel="window.rolarTime(event, 'h')">${horasHTML}</div>
          <div class="time-separator">:</div>
          <div class="time-col" id="col-min" onscroll="window.detectarScroll('m')" onwheel="window.rolarTime(event, 'm')">${minHTML}</div>
        </div>
      </div>
    </div>
    <div style="display:flex; gap:10px;">
      <button style="flex:1; background:var(--tomado); color:black;" onclick="window.validarHorario(${id})">Salvar</button>
      <button style="flex:1;" onclick="window.fecharModal()">Voltar</button>
    </div>
  `;
  modal.classList.add("show");

  setTimeout(() => {
      window.selecionarLista('h', hInicial);
      window.selecionarLista('m', mInicial);
  }, 50);
};

window.handleTimeInput = function(e) {
    if (e.key === "Enter") {
        const id = parseInt(e.target.dataset.id);
        window.validarHorario(id);
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
    window.atualizarSelecaoVisual('h', h);
    if (raw.length >= 2) window.atualizarSelecaoVisual('m', m);
};

window.selecionarLista = function(tipo, valor, isScroll = false) {
    const input = document.getElementById('time-input');
    let h = input.value.split(":")[0];
    let m = input.value.split(":")[1];

    if (tipo === 'h') h = valor;
    if (tipo === 'm') m = valor;

    input.value = `${h}:${m}`;
    input.dataset.raw = h + m; 

    window.atualizarSelecaoVisual(tipo, valor, isScroll);
};

window.atualizarSelecaoVisual = function(tipo, valor, isScroll = false) {
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
};

window.validarHorario = function(id) {
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
        <button style="flex:1; background:var(--tomado); color:black;" onclick="window.salvarConfiguracao(${id}, '${h}', '${m}', true)">Sim</button>
        <button style="flex:1;" onclick="window.abrirConfiguracao(${id})">Corrigir</button>
      </div>
    `;
  } else {
    window.salvarConfiguracao(id, h, m, false);
  }
};

window.abrirHistorico = function() {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  let html = historico.map(h => `
    <div style="border-bottom: 1px solid #444; padding: 8px 0; font-size: 12px;">
      <span style="color:var(--aguardando)">[${h.hora}]</span> <strong>C${h.comp}:</strong> ${h.msg}
    </div>`).join("");
  content.innerHTML = `<h2>Log de Atividades</h2><div style="max-height: 300px; overflow-y: auto;">${historico.length ? html : "Nenhum registro encontrado."}</div><button style="width:100%; margin-top:10px;" onclick="window.fecharModal()">Fechar</button>`;
  modal.classList.add("show");
};

window.fecharModal = function() { document.getElementById("modal").classList.remove("show"); };

window.resetarApi = function() {
    alert("O link da API agora está configurado diretamente no código-fonte!");
};