# Use the official Node.js 25 Alpine image (lightweight and secure)
FROM node:25-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (better caching)
# Copy only package.json (and lock file if you had one)
COPY package.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Create the data directory structure and set permissions
# We do this so the non-root 'node' user can write to it
RUN mkdir -p data/history && \
    chown -R node:node /app

# Use the non-root 'node' user for security
USER node

# Expose the port defined in server.js/config.json
EXPOSE 1234

# Define environment variables (can be overridden at runtime)
# IMPORTANT: 'localhost' inside Docker is the container itself. 
# To reach Ollama on the host, use host.docker.internal (Mac/Windows) 
# or the host IP (Linux).
ENV PORT=1234
ENV OLLAMA_URL=http://host.docker.internal:11434

RUN sed -i 's/localhost/host.docker.internal/g;' /app/config.json

# Start the application
CMD ["node", "server.js"]
