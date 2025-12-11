// server.js (FINAL VERSION - Using Knex with PostgreSQL)

import { GoogleGenAI } from '@google/genai';
import express from 'express';
import cors from 'cors';
import 'dotenv/config'; 
import path from 'path';
import { fileURLToPath } from 'url';
import knex from 'knex'; // New: Import Knex

// --- File Path Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

let db; // Global variable to hold the Knex database connection

// --- Database Setup and Initialization (Uses process.env.DATABASE_URL) ---
async function initializeDatabase() {
    // Configuration for PostgreSQL
    const config = {
        client: 'pg', 
        connection: process.env.DATABASE_URL, // Provided by hosting platform (Railway/Render)
        // Ensure SSL is used for external connections (required by most hosts)
        ssl: { rejectUnauthorized: false } 
    };

    db = knex(config);

    try {
        // Test the database connection
        await db.raw('SELECT 1+1 AS result'); 
        console.log("Database initialized and PostgreSQL connection successful.");
        
        // Create the 'messages' table if it doesn't exist (Knex Schema Builder)
        const tableExists = await db.schema.hasTable('messages');
        if (!tableExists) {
            await db.schema.createTable('messages', (table) => {
                table.increments('id').primary();
                table.string('sender', 50).notNullable(); // Sender name
                table.text('message').notNullable(); // Message content
                table.timestamp('timestamp').defaultTo(db.fn.now());
            });
            console.log("PostgreSQL 'messages' table created.");
        }

    } catch (error) {
        console.error("Database Initialization Error:", error);
        throw new Error("Failed to connect to PostgreSQL database. Check DATABASE_URL.");
    }
}

// Function to save messages to the database
async function saveMessage(sender, message) {
    if (!db) {
        console.error("Database connection not established.");
        return;
    }
    // Knex insert syntax
    await db('messages').insert({ sender: sender, message: message });
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
    const { message, sender } = req.body; 

    if (!message) {
        return res.status(400).send({ error: "No message provided." });
    }

    try {
        await saveMessage('User', message);
        
        const botResponseText = await sendMessageWithRetry(message);
        
        await saveMessage('Bot', botResponseText);

        res.json({ botResponse: botResponseText });

    } catch (error) {
        console.error("Server Error during Chat:", error);
        await saveMessage('System Error', `Failed to get Gemini response for: ${message}`);
        res.status(500).send({ error: "Internal server error. Please try again." });
    }
});

// --- ADMIN ENDPOINT: Get All Conversations ---
app.get('/api/admin/conversations', async (req, res) => {
    if (!db) {
        return res.status(503).send({ error: "Database not ready." });
    }
    try {
        // Knex select syntax
        const messages = await db.select('*').from('messages').orderBy('timestamp', 'asc');
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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// --- Start Server and Initialize DB ---
// NOTE: We need to set up the DB before starting the server.
initializeDatabase().then(() => {
    // Only set the PORT environment variable locally for testing
    const actualPort = process.env.PORT || port; 
    
    app.listen(actualPort, () => {
        console.log(`Server running on port ${actualPort}`);
        console.log(`Chatbot: http://localhost:${actualPort}`);
        console.log(`Admin Page: http://localhost:${actualPort}/admin`);
    });
});
