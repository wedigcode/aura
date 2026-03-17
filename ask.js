import { ChromaClient } from 'chromadb';
import { Ollama } from 'ollama';
import * as dotenv from 'dotenv';

dotenv.config();

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const COLLECTION_NAME = 'aura_docs';
const LLM_MODEL = process.env.LLM_MODEL || 'llama3-chatqa:latest';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text:latest';

const chroma = new ChromaClient({ path: CHROMA_URL });
const ollama = new Ollama({ host: OLLAMA_HOST });

// Custom Embedder for ChromaDB using Ollama
const ollamaEmbedder = {
    generate: async (texts) => {
        const embeddings = [];
        for (const text of texts) {
            if (process.env.AURA_DEBUG_OLLAMA === 'true') {
                console.log(`[Aura Debug] Generating embedding (model: ${EMBED_MODEL}) for text: ${text.substring(0, 100)}...`);
            }
            const response = await ollama.embeddings({
                model: EMBED_MODEL,
                prompt: text
            });
            if (process.env.AURA_DEBUG_OLLAMA === 'true') {
                console.log(`[Aura Debug] Ollama embedding response received.`);
            }
            embeddings.push(response.embedding);
        }
        return embeddings;
    }
};

async function askAura(question) {
    if (!question) {
        console.error("Please provide a question.");
        console.log('Usage: node ask.js "Your question here"');
        process.exit(1);
    }

    try {
        console.log(`[Aura]: Searching local documents for Context...`);
        const collection = await chroma.getCollection({ 
            name: COLLECTION_NAME,
            embeddingFunction: ollamaEmbedder
        });
        
        const results = await collection.query({
            queryTexts: [question],
            nResults: 5 // Retrieve the top 5 most relevant chunks
        });

        const documents = results.documents[0]; // documents from the first array element
        const metadatas = results.metadatas[0]; // matching metadata

        if (!documents || documents.length === 0) {
            console.log(`[Aura]: I couldn't find any relevant context in your local documents.`);
            process.exit(0);
        }

        // Combine the retrieved context into a single string
        let contextText = "--- BEGIN CONTEXT ---\n";
        for (let i = 0; i < documents.length; i++) {
            contextText += `[Source: ${metadatas[i].source}]\n${documents[i]}\n\n`;
        }
        contextText += "--- END CONTEXT ---\n";

        const systemPrompt = `You are Aura, an Automatic Update Retrieval Assistant. You answer questions based ONLY on the provided context retrieved from the user's local files. 
If the answer is not in the context, state clearly that you don't know and do not attempt to make up an answer.
When answering, it's helpful to cite the source file if it makes sense.
${contextText}`;

        console.log(`[Aura]: Generating answer...\n`);

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
        ];

        if (process.env.AURA_DEBUG_OLLAMA === 'true') {
            console.log(`[Aura Debug] Generating chat completion (model: ${LLM_MODEL})`);
            console.log(`[Aura Debug] Request Messages:\n${JSON.stringify(messages, null, 2)}`);
        }

        const response = await ollama.chat({
            model: LLM_MODEL,
            messages: messages,
            stream: true // Stream the response for a better UX
        });

        for await (const part of response) {
            if (process.env.AURA_DEBUG_OLLAMA === 'true') {
                process.stdout.write(`\n[Aura Debug] Stream part: ${JSON.stringify(part)}\n`);
            } else {
                process.stdout.write(part.message.content);
            }
        }
        console.log('\n'); // Append a newline when done

    } catch (error) {
        console.error("\n[!] Error running query. Make sure the watcher has ingested documents and ChromaDB is running.");
        console.error(error.message || error);
    }
}

// Get the user question from the CLI arguments
const userQuestion = process.argv.slice(2).join(" ");
askAura(userQuestion);
