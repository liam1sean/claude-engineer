# Use an official Node runtime as a parent image
FROM node:24-alpine

# Create and set the working directory inside the container
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the app
COPY . .

# The server listens on this port (matches your app default)
EXPOSE 3000

# Start the API server
CMD ["node", "server.js"]