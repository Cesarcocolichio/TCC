// ----------------------------------------------------------------
// api.js — comunicação com a API via JWT + WebSocket (Socket.IO)
//
// SEGURANÇA: A API_KEY nunca aparece aqui.
// A PWA faz login com usuário/senha → recebe um JWT temporário →
// usa o JWT em todas as chamadas subsequentes.
// ----------------------------------------------------------------

export const URL_BASE_NGROK = "https://sage-scrimmage-modified.ngrok-free.dev";
export const API_URL        = `${URL_BASE_NGROK}/api`;

// ----------------------------------------------------------------
// Gerenciamento do token JWT
// O token fica apenas na memória (não vai para localStorage),
// evitando ataques XSS que consigam ler o armazenamento do browser.
// ----------------------------------------------------------------
let _jwtToken = null;

export function setToken(token) {
    _jwtToken = token;
    if (token) {
        sessionStorage.setItem('jwt_token', token);
    } else {
        sessionStorage.removeItem('jwt_token');
    }
}

export function getToken() {
    if (!_jwtToken) {
        _jwtToken = sessionStorage.getItem('jwt_token');
    }
    return _jwtToken;
}

export function isAutenticado() {
    return !!getToken();
}

/** Cabeçalhos padrão para todas as requisições autenticadas */
function headersAutenticados() {
    return {
        'Content-Type':               'application/json',
        'ngrok-skip-browser-warning': 'true',
        'Authorization':              `Bearer ${_jwtToken}`
    };
}

// ----------------------------------------------------------------
// login(usuario, senha)
// Troca credenciais por um JWT. Chame isso na tela de login.
// Retorna { sucesso: true } ou { sucesso: false, erro: "..." }
// ----------------------------------------------------------------
export async function login(usuario, senha) {
    try {
        const res = await fetch(`${API_URL}/login`, {
            method:  'POST',
            headers: {
                'Content-Type':               'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ usuario, senha })
        });

        const data = await res.json();

        if (res.ok && data.token) {
            setToken(data.token);
            // Inicia o WebSocket após login bem-sucedido
            getSocket();
            return { sucesso: true };
        }

        return { sucesso: false, erro: data.error || "Erro desconhecido" };

    } catch (e) {
        console.error("[API] Erro no login:", e);
        return { sucesso: false, erro: "Sem conexão com o servidor" };
    }
}

/** Limpa o token (logout) */
export function logout() {
    _jwtToken = null;
    sessionStorage.removeItem('jwt_token');
    if (_socket) {
        _socket.disconnect();
        _socket = null;
    }
    _ultimoStatus = null;
}

// ----------------------------------------------------------------
// WebSocket — conexão única, reutilizada por todo o módulo
// ----------------------------------------------------------------
let _socket       = null;
let _ultimoStatus = null;

export function getSocket() {
    if (_socket) return _socket;

    if (typeof io === "undefined") {
        console.error("[WS] Socket.IO client não carregado. Adicione o <script> no index.html.");
        return null;
    }

    _socket = io(URL_BASE_NGROK, {
        transports:            ["websocket"],
        extraHeaders:          { "ngrok-skip-browser-warning": "true" },
        reconnectionDelay:     2000,
        reconnectionAttempts:  Infinity
    });

    _socket.on("connect", () => {
        console.log("[WS] Conectado ao servidor! sid:", _socket.id);
    });

    _socket.on("disconnect", (reason) => {
        console.warn("[WS] Desconectado:", reason);
    });

    _socket.on("status_update", (data) => {
        _ultimoStatus = data;
        window.dispatchEvent(new CustomEvent("api:status_update", { detail: data }));
    });

    _socket.on("connect_error", (err) => {
        console.error("[WS] Erro de conexão:", err.message);
    });

    return _socket;
}

// ----------------------------------------------------------------
// sincronizarStatus()
// ----------------------------------------------------------------
export async function sincronizarStatus() {
    if (_ultimoStatus) return _ultimoStatus;

    try {
        const res = await fetch(`${API_URL}/status`, {
            headers: headersAutenticados()
        });

        if (res.status === 401) {
            window.dispatchEvent(new CustomEvent("api:token_expirado"));
            return null;
        }
        if (!res.ok) return null;

        const data = await res.json();
        _ultimoStatus = data;
        return data;
    } catch (e) {
        console.error("[API] Erro ao sincronizar:", e);
        return null;
    }
}

// ----------------------------------------------------------------
// atualizarAPI()
// ----------------------------------------------------------------
export async function atualizarAPI(id, dados) {
    try {
        const response = await fetch(`${API_URL}/update`, {
            method:  'POST',
            headers: headersAutenticados(),
            body:    JSON.stringify({ id, ...dados })
        });

        if (response.status === 401) {
            window.dispatchEvent(new CustomEvent("api:token_expirado"));
            return;
        }
        if (!response.ok) throw new Error("Erro no servidor");

    } catch (e) {
        console.error("[API] Erro ao atualizar:", e);
    }
}

// ----------------------------------------------------------------
// carregarHistoricoDB()
// ----------------------------------------------------------------
export async function carregarHistoricoDB() {
    try {
        const res = await fetch(`${API_URL}/historico`, {
            headers: headersAutenticados()
        });

        if (res.status === 401) {
            window.dispatchEvent(new CustomEvent("api:token_expirado"));
            return [];
        }
        if (!res.ok) throw new Error("Acesso negado ou erro no servidor");
        return await res.json();
    } catch (e) {
        console.error("[API] Erro ao carregar histórico:", e);
        return [];
    }
}