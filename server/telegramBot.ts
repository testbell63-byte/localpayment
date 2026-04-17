import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';

// Environment variables (injected by Railway or .env)
const REPORT_GROUP_ID = process.env.REPORT_GROUP_ID || '';
const CASHOUT_GROUP_ID = process.env.CASHOUT_GROUP_ID || '';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0'); // Your Telegram user ID

// Paths for CSV storage
const CSV_PATH = path.join(process.cwd(), 'records.csv');
const CASHOUT_CSV_PATH = path.join(process.cwd(), 'cashout_records.csv');

// ============================================
// UPDATED GAME LIST (Change #1)
// ============================================
const GAME_LIST = [
    "Juwa",
    "Game Vault",
    "Firekirin",
    "Milkyway",
    "OrionStars",
    "Vblink",
    "PandaMasters",
    "UltraPanda",
    "Vegas",
    "Fun-Station",
    "Gameroom",
    "Cashmachine",
    "Mr All in One",
    "Monster",
    "Others"
];

// ============================================
// TYPES
// ============================================
interface CashInState {
    photoFileId?: string;
    games?: { name: string; amount: number; points: number }[];
    currentGameIndex?: number;
}

interface CashoutState {
    game?: string;
    points?: number;
    playback?: number;           // Optional, default 0
    tip?: number;                // Optional, default 0
    amount?: number;
    paymentDetails?: string;
    pendingApproval?: boolean;   // True until admin approves
    pendingMessageId?: number;   // For editing/removing
}

interface UserState {
    step?: string;
    cashin?: CashInState;
    cashout?: CashoutState;
}

const userState = new Map<number, UserState>();

// ============================================
// HELPER: Game Selection Keyboard
// ============================================
function buildGameSelectionKeyboard(selected: string[] = []): TelegramBot.InlineKeyboardButton[][] {
    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    for (let i = 0; i < GAME_LIST.length; i += 2) {
        const row: TelegramBot.InlineKeyboardButton[] = [];
        const game1 = GAME_LIST[i];
        const game2 = GAME_LIST[i + 1];
        const isSelected1 = selected.includes(game1);
        row.push({
            text: `${isSelected1 ? '✅' : '⬜'} ${game1}`,
            callback_data: `select_game_${game1}`
        });
        if (game2) {
            const isSelected2 = selected.includes(game2);
            row.push({
                text: `${isSelected2 ? '✅' : '⬜'} ${game2}`,
                callback_data: `select_game_${game2}`
            });
        }
        keyboard.push(row);
    }
    keyboard.push([{ text: '✅ Done', callback_data: 'games_done' }]);
    return keyboard;
}

// ============================================
// HELPER: Numpad Keyboard
// ============================================
function buildNumpad(current: string = '0'): TelegramBot.InlineKeyboardButton[][] {
    return [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['.', '0', '⌫'],
        [`✅ Done (${current})`]
    ].map(row => row.map(key => ({
        text: key,
        callback_data: key.startsWith('✅') ? 'numpad_done' : `numpad_${key}`
    })));
}

// ============================================
// EXPORTED INIT FUNCTION
// ============================================
export function initTelegramBot(token: string, baseUrl?: string): TelegramBot {
    const bot = baseUrl
        ? new TelegramBot(token, { webHook: { port: 8080 } })
        : new TelegramBot(token, { polling: true });

    if (baseUrl) {
        bot.setWebHook(`${baseUrl}/bot${token}`);
        console.log(`Webhook set to ${baseUrl}/bot${token}`);
    }

    // ============================================
    // REMOVED /start COMMAND (Change #4)
    // ============================================
    // Set only /cashin and /cashout in command menu
    bot.setMyCommands([
        { command: 'cashin', description: '📥 Record a cash in' },
        { command: 'cashout', description: '📤 Request a cashout' }
    ]);

    // ============================================
    // CASH-IN FLOW (triggered by photo)
    // ============================================
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const photo = msg.photo[msg.photo.length - 1];
        userState.set(chatId, {
            step: 'cashin_games',
            cashin: { photoFileId: photo.file_id, games: [] }
        });
        await bot.sendMessage(chatId, '🎮 Select games for this transaction:', {
            reply_markup: { inline_keyboard: buildGameSelectionKeyboard() }
        });
    });

    // ============================================
    // /cashin COMMAND (alternative)
    // ============================================
    bot.onText(/\/cashin/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId, '📸 Please send a photo of the transaction.');
    });

    // ============================================
    // /cashout COMMAND (Change #2 & #3)
    // ============================================
    bot.onText(/\/cashout/, (msg) => {
        const chatId = msg.chat.id;
        userState.set(chatId, {
            step: 'cashout_game',
            cashout: {}
        });
        bot.sendMessage(chatId, '🎮 Select game for cashout:', {
            reply_markup: {
                inline_keyboard: GAME_LIST.map(game => [{
                    text: game,
                    callback_data: `cashout_game_${game}`
                }])
            }
        });
    });

    // ============================================
    // CALLBACK QUERY HANDLER
    // ============================================
    bot.on('callback_query', async (query) => {
        const chatId = query.message?.chat.id;
        if (!chatId) return;
        const data = query.data;
        const state = userState.get(chatId);
        if (!state) return;
        await bot.answerCallbackQuery(query.id);

        // ----- CASH-IN GAME SELECTION -----
        if (state.step === 'cashin_games') {
            if (data?.startsWith('select_game_')) {
                const game = data.replace('select_game_', '');
                const cashin = state.cashin!;
                if (game === 'Others') {
                    state.step = 'cashin_custom_game';
                    await bot.sendMessage(chatId, '✏️ Type custom game name:');
                    userState.set(chatId, state);
                    return;
                }
                const existing = cashin.games!.findIndex(g => g.name === game);
                if (existing >= 0) {
                    cashin.games!.splice(existing, 1);
                } else {
                    cashin.games!.push({ name: game, amount: 0, points: 0 });
                }
                const selectedNames = cashin.games!.map(g => g.name);
                await bot.editMessageReplyMarkup(
                    { inline_keyboard: buildGameSelectionKeyboard(selectedNames) },
                    { chat_id: chatId, message_id: query.message!.message_id }
                );
                userState.set(chatId, state);
            } else if (data === 'games_done') {
                const cashin = state.cashin!;
                if (!cashin.games?.length) {
                    await bot.sendMessage(chatId, '⚠️ Select at least one game.');
                    return;
                }
                cashin.currentGameIndex = 0;
                state.step = 'cashin_amount';
                const game = cashin.games[0].name;
                await bot.sendMessage(chatId, `💰 Enter amount for ${game}:`, {
                    reply_markup: { inline_keyboard: buildNumpad() }
                });
                userState.set(chatId, state);
            }
        }

        // ----- CASH-IN NUMPAD -----
        if (state.step === 'cashin_amount' || state.step === 'cashin_points') {
            const cashin = state.cashin!;
            const currentGame = cashin.games![cashin.currentGameIndex!];
            const isAmount = state.step === 'cashin_amount';
            const currentValue = isAmount
                ? currentGame.amount.toString()
                : currentGame.points.toString();

            if (data?.startsWith('numpad_')) {
                const key = data.replace('numpad_', '');
                let newVal = currentValue;
                if (key === '⌫') newVal = currentValue.slice(0, -1) || '0';
                else if (key === '.' && !currentValue.includes('.')) newVal += '.';
                else if (key !== '.') newVal = (currentValue === '0' ? key : currentValue + key);
                if (isAmount) currentGame.amount = parseFloat(newVal) || 0;
                else currentGame.points = parseFloat(newVal) || 0;
                await bot.editMessageReplyMarkup(
                    { inline_keyboard: buildNumpad(newVal) },
                    { chat_id: chatId, message_id: query.message!.message_id }
                );
                userState.set(chatId, state);
            } else if (data === 'numpad_done') {
                if (isAmount) {
                    state.step = 'cashin_points';
                    await bot.editMessageText(`🎯 Enter points for ${currentGame.name}:`, {
                        chat_id: chatId,
                        message_id: query.message!.message_id,
                        reply_markup: { inline_keyboard: buildNumpad() }
                    });
                } else {
                    const next = (cashin.currentGameIndex! + 1);
                    if (next < cashin.games!.length) {
                        cashin.currentGameIndex = next;
                        state.step = 'cashin_amount';
                        await bot.editMessageText(`💰 Enter amount for ${cashin.games![next].name}:`, {
                            chat_id: chatId,
                            message_id: query.message!.message_id,
                            reply_markup: { inline_keyboard: buildNumpad() }
                        });
                    } else {
                        // All games done – save cash-in
                        await saveCashIn(bot, chatId, state.cashin!, msg.from!);
                        userState.delete(chatId);
                    }
                }
                userState.set(chatId, state);
            }
        }

        // ----- CASHOUT GAME SELECTION -----
        if (state.step === 'cashout_game' && data?.startsWith('cashout_game_')) {
            const game = data.replace('cashout_game_', '');
            if (game === 'Others') {
                state.step = 'cashout_custom_game';
                await bot.sendMessage(chatId, '✏️ Type custom game name:');
            } else {
                state.cashout!.game = game;
                state.step = 'cashout_points';
                await bot.sendMessage(chatId, `🎯 Enter points redeemed for ${game}:`);
            }
            userState.set(chatId, state);
        }

        // ----- CASHOUT PLAYBACK & TIP CONFIRMATIONS (Change #2) -----
        if (data === 'cashout_playback_yes') {
            state.step = 'cashout_playback_amount';
            await bot.sendMessage(chatId, '💰 Enter playback amount:');
            userState.set(chatId, state);
        }
        if (data === 'cashout_playback_no') {
            state.cashout!.playback = 0;
            state.step = 'cashout_tip_confirm';
            await bot.sendMessage(chatId, '💸 Add a tip?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes', callback_data: 'cashout_tip_yes' }],
                        [{ text: '❌ No', callback_data: 'cashout_tip_no' }]
                    ]
                }
            });
            userState.set(chatId, state);
        }
        if (data === 'cashout_tip_yes') {
            state.step = 'cashout_tip_amount';
            await bot.sendMessage(chatId, '💵 Enter tip amount:');
            userState.set(chatId, state);
        }
        if (data === 'cashout_tip_no') {
            state.cashout!.tip = 0;
            state.step = 'cashout_amount';
            await bot.sendMessage(chatId, '💲 Enter cashout amount:');
            userState.set(chatId, state);
        }

        // ----- CASHOUT APPROVAL (Change #3) -----
        if (data?.startsWith('approve_cashout_')) {
            const userId = data.replace('approve_cashout_', '');
            const userStateData = userState.get(parseInt(userId));
            if (userStateData?.cashout?.pendingApproval) {
                const cashout = userStateData.cashout;
                // Save to CSV
                const csvLine = `"${new Date().toISOString()}","${userId}","${cashout.game}",${cashout.points},${cashout.playback || 0},${cashout.tip || 0},${cashout.amount},"${cashout.paymentDetails}",approved\n`;
                if (!fs.existsSync(CASHOUT_CSV_PATH)) {
                    fs.writeFileSync(CASHOUT_CSV_PATH, 'Date,User,Game,Points,Playback,Tip,Amount,Details,Status\n');
                }
                fs.appendFileSync(CASHOUT_CSV_PATH, csvLine);

                // Notify user
                await bot.sendMessage(userId, '✅ Your cashout request has been approved!');

                // Forward to reporting group (Change #3)
                const reportMsg = `✅ *Cashout Approved*\n👤 User: ${userId}\n🎮 ${cashout.game}\n🎯 Points: ${cashout.points}\n🔁 Playback: ${cashout.playback || 0}\n💸 Tip: ${cashout.tip || 0}\n💰 Amount: $${cashout.amount}\n📝 ${cashout.paymentDetails}`;
                if (REPORT_GROUP_ID) {
                    await bot.sendMessage(REPORT_GROUP_ID, reportMsg, { parse_mode: 'Markdown' });
                }

                // Remove buttons from approval message
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: query.message!.message_id
                });

                // Clear pending state
                delete userStateData.cashout.pendingApproval;
                userState.set(parseInt(userId), userStateData);
            }
        }

        if (data?.startsWith('deny_cashout_')) {
            const userId = data.replace('deny_cashout_', '');
            await bot.sendMessage(userId, '❌ Your cashout request was denied.');
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: query.message!.message_id
            });
            const userStateData = userState.get(parseInt(userId));
            if (userStateData) {
                userStateData.cashout!.pendingApproval = false;
                userState.set(parseInt(userId), userStateData);
            }
        }
    });

    // ============================================
    // MESSAGE HANDLER (text inputs)
    // ============================================
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text) return;
        const state = userState.get(chatId);
        if (!state) return;

        // ----- CASH-IN CUSTOM GAME -----
        if (state.step === 'cashin_custom_game') {
            const customGame = text.trim();
            state.cashin!.games!.push({ name: customGame, amount: 0, points: 0 });
            state.step = 'cashin_games';
            await bot.sendMessage(chatId, '➕ Game added. Select more or press Done:', {
                reply_markup: { inline_keyboard: buildGameSelectionKeyboard(state.cashin!.games!.map(g => g.name)) }
            });
            userState.set(chatId, state);
            return;
        }

        // ----- CASHOUT CUSTOM GAME -----
        if (state.step === 'cashout_custom_game') {
            state.cashout!.game = text.trim();
            state.step = 'cashout_points';
            await bot.sendMessage(chatId, `🎯 Enter points redeemed for ${state.cashout!.game}:`);
            userState.set(chatId, state);
            return;
        }

        // ----- CASHOUT POINTS -----
        if (state.step === 'cashout_points') {
            const points = parseFloat(text);
            if (isNaN(points)) {
                await bot.sendMessage(chatId, '❌ Invalid number. Try again:');
                return;
            }
            state.cashout!.points = points;
            state.step = 'cashout_playback_confirm';
            await bot.sendMessage(chatId, '🎮 Do you have playback?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes', callback_data: 'cashout_playback_yes' }],
                        [{ text: '❌ No', callback_data: 'cashout_playback_no' }]
                    ]
                }
            });
            userState.set(chatId, state);
            return;
        }

        // ----- CASHOUT PLAYBACK AMOUNT -----
        if (state.step === 'cashout_playback_amount') {
            const playback = parseFloat(text);
            if (isNaN(playback)) {
                await bot.sendMessage(chatId, '❌ Invalid number. Enter playback amount:');
                return;
            }
            state.cashout!.playback = playback;
            state.step = 'cashout_tip_confirm';
            await bot.sendMessage(chatId, '💸 Add a tip?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes', callback_data: 'cashout_tip_yes' }],
                        [{ text: '❌ No', callback_data: 'cashout_tip_no' }]
                    ]
                }
            });
            userState.set(chatId, state);
            return;
        }

        // ----- CASHOUT TIP AMOUNT -----
        if (state.step === 'cashout_tip_amount') {
            const tip = parseFloat(text);
            if (isNaN(tip)) {
                await bot.sendMessage(chatId, '❌ Invalid number. Enter tip amount:');
                return;
            }
            state.cashout!.tip = tip;
            state.step = 'cashout_amount';
            await bot.sendMessage(chatId, '💲 Enter cashout amount:');
            userState.set(chatId, state);
            return;
        }

        // ----- CASHOUT AMOUNT -----
        if (state.step === 'cashout_amount') {
            const amount = parseFloat(text);
            if (isNaN(amount)) {
                await bot.sendMessage(chatId, '❌ Invalid number. Enter cashout amount:');
                return;
            }
            state.cashout!.amount = amount;
            state.step = 'cashout_details';
            await bot.sendMessage(chatId, '📝 Enter payment details (e.g., PayPal, Zelle):');
            userState.set(chatId, state);
            return;
        }

        // ----- CASHOUT DETAILS (SUBMIT) -----
        if (state.step === 'cashout_details') {
            state.cashout!.paymentDetails = text;
            const cashout = state.cashout!;

            // Build message
            const cashoutMsg = `📤 *New Cashout Request*\n` +
                `👤 ${msg.from!.first_name} (@${msg.from!.username})\n` +
                `🎮 ${cashout.game}\n` +
                `🎯 Points: ${cashout.points}\n` +
                `🔁 Playback: ${cashout.playback || 0}\n` +
                `💸 Tip: ${cashout.tip || 0}\n` +
                `💰 Amount: $${cashout.amount}\n` +
                `📝 ${cashout.paymentDetails}`;

            // Send to cashout group with approve/deny buttons
            let sentMsg;
            if (CASHOUT_GROUP_ID) {
                sentMsg = await bot.sendMessage(CASHOUT_GROUP_ID, cashoutMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Approve', callback_data: `approve_cashout_${chatId}` },
                            { text: '❌ Deny', callback_data: `deny_cashout_${chatId}` }
                        ]]
                    }
                });
            }

            // Mark as pending approval
            cashout.pendingApproval = true;
            cashout.pendingMessageId = sentMsg?.message_id;
            userState.set(chatId, state);

            await bot.sendMessage(chatId, '✅ Your cashout request has been sent for approval. You can /editcashout or /cancelcashout until approved.');
            return;
        }
    });

    // ============================================
    // EDIT/CANCEL PENDING CASHOUT (optional)
    // ============================================
    bot.onText(/\/editcashout/, (msg) => {
        const chatId = msg.chat.id;
        const state = userState.get(chatId);
        if (state?.cashout?.pendingApproval) {
            state.step = 'cashout_game';
            bot.sendMessage(chatId, '🔄 Editing cashout. Select game:', {
                reply_markup: { inline_keyboard: GAME_LIST.map(g => [{ text: g, callback_data: `cashout_game_${g}` }]) }
            });
            userState.set(chatId, state);
        } else {
            bot.sendMessage(chatId, 'No pending cashout to edit.');
        }
    });

    bot.onText(/\/cancelcashout/, async (msg) => {
        const chatId = msg.chat.id;
        const state = userState.get(chatId);
        if (state?.cashout?.pendingApproval) {
            if (state.cashout.pendingMessageId && CASHOUT_GROUP_ID) {
                try {
                    await bot.deleteMessage(CASHOUT_GROUP_ID, state.cashout.pendingMessageId);
                } catch (e) {}
            }
            userState.delete(chatId);
            bot.sendMessage(chatId, '❌ Cashout request cancelled.');
        } else {
            bot.sendMessage(chatId, 'No pending cashout to cancel.');
        }
    });

    console.log('🤖 Telegram bot is running...');
    return bot;
}

// ============================================
// SAVE CASH-IN (helper)
// ============================================
async function saveCashIn(bot: TelegramBot, chatId: number, cashin: CashInState, from: TelegramBot.User) {
    const username = from.username ? `@${from.username}` : from.first_name;
    let totalAmount = 0, totalPoints = 0;
    let gamesDetail = '';
    for (const g of cashin.games!) {
        totalAmount += g.amount;
        totalPoints += g.points;
        gamesDetail += `${g.name}:$${g.amount}|${g.points}pts; `;
    }
    const csvLine = `"${new Date().toISOString()}","${username}",${totalAmount},${totalPoints},"${gamesDetail}"\n`;
    if (!fs.existsSync(CSV_PATH)) {
        fs.writeFileSync(CSV_PATH, 'Date,User,TotalAmount,TotalPoints,GamesDetail\n');
    }
    fs.appendFileSync(CSV_PATH, csvLine);

    const reportMsg = `📥 *New Cash In*\n👤 ${username}\n💰 Total: $${totalAmount.toFixed(2)}\n🎯 Points: ${totalPoints}\n🎮 ${gamesDetail}`;
    if (REPORT_GROUP_ID && cashin.photoFileId) {
        await bot.sendPhoto(REPORT_GROUP_ID, cashin.photoFileId, { caption: reportMsg, parse_mode: 'Markdown' });
    } else if (REPORT_GROUP_ID) {
        await bot.sendMessage(REPORT_GROUP_ID, reportMsg, { parse_mode: 'Markdown' });
    }
    await bot.sendMessage(chatId, '✅ Cash in recorded!');
}
