// script.js

document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // Make sure this URL matches your server's address and port
    const BACKEND_URL = 'http://localhost:3000/api/chat'; 
    
    // --- CONVERSATION CONTROL POINTS (!!! CUSTOMIZE THESE !!!) ---
    let stage = 0; 
    let botTypingElement = null;

    // Define the sequence of structured questions you want the bot to ask
    const prompts = [
        "Welcome! I am the Gemini-powered Birthday Bot. You must pass three trials of friendship to unlock your message. Send 'START' to begin!",
        "Alright, first trial! What is the slightly embarrassing code name we gave our favorite coffee shop? If you remember, enter it now!", 
        "Excellent. Second Trial: What's the title of the absolutely terrible movie we watched together and vowed never to speak of again? Give me the exact title!",
        "Final Trial: Enter the secret phrase we say every time we leave each other's house. (This is the password!)",
    ];
    
    // Define the correct answers for the local check (must match the structure of the prompts)
    const answers = [
        // Stage 0: Initialization (Answer needed: 'start')
        ['start'], 
        // Stage 1: Coffee Shop
        ['[COFFEE SHOP KEYWORD]', '[COFFEE SHOP ALT]'], // e.g., 'bunker', 'fortress', 'secret base'
        // Stage 2: Movie Title
        ['[MOVIE TITLE KEYWORD]', '[MOVIE TITLE ALT]'], // e.g., 'sharknado 6', 'terrible movie'
        // Stage 3: Final Password
        ['[FINAL PASSWORD KEYWORD]'] // e.g., 'best friend forever', 'seeya'
    ];

    const FINAL_IMAGE_URL = '[LINK TO YOUR BIRTHDAY IMAGE/GIF HERE]'; // E.g., https://i.imgur.com/your-image.gif
    const FRIEND_NAME = "[Friend's Name]";
    const YOUR_NAME = "[Your Name]";
    const FINAL_MESSAGE = `ACCESS GRANTED! 🎉 Happy Birthday ${FRIEND_NAME}! Wishing you the best year ever. I love you! - ${YOUR_NAME}`;

    // --- HELPER FUNCTIONS ---

    function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        messageDiv.textContent = text;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight; 
    }

    function addImageMessage(url) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'bot-message');
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Birthday Surprise';
        messageDiv.appendChild(img);
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
        typingDiv.innerHTML = '...';
        typingDiv.id = 'typing';
        chatBox.appendChild(typingDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return typingDiv;
    }

    function createConfetti() {
        const confettiContainer = document.getElementById('confetti-container');
        const colors = ['#ff69b4', '#8a2be2', '#ffc0cb', '#9370db', '#00ced1', '#ffd700'];
        
        for (let i = 0; i < 60; i++) {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = `${Math.random() * 100}%`;
            confetti.style.top = `${Math.random() * 10}%`;
            confetti.style.animationDelay = `${Math.random() * 2}s`;
            confettiContainer.appendChild(confetti);
        }
    }


    // --- MAIN INPUT PROCESSOR ---

    async function processInput() {
        const input = userInput.value.trim();
        if (input === '') return;

        addMessage(input, 'user');
        userInput.value = '';
        userInput.disabled = true; 
        sendButton.disabled = true;

        botTypingElement = showTypingIndicator();

        let geminiInput = input; // Default message to send to Gemini

        // 1. Check for local structured answer (Only for stages where an answer is required)
        if (stage >= 0 && stage < answers.length) {
            const currentAnswers = answers[stage]; // Use stage directly for 0-indexed array lookup
            const normalizedInput = input.toLowerCase();

            const isCorrect = currentAnswers.some(keyword => normalizedInput.includes(keyword.toLowerCase()));

            if (isCorrect) {
                // CORRECT ANSWER: Advance to the next stage locally
                stage++;

                if (stage === prompts.length) {
                    // FINAL REVEAL (Stage 4)
                    if (botTypingElement) botTypingElement.remove();
                    
                    addMessage(`🤖 [Birthday Bot]: CONGRATULATIONS! Gemini has confirmed your friendship status. Preparing transmission...`, 'bot');

                    setTimeout(() => {
                        createConfetti();
                        addImageMessage(FINAL_IMAGE_URL);
                        setTimeout(() => {
                            addMessage(FINAL_MESSAGE, 'bot');
                            // Lock controls after final message
                            userInput.disabled = true;
                            sendButton.disabled = true;
                        }, 1000); 
                    }, 1000);
                    return; // EXIT the function early on success
                }
                
                // Bot confirms the answer and poses the next structured question
                geminiInput = `USER ANSWERED CORRECTLY: ${input}. Prompt the next question: "${prompts[stage]}". Be humorous and congratulate the user.`;
            } else {
                // INCORRECT ANSWER: Send to Gemini, but KEEP the stage for another try
                geminiInput = `USER ANSWERED INCORRECTLY: ${input} to the question: "${prompts[stage]}". Be humorous and mock them lightly, then ask the same question again.`;
            }
        }
        
        // 2. SEND TO GEMINI (For customized response and flow control)
        try {
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: geminiInput, 
                    sender: 'user' // Sending sender for DB logging
                }) 
            });
            const data = await response.json();
            
            if (botTypingElement) botTypingElement.remove();
            
            if (data.botResponse) {
                addMessage(data.botResponse, 'bot');
            } else {
                addMessage("🤖 [Birthday Bot]: Server response error. Try again!", 'bot');
            }
            
        } catch (error) {
            console.error("Frontend Error:", error);
            if (botTypingElement) botTypingElement.remove();
            addMessage("Server communication error. Is the Node.js server running?", 'bot');
        }

        userInput.disabled = false;
        sendButton.disabled = false;
    }

    // --- INITIALIZATION AND LISTENERS ---

    sendButton.addEventListener('click', processInput);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            processInput();
        }
    });

    // Start the conversation
    addMessage("Welcome to the Friendship Trials! I am the Gemini-powered Birthday Bot.", 'bot');
    setTimeout(() => {
        botTypingElement = showTypingIndicator();
        setTimeout(() => {
            if (botTypingElement) botTypingElement.remove();
            addMessage(prompts[0], 'bot');
        }, 1500);
    }, 1500);

});