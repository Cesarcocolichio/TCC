// notifications.js

const NotificationManager = {
    // 1. Pede permissão ao usuário
    requestPermission: async function() {
        if (!("Notification" in window)) {
            console.log("Navegador não suporta notificações.");
            return false;
        }
        
        if (Notification.permission === "granted") {
            return true;
        }
        
        if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            return permission === "granted";
        }
        
        return false;
    },

    // 2. Envia a notificação com ID único para não sobrepor
    // tipo pode ser: 'alerta', 'atraso' ou 'sucesso'
    send: async function(titulo, mensagem, idCompartimento, tipo) {
        if (Notification.permission === "granted") {
            if ('serviceWorker' in navigator) {
                try {
                    const sw = await navigator.serviceWorker.ready;
                    
                    // Criamos uma tag única baseada no compartimento e tipo
                    // Ex: 'comp1-alerta', 'comp2-atraso'
                    const tagUnica = `comp${idCompartimento}-${tipo}`;

                    await sw.showNotification(titulo, {
                        body: mensagem,
                        icon: 'icon-192.png',
                        badge: 'icon-192.png',
                        vibrate: [200, 100, 200, 100, 200],
                        tag: tagUnica, 
                        requireInteraction: true 
                    });
                } catch (e) {
                    console.error("Erro ao disparar notificação:", e);
                    new Notification(titulo, { body: mensagem, icon: 'icon-192.png' });
                }
            } else {
                new Notification(titulo, { body: message, icon: 'icon-192.png' });
            }
        }
    }
};

// Solicita permissão ao carregar a página
window.addEventListener('load', () => {
    NotificationManager.requestPermission();
});