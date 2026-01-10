const { spawn } = require("child_process");

console.log("🚀 Démarrage du système pour déploiement externe...");

function startProcess(name, command, args) {
    const proc = spawn(command, args, { stdio: "inherit", shell: true });
    proc.on("close", (code) => {
        console.log(`[${name}] Arrêté avec le code ${code}. Redémarrage...`);
        // Petite pause avant de redémarrer pour éviter de boucler à l'infini en cas d'erreur fatale
        setTimeout(() => startProcess(name, command, args), 1000);
    });
    return proc;
}

// Lancer le serveur Web et le Bot Telegram
startProcess("Serveur Web", "node", ["app.js"]);
startProcess("Bot Telegram", "node", ["telegrambot.js"]);
