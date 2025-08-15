# Use Node.js 18 slim image
FROM node:18-slim

# Install dependencies required for Puppeteer and Chrome

# Best Practice: Combine all apt-related commands into one RUN statement
# This reduces image layers and ensures commands run in the correct sequence.
# Install dependencies, including ca-certificates for HTTPS support
# Set frontend to noninteractive to avoid prompts
ENV DEBIAN_FRONTEND=noninteractive

# Run all commands in one layer to avoid caching issues
# and add extensive debugging output with 'echo'.
# Combine all steps into a single RUN layer for efficiency
RUN \
    # Update apt and install necessary tools and Chrome's dependencies
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
        libxss1 \
        libgbm1 \
        libnspr4 \
        libnss3 \
        fonts-liberation && \
    \
    # Download the official Google Chrome .deb package
    wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb && \
    \
    # Install the package from the local .deb file
    apt install -y /tmp/chrome.deb && \
    \
    # Clean up to reduce the final image size
    rm -rf /var/lib/apt/lists/* && \
    rm /tmp/chrome.deb

# Verify the installation was successful
RUN google-chrome-stable --version
# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci --omit=dev

# Create whatsapp user and group for proper permissions
RUN groupadd -r -g 20 whatsapp && useradd -r -u 501 -g whatsapp whatsapp
# Copy application files (excluding session data and other unnecessary files)
COPY . .
# Remove any accidentally copied session data
RUN rm -rf /app/.wwebjs_auth /app/session_data

# Create necessary directories and set proper ownership
RUN mkdir -p /app/.wwebjs_auth /app/uploads /app/logs && chown -R whatsapp:whatsapp /app

# Switch to whatsapp user
USER whatsapp

# Start the application
CMD ["npm", "start"]
