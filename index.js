const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();


console.log('Starting WhatsApp Web service...');
console.log(`🚀 Running in ${process.env.NODE_ENV || 'production'} mode`);
console.log(`👁️  Browser visibility: ${process.env.NODE_ENV === 'development' ? 'VISIBLE (headless: false)' : 'HIDDEN (headless: true)'}`);

// API Configuration
const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
    console.error('ERROR: API_KEY environment variable is required');
    process.exit(1);
}

// Express setup
const app = express();
app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Authentication middleware
const authenticateAPI = (req, res, next) => {
    const providedKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!providedKey || providedKey !== API_KEY) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Valid API key required' 
        });
    }
    
    next();
};

// Global variable to store WhatsApp client
let whatsappClient = null;

// Prepare Chrome arguments for stable media processing
const chromeArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--max-old-space-size=4096',
    '--memory-pressure-off'
];

// Add proxy if provided - Chrome handles authentication automatically
if (process.env.PROXY_URL) {
    chromeArgs.push(`--proxy-server=${process.env.PROXY_URL}`);
}

// Prepare client configuration
const clientConfig = {
    authStrategy: new LocalAuth({
        clientId: "whatsapp-service"
    }),
    puppeteer: {
        headless: process.env.NODE_ENV === 'development' ? false : true,
        args: chromeArgs,
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    }
};

// Create client with local authentication to persist session
const client = new Client(clientConfig);

// QR Code event - displays QR code for authentication
client.on('qr', (qr) => {
    console.log('📱 QR Code received! Please scan with your WhatsApp mobile app:');
    qrcode.generate(qr, { small: true });
    console.log('⏳ Waiting for QR code scan...');
});

// Ready event - client is authenticated and ready
client.on('ready', () => {
    console.log('✅ WhatsApp Web client is ready!');
    console.log('🎯 Service is now running and listening for messages...');
    whatsappClient = client;
});

// Add more debugging events
client.on('loading_screen', (percent, message) => {
    console.log('⏳ Loading screen:', percent, message);
});

client.on('change_state', state => {
    console.log('🔄 State changed:', state);
});

// API Endpoints

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        whatsapp: whatsappClient ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Send Media endpoint - handles all media types (images, videos, documents, audio) from URLs
app.post('/api/sendMedia', authenticateAPI, async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { chatId, caption, file, show_typing, typing_duration } = req.body;
        
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        if (!file || !file.url) {
            return res.status(400).json({ error: 'file.url is required' });
        }

        let chat = null;

        // Show typing indicator if requested
        if (show_typing && typing_duration > 0) {
            chat = await whatsappClient.getChatById(chatId);
            await chat.sendStateTyping();
            
            // Wait for specified duration
            await new Promise(resolve => setTimeout(resolve, typing_duration));
        }

        console.log('🔗 Downloading media from URL:', file.url);
        
        const media = await MessageMedia.fromUrl(file.url, { unsafeMime: true });
        const message = await whatsappClient.sendMessage(chatId, media, {
            caption: caption || ''
        });
        console.log('✅ Message sent successfully');
        
        // Clear typing state
        if (show_typing && chat) {
            await chat.clearState();
        }
        
        res.json({ 
            success: true, 
            messageId: message.id._serialized,
            timestamp: message.timestamp 
        });

    } catch (error) {
        console.error('Error sending media:', error);
        
        res.status(500).json({ 
            error: 'Failed to send media', 
            message: error.message 
        });
    }
});

// Forward Message endpoint
app.post('/api/forwardMessage', authenticateAPI, async (req, res) => {
    if (!whatsappClient) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    const { messageId, chatId } = req.body;
    const msg = await client.getMessageById(messageId);
    await msg.forward(chatId);

});


// Start Typing endpoint
app.post('/startTyping', authenticateAPI, async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { chatId, session } = req.body;
        
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        const chat = await whatsappClient.getChatById(chatId);
        await chat.sendStateTyping();

        res.json({ 
            success: true, 
            message: 'Typing indicator started',
            chatId: chatId
        });

    } catch (error) {
        console.error('Error starting typing:', error);
        res.status(500).json({ 
            error: 'Failed to start typing', 
            message: error.message 
        });
    }
});

// Stop Typing endpoint
app.post('/stopTyping', authenticateAPI, async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { chatId, session } = req.body;
        
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        const chat = await whatsappClient.getChatById(chatId);
        await chat.clearState();

        res.json({ 
            success: true, 
            message: 'Typing indicator stopped',
            chatId: chatId
        });

    } catch (error) {
        console.error('Error stopping typing:', error);
        res.status(500).json({ 
            error: 'Failed to stop typing', 
            message: error.message 
        });
    }
});


// Send Text Message endpoint with typing support
app.post('/api/sendMessage', authenticateAPI, async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { chatId, message, reply_to, show_typing, typing_duration } = req.body;
        
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }

        let chat = null;

        // Show typing indicator if requested
        if (show_typing) {
            chat = await whatsappClient.getChatById(chatId);
            await chat.sendStateTyping();
            
            // Wait for specified duration (default 2 seconds)
            const waitTime = typing_duration || 2000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Prepare message options
        const options = {};

        // Add reply if specified
        if (reply_to) {
            options.quotedMessageId = reply_to;
        }

        const sentMessage = await whatsappClient.sendMessage(chatId, message, options);

        // Clear typing state automatically after sending
        if (show_typing && chat) {
            await chat.clearState();
        }

        res.json({ 
            success: true, 
            messageId: sentMessage.id._serialized,
            timestamp: sentMessage.timestamp,
        });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            error: 'Failed to send message', 
            message: error.message 
        });
    }
});

// Authentication success
client.on('authenticated', () => {
    console.log('🔐 Authentication successful!');
});

// Authentication failure
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

// Disconnected event
client.on('disconnected', (reason) => {
    console.log('🔌 Client was logged out:', reason);
});

// Add debugging for remote session saved
client.on('remote_session_saved', () => {
    console.log('💾 Remote session saved');
});

// Message received event - basic echo functionality
// client.on('message', async (message) => {
//     console.log(`Message from ${message.author || message.from}: ${message.body}`);
    
//     // Example: Echo messages that start with "!"
//     if (message.body.startsWith('!echo ')) {
//         const echoText = message.body.slice(6);
//         message.reply(`Echo: ${echoText}`);
//     }
    
//     // Example: Respond to "!ping"
//     if (message.body === '!ping') {
//         message.reply('Pong!');
//     }
// });

// Error handling
client.on('error', (error) => {
    console.error('WhatsApp client error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down WhatsApp service...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down WhatsApp service...');
    await client.destroy();
    process.exit(0);
});

// Start Express server
app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
    console.log(`API Key required for authentication`);
});

// Initialize the client
console.log('🚀 Initializing WhatsApp client...');
client.initialize().then(() => {
    console.log('✅ Client initialization started successfully');
}).catch((error) => {
    console.error('❌ Client initialization failed:', error);
});