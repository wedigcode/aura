FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY watcher.js mcp.js ./

CMD ["node", "watcher.js"]
