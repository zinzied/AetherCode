import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';
import ProgressBar from './components/ProgressBar';
import ChatEditor from './components/ChatEditor';

interface Model {
  id: number;
  name: string;
  description: string;
  license: string;
  framework: string;
  task: string;
  category: string;
  github_url: string;
  huggingface_url: string;
  demo_url: string;
  stars: number;
  last_updated: string;
  source: string;
}

function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [progress, setProgress] = useState({ status: '', message: '', current: 0, total: 0 });
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [frameworkFilter, setFrameworkFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('');
  const [tokensFilter, setTokensFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'stars' | 'last_updated'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [view, setView] = useState<'library' | 'chat'>('library');
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [userKeys, setUserKeys] = useState({
    openrouter: localStorage.getItem('openrouter_api_key') || '',
    huggingface: localStorage.getItem('huggingface_api_key') || '',
    github: localStorage.getItem('github_api_key') || ''
  });
  const [credits, setCredits] = useState(() => {
    const saved = localStorage.getItem('user_credits');
    return saved ? parseInt(saved) : 100;
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    localStorage.setItem('openrouter_api_key', userKeys.openrouter);
    localStorage.setItem('huggingface_api_key', userKeys.huggingface);
    localStorage.setItem('github_api_key', userKeys.github);
  }, [userKeys]);

  useEffect(() => {
    localStorage.setItem('user_credits', credits.toString());
  }, [credits]);

  const fetchFilteredModels = () => {
    console.log('Fetching filtered models...');
    setLoading(true);
    const params = new URLSearchParams();
    if (searchTerm) params.append('search', searchTerm);
    if (frameworkFilter) params.append('framework', frameworkFilter);
    if (taskFilter) params.append('task', taskFilter);
    if (licenseFilter) params.append('license', licenseFilter);
    if (tokensFilter) params.append('tokens', tokensFilter);
    if (sourceFilter) params.append('source', sourceFilter);
    params.append('sortBy', sortBy);
    params.append('sortOrder', sortOrder);
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    axios.get(`http://localhost:3001/api/models?${params}`)
      .then(response => {
        console.log('Models fetched successfully:', response.data.models.length);
        setModels(response.data.models);
        setTotalCount(response.data.pagination.total);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching models:', error);
        setLoading(false);
      });
  };

  // Refetch when filters or page change
  useEffect(() => {
    fetchFilteredModels();
  }, [searchTerm, frameworkFilter, taskFilter, licenseFilter, tokensFilter, sourceFilter, sortBy, sortOrder, limit, page]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, frameworkFilter, taskFilter, licenseFilter, tokensFilter, sourceFilter, sortBy, sortOrder, limit]);

  useEffect(() => {
    fetchFilteredModels();
  }, []);

  const handleScrape = () => {
    setIsScrapingActive(true);
    setProgress({ status: 'started', message: 'Starting scraping...', current: 0, total: 0 });

    // Connect to WebSocket for progress updates
    wsRef.current = new WebSocket('ws://localhost:3001');

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.status === 'completed' || data.status === 'error') {
        setIsScrapingActive(false);
        wsRef.current?.close();
        console.log('Scraping completed, refreshing models...');
        setTimeout(() => {
          fetchFilteredModels(); // Add delay to ensure backend has finished writing to DB
        }, 1000);
      }
    };

    wsRef.current.onclose = () => {
      setIsScrapingActive(false);
    };

    // Start the scraping process
    axios.get('http://localhost:3001/api/scrape')
      .catch(error => {
        console.error('Error scraping:', error);
        setProgress({
          status: 'error',
          message: `Error: ${error.message}`,
          current: 0,
          total: 0
        });
        setIsScrapingActive(false);
      });
  };

  if (loading && models.length === 0) {
    return (
      <div className="loading-wrapper">
        <div className="spinner"></div>
        <p className="subtitle">Loading amazing models...</p>
      </div>
    );
  }

  if (view === 'chat' && selectedModel) {
    const activeKey =
      selectedModel.source === 'huggingface' ? userKeys.huggingface :
        selectedModel.source === 'github' ? userKeys.github :
          userKeys.openrouter;

    return (
      <ChatEditor
        model={selectedModel}
        apiKey={activeKey}
        credits={credits}
        setCredits={setCredits}
        onBack={() => setView('library')}
      />
    );
  }

  return (
    <div className={`app-container ${view === 'chat' ? 'full-screen-mode' : ''}`}>
      <header className="app-header">
        <div className="header-top">
          <div className="credit-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            {credits} Credits
          </div>
          <button className="btn-settings" onClick={() => setShowSettings(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
        <h1 className="title-gradient">AetherCode</h1>
        <p className="subtitle">Discover and integrate the world's best free AI models</p>
      </header>

      <div className="hero-actions">
        <button className="btn btn-primary" onClick={handleScrape} disabled={isScrapingActive}>
          {isScrapingActive ? (
            <>
              <span className="spinner-small"></span>
              Scraping...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Scrape New Models
            </>
          )}
        </button>
        <button className="btn btn-secondary" onClick={fetchFilteredModels} disabled={loading || isScrapingActive}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Library
        </button>
      </div>

      {isScrapingActive && (
        <div style={{ marginBottom: '3rem' }}>
          <ProgressBar
            progress={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
            status={progress.status}
            message={progress.message}
          />
        </div>
      )}

      {/* Filter Controls */}
      <section className="glass-pane filter-container">
        <div className="filter-group">
          <label className="filter-label">Search</label>
          <input
            type="text"
            className="input-styled"
            placeholder="Name, description, category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Framework</label>
          <select
            className="input-styled"
            value={frameworkFilter}
            onChange={(e) => setFrameworkFilter(e.target.value)}
          >
            <option value="">All Frameworks</option>
            <option value="transformers">Transformers</option>
            <option value="pytorch">PyTorch</option>
            <option value="tensorflow">TensorFlow</option>
            <option value="API">API</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Task</label>
          <select
            className="input-styled"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            <option value="">All Tasks</option>
            <option value="text-generation">Text Generation</option>
            <option value="text2text-generation">Text-to-Text</option>
            <option value="question-answering">Question Answering</option>
            <option value="summarization">Summarization</option>
            <option value="translation">Translation</option>
            <option value="image-text-to-text">Vision</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">License</label>
          <select
            className="input-styled"
            value={licenseFilter}
            onChange={(e) => setLicenseFilter(e.target.value)}
          >
            <option value="">All Licenses</option>
            <option value="mit">MIT</option>
            <option value="apache-2.0">Apache 2.0</option>
            <option value="bsd">BSD</option>
            <option value="cc-by">CC-BY</option>
            <option value="cc0">CC0</option>
            <option value="free">Free Inference (OpenRouter)</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Source</label>
          <select
            className="input-styled"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All Sources</option>
            <option value="huggingface">Hugging Face</option>
            <option value="github">GitHub</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Context</label>
          <select
            className="input-styled"
            value={tokensFilter}
            onChange={(e) => setTokensFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="8k">8K Tokens</option>
            <option value="32k">32K Tokens</option>
            <option value="128k">128K Tokens</option>
            <option value="200k">200K Tokens</option>
            <option value="M">1M+ Tokens</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Sort By</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              className="input-styled"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'stars' | 'last_updated')}
            >
              <option value="stars">Popularity</option>
              <option value="name">Name</option>
              <option value="last_updated">Freshness</option>
            </select>
            <button
              className="input-styled"
              style={{ width: 'auto', padding: '0.75rem' }}
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </section>

      <main>
        <p className="count-info">
          Found {totalCount} models &bull; Page {page} of {Math.ceil(totalCount / limit)}
        </p>

        {loading ? (
          <div className="loading-wrapper">
            <div className="spinner"></div>
          </div>
        ) : (
          <div className="model-grid">
            {models.map(model => (
              <div key={model.id} className="glass-pane model-card">
                <div className="model-header">
                  <h2 className="model-title">{model.name}</h2>
                  <div className="star-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                    {model.stars.toLocaleString()}
                  </div>
                </div>

                <p className="model-desc">{model.description}</p>

                <div className="tag-list">
                  <span className="tag">{model.framework}</span>
                  <span className="tag">{model.task}</span>
                  <span className="tag">{model.license}</span>
                </div>

                <div className="link-group">
                  <button
                    className="btn-chat-edit"
                    onClick={() => {
                      setSelectedModel(model);
                      setView('chat');
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    Chat & Edit
                  </button>
                  {model.huggingface_url && (
                    <a href={model.huggingface_url} target="_blank" className="link-item">
                      🤗 Hugging Face
                    </a>
                  )}
                  {model.github_url && (
                    <a href={model.github_url} target="_blank" className="link-item">
                      🐙 GitHub
                    </a>
                  )}
                  {model.demo_url && (
                    <a href={model.demo_url} target="_blank" className="link-item">
                      🚀 Live Demo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        <div className="pagination">
          <button
            className="page-btn"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            &larr; Previous
          </button>

          <div className="page-info">
            Page {page} of {Math.ceil(totalCount / limit)}
          </div>

          <button
            className="page-btn"
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(totalCount / limit)}
          >
            Next &rarr;
          </button>

          <select
            className="input-styled"
            style={{ width: 'auto' }}
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value));
              setPage(1);
            }}
          >
            <option value={12}>12 per page</option>
            <option value={24}>24 per page</option>
            <option value={48}>48 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="glass-pane modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header-box">
              <h2>Settings</h2>
              <button className="close-btn" onClick={() => setShowSettings(false)}>&times;</button>
            </div>
            <p className="modal-desc">Configure your personal API keys for model interaction.</p>

            <div className="form-group">
              <label className="filter-label">OpenRouter API Key</label>
              <input
                type="password"
                className="input-styled"
                placeholder="sk-or-v1-..."
                value={userKeys.openrouter}
                onChange={e => setUserKeys(prev => ({ ...prev, openrouter: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="filter-label">Hugging Face Token</label>
              <input
                type="password"
                className="input-styled"
                placeholder="hf_..."
                value={userKeys.huggingface}
                onChange={e => setUserKeys(prev => ({ ...prev, huggingface: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="filter-label">GitHub PAT (Token)</label>
              <input
                type="password"
                className="input-styled"
                placeholder="github_pat_..."
                value={userKeys.github}
                onChange={e => setUserKeys(prev => ({ ...prev, github: e.target.value }))}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowSettings(false)}>Save & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
