import { bot } from "../config/bot";
import {sheets} from "../config/sheets";
import {getCongressDay} from "../utils/getCongressDay";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import {uploadImageToDrive} from "../utils/imageUploader";
import {downloadImageFromTelegram} from "../utils/fileDownloader";
import path from "path";
import {evaluateResponseAgainstCriteria} from "./responseEvaluator";
import {addPointsToResults, getDailyScore} from "./viewScore";
import {dailyTaskRanges} from "../utils/dailtyTasksRange";

const SHEET_ID = process.env.SHEET_ID as string;
const awaitingResponse = new Map<number, boolean>();
const awaitingImageResponseTaskId = new Map<number, string>();

export const responseHandler = (chatId: number) => {
    bot.sendMessage(
        chatId,
        `Submit your responses in the following format:\n\n` +
        `*Task Number*\n*Your Response*\n\n` +
        `*Example:*\n1\nThe acronym for AIESEC values is 'SALADE'`,
        {
            parse_mode: "Markdown"
        }
    );

    // Set response mode ON for this user
    awaitingResponse.set(chatId, true);
};


// handle responses
export const handleResponseMessage = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const photo = msg.photo;

    if (!awaitingResponse.has(chatId)) return;

    const day = getCongressDay();
    if (day < 1 || day > 9) {
        await bot.sendMessage(chatId, "⚠️ Responses are not being accepted today.");
        awaitingResponse.delete(chatId);
        return;
    }

    if (photo && photo.length > 0) {
        await handleImageResponse(chatId, photo);
    } else if (text) {
        await handleTextResponse(chatId, text);
    }
};

// Save responses in the Google sheet
const appendResponseToSheet = async (chatId: number, taskNumber: string, response: string) => {
    const day = getCongressDay();
    const targetSheet = `Responses-D${day}`;
    const dateString = new Date().toLocaleString("en-GB", { timeZone: "Asia/Colombo" });

    const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${targetSheet}!A:D`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [[dateString, chatId, taskNumber, response]],
        },
    });

    const updatedRange = appendRes.data.updates?.updatedRange;
    if (!updatedRange) throw new Error("Could not determine updated range.");
    const newRow = parseInt(updatedRange.split("!")[1].split(":")[0].replace(/\D/g, ""));

    return { newRow, targetSheet };
};


// Get task criteria adn allocated points
const getTaskCriteriaAndPoints = async (taskNumber: string) => {
    const day = getCongressDay();
    if (day < 1 || day > 9) throw new Error("Invalid congress day");

    const range = dailyTaskRanges[day];
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) throw new Error("No task data found");

    const taskRow = rows.find(row => row[0] === taskNumber);

    if (!taskRow) throw new Error(`Task ${taskNumber} not found`);

    const points = Number(taskRow[2] || 0);       // column C = index 2
    const criteria = taskRow[5];                   // column F = index 5

    if (!criteria) throw new Error("Criteria not found for this task");

    return { criteria, points };
};


// Set response Validity and score
const updateValidityAndScore = async (chatId: number, isValid: boolean, taskNumber: string, newRow: number, targetSheet: string) => {
    const day = getCongressDay();

    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${targetSheet}!E${newRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[isValid ? "TRUE" : "FALSE"]] },
    });

    if (isValid) {
        const { points } = await getTaskCriteriaAndPoints(taskNumber);
        if (points > 0) await addPointsToResults(chatId, points, day);
    }

    const dayScore = await getDailyScore(chatId, day);
    await bot.sendMessage(chatId, `🎉 Your score for today: ${dayScore} points.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📋 View Tasks", callback_data: "view_tasks" }],
                [{ text: "📝 Submit Responses", callback_data: "submit_responses" }],
                [{ text: "🏆 View Score", callback_data: "view_score" }],
            ],
        },
    });
};


// handle textual responses
const handleTextResponse = async (chatId: number, text: string) => {
    const lines = text.split("\n");
    if (lines.length === 1 && !isNaN(Number(lines[0].trim()))) {
        const taskNumber = lines[0].trim();
        awaitingImageResponseTaskId.set(chatId, taskNumber);
        return bot.sendMessage(chatId, `📸 Now send your image response for Task ${taskNumber}`);
    }

    if (lines.length !== 2) {
        return bot.sendMessage(chatId, "⚠️ Invalid format. Submit as:\n\n`Task Number`\n`Your Response`", { parse_mode: "Markdown" });
    }


    const [taskNumber, responseText] = lines.map(l => l.trim());
    console.log(taskNumber);

    if (!taskNumber || isNaN(Number(taskNumber)) || !responseText) {
        return bot.sendMessage(chatId, "⚠️ Invalid task number or empty response.");
    }

    try {
        // Check if task already marked completed
        const alreadyValid = await isTaskAlreadyCompleted(chatId, taskNumber);
        if (alreadyValid) {
            await bot.sendMessage(chatId, `✅ You've already submitted a valid response for Task ${taskNumber}. No need to submit again.`);
            awaitingResponse.delete(chatId);
            return;
        }

        const { newRow, targetSheet } = await appendResponseToSheet(chatId, taskNumber, responseText);
        const { criteria } = await getTaskCriteriaAndPoints(taskNumber);

        const isValid = await evaluateResponseAgainstCriteria(criteria, responseText, "text");
        await updateValidityAndScore(chatId, isValid, taskNumber, newRow, targetSheet);

        await bot.sendMessage(chatId, isValid ? "✅ Great! Your response meets the criteria." : "❌ Your response doesn't meet the criteria.");
    } catch (err) {
        console.error("Text response error:", err);
        await bot.sendMessage(chatId, "❌ Error saving your response. Please try again later.");
    }

    awaitingResponse.delete(chatId);
};


// handle visual responses
const handleImageResponse = async (chatId: number, photo: TelegramBot.PhotoSize[]) => {
    const taskNumber = awaitingImageResponseTaskId.get(chatId);
    if (!taskNumber) return bot.sendMessage(chatId, "⚠️ Please send Task Number first.");

    try {
        // Check if task already marked completed
        const alreadyValid = await isTaskAlreadyCompleted(chatId, taskNumber);
        if (alreadyValid) {
            await bot.sendMessage(chatId, `✅ You've already submitted a valid response for Task ${taskNumber}. No need to submit again.`);
            awaitingResponse.delete(chatId);
            return;
        }

        const filePath = await downloadImageFromTelegram(bot, photo);
        const fileName = path.basename(filePath);
        const publicUrl = await uploadImageToDrive(filePath, fileName);

        const { newRow, targetSheet } = await appendResponseToSheet(chatId, taskNumber, publicUrl);
        const { criteria } = await getTaskCriteriaAndPoints(taskNumber);

        const isValid = await evaluateResponseAgainstCriteria(criteria, filePath, "image");
        await updateValidityAndScore(chatId, isValid, taskNumber, newRow, targetSheet);

        await bot.sendMessage(chatId, isValid ? "✅ Your image meets the criteria." : "❌ Your image doesn't meet the criteria.");
        fs.unlinkSync(filePath);
    } catch (err) {
        console.error("Image response error:", err);
        await bot.sendMessage(chatId, "❌ Error saving your image. Please try again.");
    }

    awaitingImageResponseTaskId.delete(chatId);
    awaitingResponse.delete(chatId);
};

// Check task already completed
export const isTaskAlreadyCompleted = async (chatId: number, taskNumber: string): Promise<boolean> => {
    try {
        const day = getCongressDay();
        const targetSheet = `Responses-D${day}`;

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${targetSheet}!A:E`,
        });

        const rows = response.data.values || [];

        // Find if any row has this chatId + taskNumber + validity TRUE
        const hasValidResponse = rows.some(row =>
            row[1] === chatId.toString() && row[2] === taskNumber && row[4] === "TRUE"
        );

        return hasValidResponse;
    } catch (error) {
        console.error("Error checking existing valid task:", error);
        return false;
    }
};


export const isAwaitingResponse = (chatId: number) => {
    return awaitingResponse.has(chatId);
};
