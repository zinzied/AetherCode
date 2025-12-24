import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import fs from 'fs';
import { createServer } from 'http';
import axios from 'axios';
import { scrapeModels } from './scraper';
import { setupWebSocket } from './websocket';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const db = new Database('models.db');
const schema = fs.readFileSync('schema.sql', 'utf8');
db.exec(schema);

app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

app.get('/api/models', async (req, res) => {
  try {
    // Build dynamic query with filters
    let whereClause = 'WHERE 1=1';
    const whereParams: any[] = [];
    let selectParams: any[] = [];

    // Search filter (name, description, category)
    const search = req.query.search as string;
    if (search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ? OR category LIKE ?)';
      whereParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      selectParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Framework filter
    const framework = req.query.framework as string;
    if (framework) {
      whereClause += ' AND framework = ?';
      whereParams.push(framework);
      selectParams.push(framework);
    }

    // Task filter
    const task = req.query.task as string;
    if (task) {
      whereClause += ' AND task = ?';
      whereParams.push(task);
      selectParams.push(task);
    }

    // License filter
    const license = req.query.license as string;
    if (license === 'free') {
      whereClause += " AND (license = 'free' OR source = 'huggingface' OR source = 'github')";
    } else if (license) {
      whereClause += ' AND license = ?';
      whereParams.push(license);
      selectParams.push(license);
    }

    // Tokens/Context filter (for OpenRouter models)
    const tokens = req.query.tokens as string;
    if (tokens) {
      whereClause += ' AND category LIKE ?';
      whereParams.push(`%${tokens}%`);
      selectParams.push(`%${tokens}%`);
    }

    // Source filter
    const source = req.query.source as string;
    if (source) {
      whereClause += ' AND source = ?';
      whereParams.push(source);
      selectParams.push(source);
    }

    // Sorting
    const sortBy = (req.query.sortBy as string) || 'name';
    const sortOrder = (req.query.sortOrder as string) || 'ASC';
    const validSortColumns = ['name', 'stars', 'last_updated'];
    const isValidSort = validSortColumns.includes(sortBy);
    const orderBy = ` ORDER BY ${isValidSort ? sortBy : 'name'} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Main query
    let query = `SELECT * FROM models ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    selectParams.push(limit, offset);

    const stmt = db.prepare(query);
    const models = stmt.all(selectParams);

    // Count query for pagination
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM models ${whereClause}`);
    const countResult = countStmt.get(whereParams as any[]) as { total: number };

    res.json({
      models,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit),
        hasNext: page < Math.ceil(countResult.total / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Chat proxy for models
app.post('/api/chat', async (req, res) => {
  const { model, messages, apiKey, source } = req.body;
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'model and messages (array) required' });
  }

  // Handle Hugging Face Models
  if (source === 'huggingface') {
    const effectiveApiKey = apiKey || process.env.HUGGINGFACE_API_KEY;
    if (!effectiveApiKey) {
      return res.status(401).json({ error: 'Hugging Face API token required. Please add it in Settings.' });
    }

    try {
      // Use the new standardized router endpoint
      const response = await axios.post(`https://router.huggingface.co/v1/chat/completions`, {
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${effectiveApiKey}`,
          'Content-Type': 'application/json',
          'x-wait-for-model': 'true'
        },
      });

      return res.json(response.data);
    } catch (error: any) {
      console.error('HF Chat error:', error.response?.data || error.message);
      return res.status(error.response?.status || 500).json({
        error: 'Hugging Face API error',
        details: error.response?.data?.error || error.message
      });
    }
  }

  // Handle GitHub Models (OpenAI-compatible)
  if (source === 'github') {
    const effectiveApiKey = apiKey || process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY;
    if (!effectiveApiKey) {
      return res.status(401).json({ error: 'GitHub Personal Access Token required. Please add it in Settings.' });
    }

    try {
      const response = await axios.post('https://models.inference.ai.azure.com/chat/completions', {
        model,
        messages,
      }, {
        headers: {
          'Authorization': `Bearer ${effectiveApiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return res.json(response.data);
    } catch (error: any) {
      console.error('GitHub Models error:', error.response?.data || error.message);
      return res.status(error.response?.status || 500).json({
        error: 'GitHub Models API error',
        details: error.response?.data?.error?.message || error.message
      });
    }
  }

  // Default: OpenRouter Logic
  const effectiveApiKey = apiKey || process.env.OPENROUTER_API_KEY;

  if (!effectiveApiKey) {
    return res.status(401).json({ error: 'API key required. Please add your key in Settings.' });
  }

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model,
      messages,
    }, {
      headers: {
        'Authorization': `Bearer ${effectiveApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://freeaimodels.com',
        'X-Title': 'AetherCode',
      },
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Chat error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Chat API error',
      details: error.response?.data || error.message
    });
  }
});

app.get('/api/scrape', async (req, res) => {
  try {
    const result = await scrapeModels();
    res.json({ message: 'Scraping completed', count: result.count });
  } catch (error: any) {
    console.error('Error during scraping:', error);
    res.status(500).json({
      error: 'Scraping failed',
      details: error.message || 'Unknown error occurred'
    });
  }
});

const server = createServer(app);
setupWebSocket(server);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});