# Use the official Bun image as the base
FROM oven/bun:latest

# Install OpenJDK 21
RUN apt-get update && \
    apt-get install -y openjdk-21-jre-headless && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p data logs backups temp

# Expose Minecraft port
EXPOSE 25565

# Expose API port
EXPOSE 3000


# Set environment variables
ENV NODE_ENV=production
ENV API_PORT=3000

# Start the application
CMD ["bun", "run", "start"]
