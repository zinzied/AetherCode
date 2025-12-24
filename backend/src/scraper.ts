import axios from 'axios';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

interface HuggingFaceModel {
  id: string;
  description?: string;
  license?: string;
  library_name?: string;
  pipeline_tag?: string;
  tags?: string[];
  github_url?: string;
  demo_url?: string;
  downloads?: number;
  lastModified?: string;
}

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string | number;
  };
  type?: string;
  context_length?: number;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

const db = new Database('models.db');
export const scraperEvents = new EventEmitter();

async function scrapeHuggingFace(): Promise<HuggingFaceModel[]> {
  const response = await axios.get<HuggingFaceModel[]>('https://huggingface.co/api/models', {
    params: {
      limit: 100,
      sort: 'downloads',
      direction: -1,
    },
  });

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid response from HuggingFace API');
  }

  return response.data.filter(model => {
    // Accept models with no license (undefined) or with open licenses
    if (!model.license) return true;
    const allowedLicenses = ['mit', 'apache-2.0', 'bsd', 'cc-by', 'cc0', 'other', 'unknown'];
    return allowedLicenses.includes(model.license.toLowerCase());
  });
}

function formatContext(tokens: number): string {
  if (tokens >= 1000000) {
    return Math.floor(tokens / 1000000) + 'M';
  } else if (tokens >= 1000) {
    return Math.floor(tokens / 1024) + 'k';
  }
  return tokens.toString();
}

async function scrapeOpenRouter(): Promise<OpenRouterModel[]> {
  try {
    const response = await axios.get<OpenRouterResponse>('https://openrouter.ai/api/v1/models');
    if (!response.data || !Array.isArray(response.data.data)) {
      return [];
    }
    return response.data.data.filter(model => {
      // Include only truly free models (prompt = 0)
      if (!model.pricing) return false;
      const promptValue = typeof model.pricing.prompt === 'string'
        ? parseFloat(model.pricing.prompt)
      : model.pricing.prompt;
      return promptValue === 0;
    });
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return [];
  }
}

export async function scrapeModels(): Promise<{ count: number }> {
  try {
    console.log('Starting model scraping...');
    scraperEvents.emit('progress', { status: 'started', message: 'Starting model scraping...' });
    
    // Fetch models from both sources
    scraperEvents.emit('progress', { status: 'fetching', message: 'Fetching models from HuggingFace...' });
    const huggingFaceModels = await scrapeHuggingFace();
    
    scraperEvents.emit('progress', { status: 'fetching', message: 'Fetching models from OpenRouter...' });
    const openRouterModels = await scrapeOpenRouter();
    
    scraperEvents.emit('progress', { 
      status: 'processing',
      message: `Processing ${huggingFaceModels.length + openRouterModels.length} models...`
    });
    
    let count = 0;
    
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO models (
        name, description, license, framework, task, category,
        github_url, huggingface_url, demo_url, stars, last_updated, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Clear existing HuggingFace models to avoid duplicates
    db.prepare('DELETE FROM models WHERE source = ?').run('huggingface');
    
    // Process HuggingFace models
    for (const model of huggingFaceModels) {
      try {
        const result = insertStmt.run(
          model.id,
          model.description || '',
          model.license || '',
          model.library_name || '',
          model.pipeline_tag || '',
          model.tags ? model.tags.join(',') : '',
          model.github_url || '',
          `https://huggingface.co/${model.id}`,
          model.demo_url || '',
          model.downloads || 0,
          model.lastModified || null,
          'huggingface'
        );
        
        if (result.changes > 0) {
          count++;
          scraperEvents.emit('progress', {
            status: 'processing',
            message: `Added ${count} models...`,
            current: count,
            total: huggingFaceModels.length + openRouterModels.length
          });
        }
      } catch (dbError) {
        console.error(`Error inserting HuggingFace model ${model.id}:`, dbError);
      }
    }

    // Clear existing OpenRouter models to avoid duplicates
    db.prepare('DELETE FROM models WHERE source = ?').run('openrouter');
    
    // Process OpenRouter models
    for (const model of openRouterModels) {
      try {
        const result = insertStmt.run(
          model.id,
          model.description || '',
          'free', // OpenRouter free models
          'API',
          model.type || '',
          model.context_length ? formatContext(model.context_length) : '',
          '',
          '',
          `https://openrouter.ai/models/${model.id}`,
          0,
          new Date().toISOString(),
          'openrouter'
        );
        
        if (result.changes > 0) {
          count++;
          scraperEvents.emit('progress', {
            status: 'processing',
            message: `Added ${count} models...`,
            current: count,
            total: huggingFaceModels.length + openRouterModels.length
          });
        }
      } catch (dbError) {
        console.error(`Error inserting OpenRouter model ${model.id}:`, dbError);
      }
    }
    
    scraperEvents.emit('progress', { 
      status: 'completed',
      message: `Scraping completed. Added ${count} new models.`,
      current: huggingFaceModels.length + openRouterModels.length,
      total: huggingFaceModels.length + openRouterModels.length
    });
    
    console.log(`Scraping completed. Added ${count} new models.`);
    return { count };
  } catch (error) {
    console.error('Scraping error:', error);
    scraperEvents.emit('progress', { 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      current: 0,
      total: 0
    });
    throw error;
  }
}