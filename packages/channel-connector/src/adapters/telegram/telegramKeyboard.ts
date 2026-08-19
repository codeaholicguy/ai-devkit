import type { InlineKeyboard } from '../../types.js';

export interface TelegrafInlineKeyboardButton {
    text: string;
    callback_data: string;
}

export function toTelegrafKeyboard(keyboard: InlineKeyboard): TelegrafInlineKeyboardButton[][] {
    return keyboard.map((row) => row.map((btn) => ({ text: btn.text, callback_data: btn.callbackData })));
}
