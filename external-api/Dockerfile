# External Todo API (Express + node:sqlite). Node 24 ships SQLite as stable.
FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4000
ENV PORT=4000
CMD ["npm", "start"]
