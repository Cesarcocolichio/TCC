// notificacoes.js

const SistemaNotificacoes = {
    // 1. Pede permissão ao usuário
    solicitarPermissao: async function() {
        if (!("Notification" in window)) {
            console.log("Este navegador não suporta notificações de sistema.");
            return false;
        }
        
        if (Notification.permission === "granted") {
            return true;
        }
        
        if (Notification.permission !== "denied") {
            const permissao = await Notification.requestPermission();
            return permissao === "granted";
        }
        
        return false;
    },

    // 2. Envia a notificação usando o Service Worker (Ideal para PWA/Mobile)
    enviar: async function(titulo, mensagem) {
        if (Notification.permission === "granted") {
            if ('serviceWorker' in navigator) {
                const sw = await navigator.serviceWorker.ready;
                sw.showNotification(titulo, {
                    body: mensagem,
                    icon: 'icon-192.png', // Usa o ícone do seu PWA
                    badge: 'icon-192.png',
                    vibrate: [200, 100, 200, 100, 200, 100, 200], // Padrão de vibração
                    tag: 'monitor-medicamento', // Evita flood: atualiza a notificação se já existir uma
                    requireInteraction: true // Faz a notificação ficar na tela até a pessoa clicar (ótimo para remédios)
                });
            } else {
                // Fallback caso o SW não esteja pronto
                new Notification(titulo, { body: mensagem, icon: 'icon-192.png' });
            }
        }
    }
};

// Solicita a permissão logo que esse script for carregado
window.addEventListener('load', () => {
    SistemaNotificacoes.solicitarPermissao();
});