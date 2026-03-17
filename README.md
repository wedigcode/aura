# Aura (Automatic Update Retrieval Assistant)

Aura is a **local-first RAG (Retrieval-Augmented Generation) system** designed to give your AI assistants an "active memory" of your local documents.

It runs entirely locally, ensuring your data never leaves your network. It connects your plain text, markdown, and PDF files (`.txt`, `.md`, `.pdf`) to a ChromaDB vector database using Ollama for embeddings, and exposes that database to external AI clients (like Claude Desktop) via the Model Context Protocol (MCP).

## How It Works

Aura operates in two distinct parts:
1. **Background Sync Engine (Dockerized):** A continuous background service (`watcher.js`) monitors the `./documents` folder. Whenever you add, edit, or delete a file, it automatically chunks the text, pings your local Ollama instance for semantic embeddings, and syncs the vectors into ChromaDB.
2. **MCP Server (`mcp.js`):** A lightweight server that exposes standard Model Context Protocol tools. It allows any compatible AI (like Claude or Cursor) to query your synced knowledge base or even create/delete documents itself.

---

## 🚀 Setup & Installation

### 1. Prerequisites
- **Node.js** (v20+)
- **Docker** and **Docker Compose**
- **Ollama** running locally or on your LAN.

#### Recommended Models for RAG
**Small/Performant LLMs:**
- `gemma2:9b` (9b)
- `llama3-chatqa:latest` (8b)
- `llama3-gradient:latest` (8b)
- `command-r:latest` (35b)

**Embedding Models:**
- `qwen3-embedding:8b`
- `nomic-embed-text:latest`

### 2. Configuration
Clone the repository and install the required dependencies:
```bash
npm install
```

Copy the example environment variables and edit them to point to your specific Ollama host:
```bash
cp .env.example .env
```
Ensure your `.env` contains the correct IP address for your Ollama instance and the directory where you want to store your documents:
```env
AURA_DIR=./documents
OLLAMA_HOST=http://your_ollama_ip:11434
CHROMA_URL=http://localhost:8000
LLM_MODEL=llama3-chatqa:latest
EMBED_MODEL=nomic-embed-text:latest
AURA_DEBUG_OLLAMA=true
```

### 3. Start the Engine
Aura's sync engine and ChromaDB vector database run seamlessly in the background via Docker. Run this command in your terminal from the `aura` directory:

```bash
docker-compose up -d --build
```

You can watch the sync engine working in real-time by viewing its logs:
```bash
docker logs aura-aura-1 -f
```

---

## 🌎 Standalone Service (Use in Any Project)
You don't need to clone this repo to run Aura! You can easily add it as a stand-alone background service in **any project** using the pre-built `wedigcode/aura:latest` Docker image.

Just drop this `docker-compose.yml` into your project root:

```yaml
version: '3.9'

services:
  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - ${AURA_DIR:-./documents}/.aura/chroma_data:/chroma/chroma
    environment:
      - IS_PERSISTENT=TRUE

  aura:
    image: wedigcode/aura:latest
    container_name: aura
    depends_on:
      - chromadb
    volumes:
      - ${AURA_DIR:-./documents}:/usr/src/app/documents 
    environment:
      - CHROMA_URL=http://chromadb:8000
      - OLLAMA_HOST=http://your_ollama_ip:11434    # Replace with your Ollama IP
      - LLM_MODEL=llama3-chatqa:latest          # Your chosen LLM
      - EMBED_MODEL=nomic-embed-text:latest            # Your chosen Embedder
    restart: unless-stopped
```

Then, specify where you want Aura to live by creating a `.env` file next to your `docker-compose.yml`:
```env
AURA_DIR=~/Documents/Cowork
OLLAMA_HOST=http://your_ollama_ip:11434
```

Run `docker-compose up -d`. You can now drop any `.txt`, `.md`, or `.pdf` file into your `AURA_DIR` and it'll instantly embed it using your Ollama instance! (Aura will privately store its database in a hidden `.aura` folder within that directory).

---

## 💡 Usage

### Adding Documents
Drop any `.txt`, `.md`, or `.pdf` files into the local `./documents` folder. The background Docker container will automatically detect them, extract the text, slice them up, send them to your Ollama node for embedding, and save the vectors to ChromaDB.

### Connecting to AI Clients (MCP)
`mcp.js` is the gateway that allows external AI assistants to query the local database. You can connect to it in two ways.

#### Option A: Native Docker (No Node.js Required)
Since Aura is already running as a Docker container, you can wire your AI client to execute the MCP server directly inside the running container using `docker exec`. 

Open your `claude_desktop_config.json` (usually located at `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac) and add:

```json
{
  "mcpServers": {
    "aura": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "aura",
        "node",
        "mcp.js"
      ]
    }
  }
}
```

#### Option B: Local Node.js
If you have Node.js installed locally and prefer to run the script from your host machine, you can point your AI client directly to the absolute path of `mcp.js`. Make sure to provide the necessary `env` variables so the script knows where to locate your ChromaDB instance and files:

```json
{
  "mcpServers": {
    "aura": {
      "command": "node",
      "args": [
        "/absolute/path/to/aura/mcp.js"
      ],
      "env": {
        "AURA_DIR": "/absolute/path/to/documents",
        "OLLAMA_HOST": "http://your_ollama_ip:11434",
        "CHROMA_URL": "http://localhost:8000",
        "LLM_MODEL": "llama3-chatqa:latest",
        "EMBED_MODEL": "nomic-embed-text:latest",
        "AURA_DEBUG_OLLAMA": "true"
      }
    }
  }
}
```

Once you restart Claude Desktop, it will have access to context-aware local memory!

### Available MCP Tools
When connected via MCP, your AI assistant will have access to four core tools:
- `query_aura(query, [project])`: Searches ChromaDB for semantic context within your documents. You can optionally pass a `project` name to restrict the search to a specific subdirectory (e.g., `project: "antigravity"`).
- `read_aura_file(filename)`: Reads a full document from the local directory. (e.g., `antigravity/spec.md`).
- `write_aura_file(filename, content)`: Creates or updates a document natively supporting sub-directories (automatically triggering the sync engine).
- `delete_aura_file(filename)`: Deletes a document (automatically triggering the sync engine vector cleanup).

---

## Technical Stack
* **Runtime:** Node.js (v20+)
* **File Watcher:** `chokidar`
* **Inference Engine:** Ollama / Langchain SDK
* **Vector Database:** ChromaDB (Local Persistent container)
* **API Standard:** Model Context Protocol (`@modelcontextprotocol/sdk`)
