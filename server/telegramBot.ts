import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';

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

// Type definitions
interface CashInState {
    step: string;
    photoFileId?: string;
    games?: { name: string; amount: number; points: number }[];
    currentGameIndex?: number;
    tempGameName?: string;
}

interface CashoutState {
    step: string;
    game?: string;
    pointsRedeemed?: number;
    playback?: number;      // optional, default 0
    tip?: number;           // optional, default 0
    cashoutAmount?: number;
    customerDetails?: string;
}

interface UserState {
    step: string;
    cashin?: CashInState;
    cashout?: CashoutState;
}

const userStates: Record<number, UserState> = {};

// CSV file paths (will be set relative to project root)
let csvFilePath: string;
let cashoutCsvPath: string;

// Group IDs (will be set from env)
let REPORTING_GROUP_ID: string;
let CASHOUT_GROUP_ID: string;

// Helper function to generate inline keyboard for game selection
function generateGameKeyboard(selectedGames: string[] = []): TelegramBot.InlineKeyboardMarkup {
    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    
    for (let i = 0; i < GAME_LIST.length; i += 2) {
        const row: TelegramBot.InlineKeyboardButton[] = [];
        const game1 = GAME_LIST[i];
        const game2 = GAME_LIST[i + 1];
        
        const isSelected1 = selectedGames.includes(game1);
        row.push({
            text: `${isSelected1 ? '✅' : '⬜'} ${game1}`,
            callback_data: `select_game_${game1}`
        });
        
        if (game2) {
            const isSelected2 = selectedGames.includes(game2);
            row.push({
                text: `${isSelected2 ? '✅' : '⬜'} ${game2}`,
                callback_data: `select_game_${game2}`
            });
        }
        keyboard.push(row);
    }
    
    keyboard.push([{ text: '✅ Done', callback_data: 'games_done' }]);
    return { inline_keyboard: keyboard };
}

// Helper function to generate numpad keyboard
function generateNumpadKeyboard(currentValue: string = ''): TelegramBot.InlineKeyboardMarkup {
    const numpad = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['.', '0', '⌫'],
        ['✅ Done']
    ];
    
    const keyboard: TelegramBot.InlineKeyboardButton[][] = numpad.map(row =>
        row.map(key => ({
            text: key === '✅ Done' ? `✅ Done (${currentValue || '0'})` : key,
            callback_data: key === '✅ Done' ? 'numpad_done' : `numpad_${key}`
        }))
    );
    
    return { inline_keyboard: keyboard };
}

// Submit cashin to reporting group
async function submitCashIn(bot: TelegramBot, chatId: number, cashin: CashInState) {
    const user = await bot.getChat(chatId);
    const username = user.username ? `@${user.username}` : user.first_name || 'Unknown';
    
    let message = `📥 *New Cash In*\n`;
    message += `👤 User: ${username}\n`;
    message += `📅 Date: ${new Date().toLocaleString()}\n\n`;
    message += `*Games:*\n`;
    
    let totalAmount = 0;
    let totalPoints = 0;
    
    for (const game of cashin.games || []) {
        message += `  🎮 ${game.name}: $${game.amount.toFixed(2)} | ${game.points} pts\n`;
        totalAmount += game.amount;
        totalPoints += game.points;
    }
    
    message += `\n💰 *Total Amount:* $${totalAmount.toFixed(2)}\n`;
    message += `🎯 *Total Points:* ${totalPoints}`;
    
    // Save to CSV
    const csvLine = `"${new Date().toISOString()}","${username}",${totalAmount},${totalPoints},"${cashin.games?.map(g => `${g.name}:$${g.amount}|${g.points}pts`).join('; ')}"\n`;
    
    if (!fs.existsSync(csvFilePath)) {
        fs.writeFileSync(csvFilePath, 'Date,User,TotalAmount,TotalPoints,GamesDetail\n');
    }
    fs.appendFileSync(csvFilePath, csvLine);
    
    // Send to reporting group with photo
    if (REPORTING_GROUP_ID && cashin.photoFileId) {
        await bot.sendPhoto(REPORTING_GROUP_ID, cashin.photoFileId, {
            caption: message,
            parse_mode: 'Markdown'
        });
    } else if (REPORTING_GROUP_ID) {
        await bot.sendMessage(REPORTING_GROUP_ID, message, { parse_mode: 'Markdown' });
    }
    
    await bot.sendMessage(chatId, '✅ Your cash in has been recorded!');
    delete userStates[chatId];
}

// Submit cashout to both groups (Change #3)
async function submitCashOut(bot: TelegramBot, chatId: number, cashout: CashoutState, from: TelegramBot.User) {
    const username = from.username ? `@${from.username}` : from.first_name || 'Unknown';
    
    let message = `📤 *New Cashout Request*\n`;
    message += `👤 User: ${username}\n`;
    message += `📅 Date: ${new Date().toLocaleString()}\n`;
    message += `🎮 Game: ${cashout.game}\n`;
    message += `🎯 Points Redeemed: ${cashout.pointsRedeemed}\n`;
    message += `🔁 Playback: ${cashout.playback || 0}\n`;
    message += `💸 Tip: ${cashout.tip || 0}\n`;
    message += `💰 Cashout Amount: $${cashout.cashoutAmount?.toFixed(2)}\n`;
    message += `📝 Details: ${cashout.customerDetails}`;
    
    // Save to cashout CSV
    const csvLine = `"${new Date().toISOString()}","${username}","${cashout.game}",${cashout.pointsRedeemed},${cashout.playback || 0},${cashout.tip || 0},${cashout.cashoutAmount},"${cashout.customerDetails}"\n`;
    
    if (!fs.existsSync(cashoutCsvPath)) {
        fs.writeFileSync(cashoutCsvPath, 'Date,User,Game,PointsRedeemed,Playback,Tip,CashoutAmount,CustomerDetails\n');
    }
    fs.appendFileSync(cashoutCsvPath, csvLine);
    
    // 1. Send to cashout group for approval (with buttons)
    if (CASHOUT_GROUP_ID) {
        await bot.sendMessage(CASHOUT_GROUP_ID, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Approve", callback_data: `approve_cashout_${chatId}` }],
                    [{ text: "❌ Deny", callback_data: `deny_cashout_${chatId}` }]
                ]
            }
        });
    }
    
    // 2. Send copy to reporting group (Change #3)
    if (REPORTING_GROUP_ID) {
        await bot.sendMessage(REPORTING_GROUP_ID, message, { parse_mode: 'Markdown' });
    }
    
    await bot.sendMessage(chatId, '✅ Your cashout request has been submitted and is pending approval.');
    delete userStates[chatId];
}

// ============================================
// EXPORTED INIT FUNCTION (works with index.ts)
// ============================================
export function initTelegramBot(token: string, baseUrl?: string): TelegramBot {
    // Set up bot with webhook if baseUrl provided, otherwise polling
    const bot = baseUrl 
        ? new TelegramBot(token, { webHook: { port: 3000 } })
        : new TelegramBot(token, { polling: true });
    
    if (baseUrl) {
        bot.setWebHook(`${baseUrl}/bot${token}`);
        console.log(`Webhook set to ${baseUrl}/bot${token}`);
    }
    
    // Set paths relative to project root
    csvFilePath = path.join(process.cwd(), 'records.csv');
    cashoutCsvPath = path.join(process.cwd(), 'cashout_records.csv');
    
    // Load group IDs from environment
    REPORTING_GROUP_ID = process.env.REPORTING_GROUP_ID || '';
    CASHOUT_GROUP_ID = process.env.CASHOUT_GROUP_ID || '';
    
    // ============================================
    // SET COMMANDS (Change #4 - no /start)
    // ============================================
    bot.setMyCommands([
        { command: "cashin", description: "📥 Record a cash in transaction" },
        { command: "cashout", description: "📤 Request a cashout" }
    ]);
    
    // ============================================
    // /cashin COMMAND
    // ============================================
    bot.onText(/\/cashin/, async (msg) => {
        const chatId = msg.chat.id;
        userStates[chatId] = {
            step: 'cashin',
            cashin: { step: 'awaiting_photo' }
        };
        await bot.sendMessage(chatId, '📸 Please send a photo or screenshot of the transaction.');
    });
    
    // ============================================
    // /cashout COMMAND
    // ============================================
    bot.onText(/\/cashout/, async (msg) => {
        const chatId = msg.chat.id;
        userStates[chatId] = {
            step: 'cashout',
            cashout: { step: 'awaiting_game' }
        };
        
        const keyboard = generateGameKeyboard();
        await bot.sendMessage(chatId, '🎮 Select the game for cashout:', { reply_markup: keyboard });
    });
    
    // ============================================
    // CALLBACK QUERY HANDLER
    // ============================================
    bot.on('callback_query', async (query) => {
        const chatId = query.message?.chat.id;
        if (!chatId) return;
        
        const data = query.data;
        const userState = userStates[chatId];
        if (!userState) return;
        
        await bot.answerCallbackQuery(query.id);
        
        // Handle game selection for cashin
        if (userState.step === 'cashin' && userState.cashin?.step === 'selecting_games') {
            const cashin = userState.cashin;
            
            if (data?.startsWith('select_game_')) {
                const game = data.replace('select_game_', '');
                
                if (game === 'Others') {
                    cashin.step = 'custom_game_name';
                    await bot.sendMessage(chatId, '✏️ Please type the custom game name:');
                    return;
                }
                
                if (!cashin.games) cashin.games = [];
                
                const existingIndex = cashin.games.findIndex(g => g.name === game);
                if (existingIndex >= 0) {
                    cashin.games.splice(existingIndex, 1);
                } else {
                    cashin.games.push({ name: game, amount: 0, points: 0 });
                }
                
                const selectedNames = cashin.games.map(g => g.name);
                const keyboard = generateGameKeyboard(selectedNames);
                await bot.editMessageReplyMarkup(keyboard, {
                    chat_id: chatId,
                    message_id: query.message?.message_id
                });
                return;
            }
            
            if (data === 'games_done') {
                if (!cashin.games || cashin.games.length === 0) {
                    await bot.sendMessage(chatId, '⚠️ Please select at least one game.');
                    return;
                }
                
                cashin.currentGameIndex = 0;
                cashin.step = 'entering_amount';
                const game = cashin.games[0].name;
                const keyboard = generateNumpadKeyboard();
                await bot.sendMessage(chatId, `💰 Enter dollar amount for ${game}:`, { reply_markup: keyboard });
                return;
            }
        }
        
        // ============================================
        // CASHOUT CALLBACK HANDLERS (Change #2)
        // ============================================
        if (userState.step === 'cashout' && userState.cashout) {
            const cashout = userState.cashout;
            
            if (data?.startsWith('select_game_')) {
                const game = data.replace('select_game_', '');
                
                if (game === 'Others') {
                    cashout.step = 'custom_game';
                    await bot.sendMessage(chatId, '✏️ Please type the custom game name:');
                    return;
                }
                
                cashout.game = game;
                cashout.step = 'points_redeemed';
                await bot.sendMessage(chatId, `🎯 Enter points redeemed for ${game}:`);
                return;
            }
            
            // Playback confirmation
            if (data === 'cashout_playback_yes') {
                cashout.step = 'playback_amount';
                await bot.sendMessage(chatId, '💰 Enter playback amount (numbers only):');
                return;
            }
            
            if (data === 'cashout_playback_no') {
                cashout.playback = 0;
                cashout.step = 'tip_confirm';
                await bot.sendMessage(chatId, '💸 Do you want to add a tip?', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ Yes", callback_data: "cashout_tip_yes" }],
                            [{ text: "❌ No", callback_data: "cashout_tip_no" }]
                        ]
                    }
                });
                return;
            }
            
            // Tip confirmation
            if (data === 'cashout_tip_yes') {
                cashout.step = 'tip_amount';
                await bot.sendMessage(chatId, '💵 Enter tip amount (numbers only):');
                return;
            }
            
            if (data === 'cashout_tip_no') {
                cashout.tip = 0;
                cashout.step = 'cashout_amount';
                await bot.sendMessage(chatId, '💲 Enter cashout amount:');
                return;
            }
        }
        
        // Numpad handling for cashin
        if (userState.step === 'cashin' && userState.cashin) {
            const cashin = userState.cashin;
            const currentGame = cashin.games?.[cashin.currentGameIndex || 0];
            if (!currentGame) return;
            
            const isAmountStep = cashin.step === 'entering_amount';
            const isPointsStep = cashin.step === 'entering_points';
            
            if (isAmountStep || isPointsStep) {
                const currentValue = isAmountStep 
                    ? (currentGame.amount?.toString() || '')
                    : (currentGame.points?.toString() || '');
                
                if (data?.startsWith('numpad_')) {
                    const key = data.replace('numpad_', '');
                    let newValue = currentValue;
                    
                    if (key === '⌫') {
                        newValue = currentValue.slice(0, -1);
                    } else if (key === '.') {
                        if (!currentValue.includes('.')) {
                            newValue = currentValue + key;
                        }
                    } else {
                        newValue = currentValue + key;
                    }
                    
                    if (isAmountStep) {
                        currentGame.amount = parseFloat(newValue) || 0;
                    } else {
                        currentGame.points = parseFloat(newValue) || 0;
                    }
                    
                    const keyboard = generateNumpadKeyboard(newValue);
                    await bot.editMessageReplyMarkup(keyboard, {
                        chat_id: chatId,
                        message_id: query.message?.message_id
                    });
                    return;
                }
                
                if (data === 'numpad_done') {
                    if (isAmountStep) {
                        cashin.step = 'entering_points';
                        const keyboard = generateNumpadKeyboard();
                        await bot.sendMessage(chatId, `🎯 Enter points earned for ${currentGame.name}:`, { reply_markup: keyboard });
                    } else {
                        const nextIndex = (cashin.currentGameIndex || 0) + 1;
                        if (cashin.games && nextIndex < cashin.games.length) {
                            cashin.currentGameIndex = nextIndex;
                            cashin.step = 'entering_amount';
                            const nextGame = cashin.games[nextIndex].name;
                            const keyboard = generateNumpadKeyboard();
                            await bot.sendMessage(chatId, `💰 Enter dollar amount for ${nextGame}:`, { reply_markup: keyboard });
                        } else {
                            await submitCashIn(bot, chatId, cashin);
                        }
                    }
                    return;
                }
            }
        }
        
        // Approve/Deny cashout
        if (data?.startsWith('approve_cashout_')) {
            const userId = data.replace('approve_cashout_', '');
            await bot.sendMessage(userId, '✅ Your cashout request has been approved!');
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: query.message?.message_id
            });
            await bot.sendMessage(chatId!, `✅ Cashout approved by ${query.from.username || 'admin'}`);
            return;
        }
        
        if (data?.startsWith('deny_cashout_')) {
            const userId = data.replace('deny_cashout_', '');
            await bot.sendMessage(userId, '❌ Your cashout request has been denied.');
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: query.message?.message_id
            });
            await bot.sendMessage(chatId!, `❌ Cashout denied by ${query.from.username || 'admin'}`);
            return;
        }
    });
    
    // ============================================
    // MESSAGE HANDLER
    // ============================================
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userState = userStates[chatId];
        if (!userState) return;
        
        const text = msg.text;
        const photo = msg.photo;
        
        // CASHIN FLOW
        if (userState.step === 'cashin' && userState.cashin) {
            const cashin = userState.cashin;
            
            if (cashin.step === 'awaiting_photo' && photo) {
                cashin.photoFileId = photo[photo.length - 1].file_id;
                cashin.step = 'selecting_games';
                const keyboard = generateGameKeyboard();
                await bot.sendMessage(chatId, '🎮 Select games for this transaction:', { reply_markup: keyboard });
                return;
            }
            
            if (cashin.step === 'custom_game_name' && text) {
                const customGame = text.trim();
                if (!cashin.games) cashin.games = [];
                cashin.games.push({ name: customGame, amount: 0, points: 0 });
                
                cashin.step = 'selecting_games';
                const selectedNames = cashin.games.map(g => g.name);
                const keyboard = generateGameKeyboard(selectedNames);
                await bot.sendMessage(chatId, '➕ Game added. Select more or press Done:', { reply_markup: keyboard });
                return;
            }
        }
        
        // CASHOUT FLOW (Change #2)
        if (userState.step === 'cashout' && userState.cashout) {
            const cashout = userState.cashout;
            
            if (cashout.step === 'custom_game' && text) {
                cashout.game = text.trim();
                cashout.step = 'points_redeemed';
                await bot.sendMessage(chatId, `🎯 Enter points redeemed for ${cashout.game}:`);
                return;
            }
            
            if (cashout.step === 'points_redeemed' && text) {
                const points = parseFloat(text);
                if (isNaN(points)) {
                    await bot.sendMessage(chatId, '❌ Please enter a valid number.');
                    return;
                }
                cashout.pointsRedeemed = points;
                cashout.step = 'playback_confirm';
                
                await bot.sendMessage(chatId, '🎮 Do you have playback?', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ Yes", callback_data: "cashout_playback_yes" }],
                            [{ text: "❌ No", callback_data: "cashout_playback_no" }]
                        ]
                    }
                });
                return;
            }
            
            if (cashout.step === 'playback_amount' && text) {
                const amount = parseFloat(text);
                if (isNaN(amount)) {
                    await bot.sendMessage(chatId, '❌ Please enter a valid number for playback.');
                    return;
                }
                cashout.playback = amount;
                cashout.step = 'tip_confirm';
                
                await bot.sendMessage(chatId, '💸 Do you want to add a tip?', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ Yes", callback_data: "cashout_tip_yes" }],
                            [{ text: "❌ No", callback_data: "cashout_tip_no" }]
                        ]
                    }
                });
                return;
            }
            
            if (cashout.step === 'tip_amount' && text) {
                const amount = parseFloat(text);
                if (isNaN(amount)) {
                    await bot.sendMessage(chatId, '❌ Please enter a valid number for tip.');
                    return;
                }
                cashout.tip = amount;
                cashout.step = 'cashout_amount';
                await bot.sendMessage(chatId, '💲 Enter cashout amount:');
                return;
            }
            
            if (cashout.step === 'cashout_amount' && text) {
                const amount = parseFloat(text);
                if (isNaN(amount)) {
                    await bot.sendMessage(chatId, '❌ Please enter a valid number for cashout amount.');
                    return;
                }
                cashout.cashoutAmount = amount;
                cashout.step = 'customer_details';
                await bot.sendMessage(chatId, '📝 Enter customer payment details (e.g., PayPal, Zelle info):');
                return;
            }
            
            if (cashout.step === 'customer_details' && text) {
                cashout.customerDetails = text;
                await submitCashOut(bot, chatId, cashout, msg.from);
                return;
            }
        }
    });
    
    console.log('🤖 Telegram bot is running...');
    return bot;
}
