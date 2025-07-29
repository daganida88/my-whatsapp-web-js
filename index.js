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

// Create client with local authentication to persist session
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-service"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

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
        // if (show_typing) {
        //     chat = await whatsappClient.getChatById(chatId);
        //     await chat.sendStateTyping();
            
        //     // Wait for specified duration (default 2 seconds)
        //     const waitTime = typing_duration || 2000;
        //     await new Promise(resolve => setTimeout(resolve, waitTime));
        // }

        console.log('🔗 Downloading media from URL:', file.url);
        
        let message;
        try {
            const media = await MessageMedia.fromUrl(file.url);
            console.log('📄 Media created successfully:', {
                mimetype: media.mimetype,
                filename: media.filename,
                size: media.data ? media.data.length : 'unknown'
            });

            console.log('📤 Sending message to chat:', chatId);
            message = await whatsappClient.sendMessage(chatId, media, { 
                caption: caption || '' 
            });
            console.log('✅ Message sent successfully');
            
        } catch (mediaError) {
            console.error('❌ Media creation or sending failed:', mediaError);
            
            // Try fallback: manual download + MessageMedia creation
            console.log('🔄 Trying fallback method...');
            try {
                const response = await axios.get(file.url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);
                
                const media = new MessageMedia(
                    file.mimetype || response.headers['content-type'] || 'application/octet-stream',
                    buffer.toString('base64'),
                    file.filename || 'media'
                );
                
                console.log('📄 Fallback media created:', {
                    mimetype: media.mimetype,
                    filename: media.filename,
                    size: buffer.length
                });
                
                message = await whatsappClient.sendMessage(chatId, media, { 
                    caption: caption || '' 
                });
                console.log('✅ Fallback method successful');
                
            } catch (fallbackError) {
                console.error('❌ Both methods failed:', fallbackError);
                throw new Error(`Media sending failed: ${mediaError.message}. Fallback also failed: ${fallbackError.message}`);
            }
        }

        // Clear typing state automatically after sending
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
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { messageId, chatId } = req.body;
        
        if (!messageId || !chatId) {
            return res.status(400).json({ 
                error: 'messageId and chatId are required' 
            });
        }

        // Get the message to forward directly by ID
        console.log('🔍 Getting message by ID:', messageId);
        
        const messageToForward = await whatsappClient.getMessageById(messageId);
        console.log('✅ Found message:', messageToForward ? 'Yes' : 'No');

        if (!messageToForward) {
            return res.status(404).json({ error: 'Message not found' });
        }

        console.log('📤 Attempting to forward message to:', chatId);
        console.log('📋 Message type:', messageToForward.type);
        console.log('📋 Message body:', messageToForward.body ? messageToForward.body.substring(0, 50) + '...' : 'No body');
        console.log('📍 Source chat:', messageToForward.from);

        // Check if we're trying to forward to the same chat (might not be allowed)
        if (messageToForward.from === chatId) {
            console.log('⚠️  Warning: Trying to forward within the same chat');
        }

        try {
            console.log('🚀 Calling forward() method...');
            
            // The forward() method doesn't return anything, just executes the forward
            await messageToForward.forward(chatId);
            console.log('✅ Forward method completed without throwing error');

            // Since forward() doesn't return the new message, we return success with original message info
            res.json({ 
                success: true, 
                message: 'Message forwarded successfully',
                originalMessageId: messageId,
                targetChatId: chatId,
                timestamp: new Date().toISOString(),
                messageType: messageToForward.type
            });
        } catch (forwardError) {
            console.error('❌ Forward error:', forwardError);
            return res.status(500).json({ 
                error: 'Failed to forward message', 
                details: forwardError.message,
                messageType: messageToForward.type,
                stack: forwardError.stack
            });
        }

    } catch (error) {
        console.error('Error forwarding message:', error);
        res.status(500).json({ 
            error: 'Failed to forward message', 
            message: error.message 
        });
    }
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

// JSON-based Send Media endpoint - supports all media types with full payload format
app.post('/sendMedia', authenticateAPI, async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { chatId, file, caption, session, reply_to, asNote, show_typing, typing_duration } = req.body;
        
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        if (!file || !file.url) {
            return res.status(400).json({ error: 'file.url is required' });
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

        console.log('🔗 Downloading media from URL:', file.url);
        
        // Download media from URL
        const response = await axios.get(file.url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        console.log('📄 Downloaded media:', {
            size: buffer.length,
            contentType: response.headers['content-type']
        });
        
        // Create MessageMedia from buffer - auto-detect media type from URL/response
        const media = new MessageMedia(
            file.mimetype || response.headers['content-type'] || 'application/octet-stream',
            buffer.toString('base64'),
            file.filename || 'media'
        );
        
        console.log('📄 Media created:', {
            mimetype: media.mimetype,
            filename: media.filename,
            size: media.data ? media.data.length : 'unknown'
        });
        
        // Prepare message options
        const options = { 
            caption: caption || '' 
        };

        // Add reply if specified
        if (reply_to) {
            options.quotedMessageId = reply_to;
        }

        console.log('📤 Sending message to chat:', chatId);
        const message = await whatsappClient.sendMessage(chatId, media, options);
        console.log('✅ Message sent successfully');

        // Clear typing state automatically after sending
        if (show_typing && chat) {
            await chat.clearState();
        }

        res.json({ 
            success: true, 
            messageId: message.id._serialized,
            timestamp: message.timestamp,
            session: session || 'default'
        });

    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({ 
            error: 'Failed to send media', 
            message: error.message 
        });
    }
});

// Send Text Message endpoint with typing support
app.post('/sendMessage', authenticateAPI, async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const { chatId, message, session, reply_to, show_typing, typing_duration } = req.body;
        
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
            session: session || 'default'
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