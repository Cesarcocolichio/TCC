import { TOLERANCIA_MINUTOS, compartimentos, historico, setHistorico, addAoHistorico } from './state.js';
import { carregarHistoricoDB, sincronizarStatus, atualizarAPI, login, isAutenticado, getSocket } from './api.js';
import { render } from './ui.js';

// Trava para evitar loops de processamento e spam de logs
const processandoUpdate = new Set();

// ----------------------------------------------------------------
// Login — roda antes de qualquer coisa
// ----------------------------------------------------------------
window.onload = async () => {
    const btnLogin    = document.getElementById('btn-login');
    const inputUser   = document.getElementById('login-usuario');
    const inputSenha  = document.getElementById('login-senha');
    const erroEl      = document.getElementById('login-erro');
    const telaLogin   = document.getElementById('tela-login');
    const telaPrinc   = document.getElementById('tela-principal');

    // ── Restaurar sessão automaticamente após F5 ──────────────────
    if (isAutenticado()) {
        // Token ainda vivo na sessionStorage — reativa o WebSocket e vai direto
        getSocket();
        telaLogin.classList.add('oculto');
        telaPrinc.style.display = '';
        iniciarApp();
        return; // pula todo o setup de login
    }
    // ─────────────────────────────────────────────────────────────

    async function tentarLogin() {
        const usuario = inputUser.value.trim();
        const senha   = inputSenha.value;
        if (!usuario || !senha) { erroEl.textContent = 'Preencha usuário e senha.'; return; }

        btnLogin.disabled    = true;
        btnLogin.textContent = 'Entrando...';
        erroEl.textContent   = '';

        const resultado = await login(usuario, senha);

        if (resultado.sucesso) {
            telaLogin.classList.add('oculto');
            telaPrinc.style.display = '';
            iniciarApp();
        } else {
            erroEl.textContent   = resultado.erro || 'Usuário ou senha incorretos.';
            btnLogin.disabled    = false;
            btnLogin.textContent = 'Entrar';
        }
    }

    btnLogin.addEventListener('click', tentarLogin);

    // Permite pressionar Enter para logar
    inputSenha.addEventListener('keydown', e => { if (e.key === 'Enter') tentarLogin(); });
    inputUser.addEventListener('keydown',  e => { if (e.key === 'Enter') inputSenha.focus(); });

    // Se o token expirar durante o uso, volta para o login
    window.addEventListener('api:token_expirado', () => {
        telaPrinc.style.display = 'none';
        telaLogin.classList.remove('oculto');
        erroEl.textContent = 'Sessão expirada. Faça login novamente.';
        inputSenha.value  = '';
        btnLogin.disabled    = false;
        btnLogin.textContent = 'Entrar';
    });
};

// ----------------------------------------------------------------
// Inicialização do app (só roda após login bem-sucedido)
// ----------------------------------------------------------------
async function iniciarApp() {
    const dbHistorico = await carregarHistoricoDB();
    setHistorico(dbHistorico);
    await sincronizarComAPI();

    window.addEventListener("api:status_update", async (event) => {
        await sincronizarComAPI(event.detail);
    });

    setInterval(tick, 1000);
}

async function tick() {
    const agora = new Date();
    const relogio = document.getElementById('relogio-digital');
    if (relogio) relogio.innerText = agora.toLocaleTimeString('pt-BR');
    await verificarAlertas(agora);
}

async function sincronizarComAPI(dadosRemotos = null) {
    try {
        if (!dadosRemotos) dadosRemotos = await sincronizarStatus();
        if (!dadosRemotos) return;

        for (const c of compartimentos) {
            // Se a gaveta estiver travada (processando alerta), ignoramos a atualização dela via socket
            if (processandoUpdate.has(c.id)) continue;

            const remoto = dadosRemotos[c.id];
            if (!remoto) continue;

            c.sensor_aberto = remoto.sensor_aberto;
            c.horario       = remoto.horario;
            c.dataAlvo      = remoto.dataAlvo;
            c.ativo         = (remoto.estado !== "sem_config");

            const abriu = (remoto.sensor_aberto === true || remoto.evento_pendente === true);

            if (abriu) {
                const estadosDeAlerta = ['em_alerta', 'problema', 'aguardando'];
                if (estadosDeAlerta.includes(remoto.estado)) {
                    let novoEstado = "";
                    let msgClinica = "";

                    if (remoto.estado === "em_alerta") { novoEstado = "tomado"; msgClinica = "✅ Aberto no horário."; }
                    else if (remoto.estado === "problema") { novoEstado = "tomado_atrasado"; msgClinica = "⚠️ Aberto com atraso."; }
                    else if (remoto.estado === "aguardando") { novoEstado = "tomado_antecipado"; msgClinica = "ℹ️ Aberto antes da hora."; }

                    if (novoEstado && remoto.estado !== novoEstado) {
                        processandoUpdate.add(c.id);
                        c.estado = novoEstado; 
                        render(); // Renderiza na hora para feedback visual
                        
                        registrarLogLocal(c.id, msgClinica);
                        await atualizarAPI(c.id, { estado: novoEstado, led: false, log: msgClinica });
                        
                        setTimeout(() => processandoUpdate.delete(c.id), 2000);
                        NotificationManager.send(`C${c.id} Aberto`, msgClinica, c.id, `notif-${Date.now()}`);
                    }
                }
            } else {
                c.estado = remoto.estado;
            }
        }
        render();
    } catch (e) {
        console.error("Erro na sincronização:", e);
    }
}

async function verificarAlertas(agora) {
    for (const c of compartimentos) {
        // Se já estamos atualizando essa gaveta, pula para não duplicar log
        if (!c.ativo || !c.dataAlvo || processandoUpdate.has(c.id)) continue;
        if (c.estado !== "aguardando" && c.estado !== "em_alerta") continue;

        const dataAlvoObj = new Date(c.dataAlvo);
        const dataLimite  = new Date(dataAlvoObj.getTime() + (TOLERANCIA_MINUTOS * 60000));

        if (agora >= dataAlvoObj && agora < dataLimite && c.estado === "aguardando") {
            const msg = "🔔 Hora do medicamento!";
            processandoUpdate.add(c.id);
            c.estado = "em_alerta"; 
            render();

            registrarLogLocal(c.id, msg);
            await atualizarAPI(c.id, { estado: "em_alerta", led: true, log: msg });
            setTimeout(() => processandoUpdate.delete(c.id), 2000);
        } 
        else if (agora >= dataLimite && c.estado !== "problema") {
            const msg = "🔥 ATRASO CRÍTICO detectado.";
            processandoUpdate.add(c.id);
            c.estado = "problema"; 
            render();

            registrarLogLocal(c.id, msg);
            await atualizarAPI(c.id, { estado: "problema", led: true, log: msg });
            setTimeout(() => processandoUpdate.delete(c.id), 2000);
        }
    }
}

function registrarLogLocal(id, msg) {
    if (!msg) return; 
    const agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!historico.length || (historico[0].msg !== msg || historico[0].comp !== id)) {
        addAoHistorico({ comp: id, msg: msg, hora: agora });
    }
}

window.salvarConfiguracao = async function(id, h, m, paraAmanha) {
    const comp = compartimentos.find(x => x.id === id);
    const dataAlvo = new Date();
    dataAlvo.setHours(parseInt(h), parseInt(m), 0, 0);
    if (paraAmanha) dataAlvo.setDate(dataAlvo.getDate() + 1);

    comp.horario = `${h}:${m}`;
    comp.dataAlvo = dataAlvo.getTime();
    comp.estado  = "aguardando";
    comp.ativo   = true;

    const msgLog = `Agendado para ${comp.horario}.`;
    processandoUpdate.add(id); 
    registrarLogLocal(id, msgLog);
    
    await atualizarAPI(id, { estado: "aguardando", horario: comp.horario, dataAlvo: comp.dataAlvo, led: false, log: msgLog });
    
    setTimeout(() => processandoUpdate.delete(id), 1500);
    window.fecharModal();
    render();
};

window.desativar = function(id) {
    const comp = compartimentos.find(x => x.id === id);
    comp.ativo = false; comp.estado = "sem_config";
    atualizarAPI(id, { estado: "sem_config", horario: null, dataAlvo: null, led: false });
    render();
};

window.reabastecer = function(id) {
    const comp = compartimentos.find(x => x.id === id);
    comp.ativo = false; comp.estado = "sem_config";
    atualizarAPI(id, { estado: "sem_config", horario: null, dataAlvo: null, led: false });
    render();
};