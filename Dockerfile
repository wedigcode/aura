FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY watcher.js mcp.js ./

CMD ["sh", "-c", "node watcher.js & MCP_PORT=8001 node mcp.js"]
