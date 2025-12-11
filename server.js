// server.js (Updated with SQLite Database and Admin Endpoint)

import { GoogleGenAI } from '@google/genai';
import express from 'express';
import cors from 'cors';
import 'dotenv/config'; 
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3'; // Import the sqlite3 library
import { open } from 'sqlite';   // Import the open function

// --- File Path Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

let db; // Global variable to hold the database connection

// --- Database Setup and Initialization ---
async function initializeDatabase() {
    try {
        db = await open({
            filename: path.join(__dirname, 'chat_history.db'), // Database file path
            driver: sqlite3.Database
        });

        // Create the messages table if it doesn't exist
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

// Function to save messages to the database
async function saveMessage(sender, message) {
    if (!db) {
        console.error("Database connection not established.");
        return;
    }
    await db.run('INSERT INTO messages (sender, message) VALUES (?, ?)', [sender, message]);
}

// --- Gemini API Setup ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the .env file.");
}
const ai = new GoogleGenAI(apiKey);

// Initialize chat session (Holds conversation context)
const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
        systemInstruction: "You are a sassy, funny, and slightly dramatic Artificial Intelligence assistant named 'Birthday Bot' dedicated to delivering a secret birthday message to the user. You MUST maintain the personality of a gatekeeper that tests the user with questions about their friendship. If the user answers a free-form question correctly, praise them humorously. If they answer incorrectly or go off-topic, mock them lightly and steer them back to the current structured task. Keep your answers brief and conversational.",
    }
});

// --- HELPER FUNCTION: Send Message with Automated Retries ---
async function sendMessageWithRetry(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await chat.sendMessage({message: message});
            return result.text;
        } catch (error) {
            if (error.status === 503 || error.status === 500) {
                console.warn(`Gemini temporary error (${error.status}). Retrying in ${2 ** i} seconds...`);
                if (i < retries - 1) { 
                     await new Promise(resolve => setTimeout(resolve, (2 ** i) * 1000));
                }
            } else {
                throw error; 
            }
        }
    }
    throw new Error("Gemini service unavailable after multiple retries.");
}


// --- Middleware ---
app.use(cors()); 
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); 


// --- API ENDPOINT: Chat Communication (Saves to DB) ---
app.post('/api/chat', async (req, res) => {
    const { message, sender } = req.body; // Added sender from frontend for structure
    const isUser = sender === 'user';

    if (!message) {
        return res.status(400).send({ error: "No message provided." });
    }

    try {
        // Save user message immediately
        await saveMessage('User', message);
        
        // Get bot response
        const botResponseText = await sendMessageWithRetry(message);
        
        // Save bot message
        await saveMessage('Bot', botResponseText);

        // Send the response back to the frontend
        res.json({ botResponse: botResponseText });

    } catch (error) {
        console.error("Gemini API Error:", error);
        await saveMessage('System Error', `Failed to get Gemini response for: ${message}`);
        res.status(500).send({ error: "Failed to communicate with the AI model. Try refreshing the page." });
    }
});

// --- NEW ADMIN ENDPOINT: Get All Conversations ---
app.get('/api/admin/conversations', async (req, res) => {
    if (!db) {
        return res.status(503).send({ error: "Database not ready." });
    }
    try {
        // Fetch all messages, ordered by timestamp
        const messages = await db.all('SELECT * FROM messages ORDER BY timestamp ASC');
        res.json(messages);
    } catch (error) {
        console.error("Admin Endpoint Error:", error);
        res.status(500).send({ error: "Could not retrieve conversations." });
    }
});


// --- Serve HTML Files ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// New endpoint for the admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// --- Start Server and Initialize DB ---
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Chatbot: http://localhost:${port}`);
        console.log(`Admin Page: http://localhost:${port}/admin`);
    });
});