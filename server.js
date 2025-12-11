// server.js (Updated with Railway PORT support + SQLite + Gemini AI)

import { GoogleGenAI } from '@google/genai';
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// --- File Path Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// IMPORTANT: Railway needs this! (Fix)
const port = process.env.PORT || 3000;

let db; // SQLite database instance

// --- Database Setup and Initialization ---
async function initializeDatabase() {
    try {
        db = await open({
            filename: path.join(__dirname, 'chat_history.db'),
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Database initialized and 'messages' table ensured.");
    } catch (error) {
        console.error("Database Initialization Error:", error);
    }
}

// Save message to DB
async function saveMessage(sender, message) {
    if (!db) {
        console.error("Database not initialized.");
        return;
    }
    await db.run('INSERT INTO messages (sender, message) VALUES (?, ?)', [sender, message]);
}

// --- Gemini API Setup ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in .env");
}

const ai = new GoogleGenAI(apiKey);

// Chat session (keeps context)
const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
        systemInstruction:
            "You are a sassy, funny, dramatic AI named 'Birthday Bot'. You test the user with friendship questions. Praise good answers humorously, mock wrong ones lightly. Keep responses short."
    }
});

// --- Helper: Retry Gemini API on temporary errors ---
async function sendMessageWithRetry(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await chat.sendMessage({ message });
            return result.text;
        } catch (error) {
            if (error.status === 503 || error.status === 500) {
                console.warn(`Gemini Error ${error.status}. Retrying in ${2 ** i}s...`);
                await new Promise(res => setTimeout(res, (2 ** i) * 1000));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Gemini service unavailable after retries.");
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Chat Endpoint ---
app.post('/api/chat', async (req, res) => {
    const { message, sender } = req.body;

    if (!message) return res.status(400).json({ error: "Message is required." });

    try {
        await saveMessage(sender || "User", message);

        const botReply = await sendMessageWithRetry(message);

        await saveMessage("Bot", botReply);

        res.json({ botResponse: botReply });
    } catch (error) {
        console.error("Chat Error:", error);
        await saveMessage("System", "Gemini failure during reply.");
        res.status(500).json({ error: "AI model failed. Try again." });
    }
});

// --- Admin Endpoint ---
app.get('/api/admin/conversations', async (req, res) => {
    try {
        const messages = await db.all("SELECT * FROM messages ORDER BY timestamp ASC");
        res.json(messages);
    } catch (error) {
        console.error("Admin Fetch Error:", error);
        res.status(500).json({ error: "Could not fetch conversations." });
    }
});

// --- Serve Frontend Pages ---
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// --- Start Server ---
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
        console.log(`Chatbot UI: http://localhost:${port}`);
        console.log(`Admin Panel: http://localhost:${port}/admin`);
    });
});
