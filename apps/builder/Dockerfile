FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# For development, we use the vite dev server
CMD ["npm", "run", "dev", "--", "--host"]
