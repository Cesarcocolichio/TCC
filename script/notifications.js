// js/notifications.js

const NotificationManager = {
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

    send: async function(titulo, mensagem, idCompartimento, tipo) {
        // Caminho do ícone ajustado para subir um nível (saindo da pasta js/)
        const iconPath = '../icon-192.png'; 

        if (Notification.permission === "granted") {
            if ('serviceWorker' in navigator) {
                try {
                    const sw = await navigator.serviceWorker.ready;
                    
                    const tagUnica = `comp${idCompartimento}-${tipo}`;

                    await sw.showNotification(titulo, {
                        body: mensagem,
                        icon: iconPath,
                        badge: iconPath,
                        vibrate: [200, 100, 200, 100, 200],
                        tag: tagUnica, 
                        requireInteraction: true 
                    });
                } catch (e) {
                    console.error("Erro ao disparar notificação:", e);
                    new Notification(titulo, { body: mensagem, icon: iconPath });
                }
            } else {
                new Notification(titulo, { body: mensagem, icon: iconPath });
            }
        }
    }
};

window.addEventListener('load', () => {
    NotificationManager.requestPermission();
});

window.NotificationManager = NotificationManager;