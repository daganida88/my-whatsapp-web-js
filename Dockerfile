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

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci --omit=dev

# Copy application files
COPY . .

# Start the application
CMD ["npm", "start"]