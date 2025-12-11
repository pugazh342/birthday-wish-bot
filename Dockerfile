# Dockerfile

# 1. Base image: Use a standard Node.js image
FROM node:22-slim

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy project files
# Copy package.json and package-lock.json first to cache the install step
COPY package*.json ./

# 4. Install dependencies (This step now runs inside the container)
RUN npm install

# 5. Copy the rest of the application code
COPY . .

# 6. Expose the port your app listens on (Railway injects PORT env variable)
EXPOSE 3000

# 7. Define the command to start your application
# This is equivalent to running 'npm start' which runs 'node server.js'
CMD [ "npm", "start" ]
