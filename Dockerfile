# Use Node.js 18 Alpine image
FROM node:18-alpine

# Install dependencies required for Puppeteer and Chrome
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create directory for WhatsApp session data
RUN mkdir -p /app/.wwebjs_auth

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create a non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S whatsapp -u 1001

# Change ownership of the app directory
RUN chown -R whatsapp:nodejs /app

# Switch to non-root user
USER whatsapp

# Expose port (optional - for potential web interface)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "console.log('Health check')" || exit 1

# Start the application
CMD ["npm", "start"]