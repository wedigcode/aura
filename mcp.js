import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ChromaClient } from 'chromadb';
import { Ollama } from 'ollama';
import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';

dotenv.config();

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const COLLECTION_NAME = 'aura_docs';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text:latest';
const DOCUMENTS_DIR = path.resolve('./documents');

const chroma = new ChromaClient({ path: CHROMA_URL });
const ollama = new Ollama({ host: OLLAMA_HOST });

// Custom Embedder for ChromaDB using Ollama
const ollamaEmbedder = {
    generate: async (texts) => {
        const embeddings = [];
        for (const text of texts) {
            const response = await ollama.embeddings({
                model: EMBED_MODEL,
                prompt: text
            });
            embeddings.push(response.embedding);
        }
        return embeddings;
    }
};

const server = new Server(
    {
        name: "aura-mcp",
        version: "1.0.0",
        description: "Aura RAG Vector Database integration",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define the available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "query_aura",
                description: "Query the Aura local RAG vector database for semantic context based on a question or query string. Returns the most relevant text chunks from the user's local documents.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query, question, or topic to look up in the local database.",
                        },
                        results_count: {
                            type: "number",
                            description: "The maximum number of semantic chunks to return. Defaults to 5. Keep this low if token limits are a concern.",
                            default: 5
                        }
                    },
                    required: ["query"],
                },
            },
            {
                name: "read_aura_file",
                description: "Read the full text content of a document stored in the Aura knowledge base.",
                inputSchema: {
                    type: "object",
                    properties: {
                        filename: {
                            type: "string",
                            description: "The name of the file to read (e.g., 'sample.md', 'book.pdf').",
                        }
                    },
                    required: ["filename"],
                },
            },
            {
                name: "write_aura_file",
                description: "Create or update a document in the Aura knowledge base. This will trigger the background watcher to ingest and vectorize the new content.",
                inputSchema: {
                    type: "object",
                    properties: {
                        filename: {
                            type: "string",
                            description: "The name of the file to create or update (e.g., 'notes.md').",
                        },
                        content: {
                            type: "string",
                            description: "The text or markdown content to write to the file.",
                        }
                    },
                    required: ["filename", "content"],
                },
            },
            {
                name: "delete_aura_file",
                description: "Delete a document from the Aura knowledge base. This will trigger the background watcher to remove its vectors from ChromaDB.",
                inputSchema: {
                    type: "object",
                    properties: {
                        filename: {
                            type: "string",
                            description: "The name of the file to delete (e.g., 'outdated.txt').",
                        }
                    },
                    required: ["filename"],
                },
            }
        ],
    };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments;
    
    // Ensure documents directory exists before any file operations
    await fs.ensureDir(DOCUMENTS_DIR);

    if (request.params.name === "query_aura") {
        if (!args || typeof args.query !== "string") {
            throw new Error("Invalid arguments: query must be a string");
        }

        const query = args.query;
        const nResults = typeof args.results_count === "number" ? args.results_count : 5;

        try {
            const collection = await chroma.getCollection({ 
                name: COLLECTION_NAME,
                embeddingFunction: ollamaEmbedder
            });
            
            const results = await collection.query({
                queryTexts: [query],
                nResults: nResults
            });

            const documents = results.documents[0];
            const metadatas = results.metadatas[0];

            if (!documents || documents.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "No relevant context found in the local Aura documents for this query."
                    }],
                };
            }

            let contextText = "--- BEGIN AURA LOCAL CONTEXT ---\n";
            for (let i = 0; i < documents.length; i++) {
                contextText += `[Source: ${metadatas[i].source}]\n${documents[i]}\n\n`;
            }
            contextText += "--- END AURA LOCAL CONTEXT ---\n";

            return {
                content: [{ type: "text", text: contextText }],
            };

        } catch (error) {
            return {
                content: [{ type: "text", text: `[!] Error querying Aura database: ${error.message || error}` }],
                isError: true,
            };
        }
    }

    if (request.params.name === "read_aura_file") {
        if (!args || typeof args.filename !== "string") throw new Error("Invalid arguments: filename required");
        
        const filePath = path.join(DOCUMENTS_DIR, path.basename(args.filename));
        try {
            const ext = path.extname(filePath).toLowerCase();
            let content = '';
            if (ext === '.pdf') {
                const dataBuffer = await fs.readFile(filePath);
                const pdfData = await pdfParse(dataBuffer);
                content = pdfData.text;
            } else {
                content = await fs.readFile(filePath, 'utf-8');
            }
            return { content: [{ type: "text", text: content }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error reading file: ${error.message}` }], isError: true };
        }
    }

    if (request.params.name === "write_aura_file") {
        if (!args || typeof args.filename !== "string" || typeof args.content !== "string") {
            throw new Error("Invalid arguments: filename and content required");
        }
        
        const filePath = path.join(DOCUMENTS_DIR, path.basename(args.filename));
        try {
            await fs.writeFile(filePath, args.content, 'utf-8');
            return { content: [{ type: "text", text: `File successfully saved to ${filePath}. The Aura watcher will now index it.` }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error writing file: ${error.message}` }], isError: true };
        }
    }

    if (request.params.name === "delete_aura_file") {
        if (!args || typeof args.filename !== "string") throw new Error("Invalid arguments: filename required");
        
        const filePath = path.join(DOCUMENTS_DIR, path.basename(args.filename));
        try {
            await fs.remove(filePath);
            return { content: [{ type: "text", text: `File successfully deleted from ${filePath}. The Aura watcher will remove its vectors.` }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error deleting file: ${error.message}` }], isError: true };
        }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Aura MCP server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error in MCP server:", error);
    process.exit(1);
});
