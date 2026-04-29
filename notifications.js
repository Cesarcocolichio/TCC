// notifications.js

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
        if (Notification.permission === "granted") {
            if ('serviceWorker' in navigator) {
                try {
                    const sw = await navigator.serviceWorker.ready;
                    
                    // A tag agora usa o 'tipo' que já contém o timestamp vindo do script.js
                    // Isso garante que cada notificação seja tratada como um evento novo
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
                new Notification(titulo, { body: mensagem, icon: 'icon-192.png' });
            }
        }
    }
};

window.addEventListener('load', () => {
    NotificationManager.requestPermission();
});