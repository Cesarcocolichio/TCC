// notifications.js

const NotificationManager = {
    // 1. Pede permissão ao usuário
    requestPermission: async function() {
        if (!("Notification" in window)) {
            console.log("Este navegador não suporta notificações de sistema.");
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

    // 2. Envia a notificação
    send: async function(title, message) {
        if (Notification.permission === "granted") {
            if ('serviceWorker' in navigator) {
                try {
                    const sw = await navigator.serviceWorker.ready;
                    await sw.showNotification(title, {
                        body: message,
                        icon: 'icon-192.png',
                        badge: 'icon-192.png',
                        vibrate: [200, 100, 200, 100, 200],
                        tag: 'med-alert', // tag curta
                        requireInteraction: true 
                    });
                } catch (e) {
                    console.error("Erro no Service Worker da notificação:", e);
                    // Fallback
                    new Notification(title, { body: message, icon: 'icon-192.png' });
                }
            } else {
                new Notification(title, { body: message, icon: 'icon-192.png' });
            }
        } else {
            console.log("Permissão de notificação negada.");
        }
    }
};

// Pede permissão assim que a tela abre
window.addEventListener('load', () => {
    NotificationManager.requestPermission();
});