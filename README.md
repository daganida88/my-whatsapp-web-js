# WhatsApp Web Service

A Docker-based WhatsApp Web service using whatsapp-web.js with REST API endpoints for sending images, videos, and forwarding messages from Python or any HTTP client.

## Features

- 🚀 REST API with authentication
- 📱 WhatsApp Web integration
- 🖼️ Send images with captions
- 🎥 Send videos with captions  
- ↩️ Forward messages between chats
- 🔐 API key authentication
- 🐳 Docker containerized
- 💾 Persistent WhatsApp sessions

## Quick Start

### 1. Setup

```bash
# Clone or create the service directory
mkdir whatsapp-service && cd whatsapp-service

# Set your API key (IMPORTANT: Change this!)
export API_KEY="your-super-secret-api-key"

# Build and start the service
docker-compose up --build
```

### 2. First-Time Authentication

When you start the service for the first time:

1. **QR Code will appear** in the terminal
2. **Open WhatsApp** on your mobile device
3. Go to **Settings > Linked Devices > Link a Device**
4. **Scan the QR code** displayed in terminal
5. **Session is saved** - no need to scan again on restarts

### 3. Verify Service is Ready

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "whatsapp": "connected",
  "timestamp": "2025-01-29T10:30:00.000Z"
}
```

## API Endpoints

All endpoints require authentication via `X-API-Key` header.

### Authentication

Include your API key in requests:
```bash
# As header (recommended)
curl -H "X-API-Key: your-secret-api-key" http://localhost:3000/health

# As query parameter
curl http://localhost:3000/health?api_key=your-secret-api-key
```

### 1. Send Image

**POST** `/api/sendImage`

```bash
curl -X POST \
  -H "X-API-Key: your-secret-api-key" \
  -F "image=@/path/to/image.jpg" \
  -F "chatId=1234567890@c.us" \
  -F "caption=Hello from API!" \
  http://localhost:3000/api/sendImage
```

### 2. Send Video

**POST** `/api/sendVideo`

```bash
curl -X POST \
  -H "X-API-Key: your-secret-api-key" \
  -F "video=@/path/to/video.mp4" \
  -F "chatId=1234567890@c.us" \
  -F "caption=Video message!" \
  http://localhost:3000/api/sendVideo
```

### 3. Forward Message

**POST** `/api/forwardMessage`

```bash
curl -X POST \
  -H "X-API-Key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "false_1234567890@c.us_ABC123DEF456",
    "chatId": "0987654321@c.us"
  }' \
  http://localhost:3000/api/forwardMessage
```

## Python Integration

### Installation

```bash
pip install requests
```

### Example Usage

```python
import requests

API_KEY = "your-super-secret-api-key"
BASE_URL = "http://localhost:3000"

# Headers for authentication
headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Check service status
def check_status():
    response = requests.get(f"{BASE_URL}/health")
    return response.json()

# Send image
def send_image(image_path, chat_id, caption=""):
    with open(image_path, "rb") as f:
        files = {"image": f}
        data = {
            "chatId": chat_id,
            "caption": caption
        }
        response = requests.post(
            f"{BASE_URL}/api/sendImage", 
            files=files, 
            data=data, 
            headers={"X-API-Key": API_KEY}
        )
        return response.json()

# Send video
def send_video(video_path, chat_id, caption=""):
    with open(video_path, "rb") as f:
        files = {"video": f}
        data = {
            "chatId": chat_id,
            "caption": caption
        }
        response = requests.post(
            f"{BASE_URL}/api/sendVideo", 
            files=files, 
            data=data, 
            headers={"X-API-Key": API_KEY}
        )
        return response.json()

# Forward message
def forward_message(message_id, target_chat_id):
    data = {
        "messageId": message_id,
        "chatId": target_chat_id
    }
    response = requests.post(
        f"{BASE_URL}/api/forwardMessage", 
        json=data, 
        headers=headers
    )
    return response.json()

# Usage examples
if __name__ == "__main__":
    print("Service status:", check_status())
    
    # Send image to individual chat
    result = send_image(
        "photo.jpg", 
        "1234567890@c.us", 
        "Hello from Python!"
    )
    print("Image sent:", result)
    
    # Send video to group chat
    result = send_video(
        "video.mp4", 
        "120363123456789012@g.us", 
        "Check this out!"
    )
    print("Video sent:", result)
```

## Chat ID Formats

### Individual Chats
- Format: `phone_number@c.us`
- Example: `1234567890@c.us`
- Use the phone number **without** country code prefixes like `+` or `00`

### Group Chats  
- Format: `group_id@g.us`
- Example: `120363123456789012@g.us`
- Get group ID from WhatsApp web console or message logs

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | **Required** - Secret key for API authentication | None |
| `PORT` | Port for the API server | `3000` |
| `NODE_ENV` | Node environment | `production` |

### Docker Compose Configuration

```yaml
# Set API key in docker-compose.yml
environment:
  - API_KEY=your-secret-api-key-here
```

Or use an `.env` file:
```bash
# Create .env file
echo "API_KEY=your-secret-api-key" > .env
```

## File Structure

```
whatsapp-service/
├── index.js              # Main service file
├── package.json          # Node.js dependencies
├── Dockerfile            # Container configuration
├── docker-compose.yml    # Docker orchestration
├── .dockerignore        # Docker ignore rules
├── .env.example         # Environment template
├── README.md            # This file
├── session_data/        # WhatsApp session (auto-created)
├── uploads/            # Temporary uploads (auto-created)
└── logs/               # Service logs (auto-created)
```

## Troubleshooting

### Common Issues

1. **QR Code not appearing**
   - Check if container is running: `docker-compose ps`
   - View logs: `docker-compose logs -f`

2. **Authentication failed**
   - Delete session data: `rm -rf session_data/`
   - Restart service: `docker-compose restart`
   - Scan QR code again

3. **API returns 401 Unauthorized**
   - Verify API key is set correctly
   - Check header format: `X-API-Key: your-key`

4. **WhatsApp client not ready**
   - Wait for "Client is ready!" message
   - Check `/health` endpoint status

5. **File upload fails**
   - Check file size (max 50MB)
   - Verify file path exists
   - Ensure proper permissions

### Viewing Logs

```bash
# All logs
docker-compose logs -f

# WhatsApp service only
docker-compose logs -f whatsapp-service

# Last 100 lines
docker-compose logs --tail=100 whatsapp-service
```

### Restarting Service

```bash
# Restart without rebuilding
docker-compose restart

# Rebuild and restart
docker-compose up --build -d

# Stop and remove containers
docker-compose down
```

## Security Notes

- **Never commit your API key** to version control
- Use strong, unique API keys in production
- Consider using HTTPS in production deployments
- Regularly rotate API keys
- Monitor API usage and logs

## Limitations

- WhatsApp may rate limit or block accounts using unofficial clients
- Large files may take time to upload
- Group message forwarding requires proper permissions
- Session may need periodic re-authentication

## License

MIT License - Use at your own risk. This service uses unofficial WhatsApp Web APIs.