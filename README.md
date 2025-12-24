# AetherCode ☁️

**Modern. Glassmorphic. Free.**  
Turn your browser into a powerful AI-driven code editor using free test models from the world's top providers.

---

## ✨ Key Features

- **Multi-Provider Library**: Discover and chat with thousands of models from **OpenRouter**, **Hugging Face**, and the **GitHub Models Marketplace**.
- **Universal Free Filter**: One-click access to **"Free Inference (All Providers)"**, surfacing every cost-free model across all platforms.
- **Premium Glassmorphism UI**: A stunning, modern interface with background blur, liquid gradients, and smooth animations for a distraction-free coding experience.
- **Full-Screen Chat Editor**: 
    - **Context-Aware**: Upload entire project folders to give the AI full context of your codebase.
    - **Auto-Edit**: High-precision AI code projections that can update your files instantly.
    - **Visual Diff View**: Review every change line-by-line with professional red/green highlighting.
    - **Safe & Fast**: Toggle between "Ask Mode" (manual review) and "Always Allow" (turbo speed).
- **Infinite Creativity**: 
    - Start with 100 base credits.
    - **Unlimited Use** for all models marked as "Free" or when using your own API keys.
- **Security-First**: Your API keys are stored strictly in your browser's `localStorage` and sent over a secure local proxy. **Your tokens never touch our database.**

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (Recommended)
- **Local Environment**: Windows/Mac/Linux

### Professional One-Click Start
Use the included batch script to bootstrap everything at once:
```powershell
./start-platform.bat
```

### Manual Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/zinzied/AetherCode.git
    cd AetherCode
    ```

2.  **Setup Backend**
    ```bash
    cd backend
    npm install
    npm start
    ```

3.  **Setup Frontend**
    ```bash
    cd ../frontend
    npm install
    npm run dev
    ```

4.  **Open AetherCode**
    Visit `http://localhost:5173` and add your **Hugging Face Token**, **GitHub PAT**, or **OpenRouter Key** in Settings to unlock the full power.

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS (Glassmorphism Tier)
- **Backend**: Node.js, Express, SQLite (Better-SQLite3)
- **AI Infrastructure**: 
  - **OpenRouter API** (Unified gateway)
  - **Hugging Face Router** (Serverless inference)
  - **Azure AI Inference** (GitHub Models)

---

## 🤝 Contributing

Contributions are what make the open-source community an amazing place to learn, inspire, and create. Whether it's reporting bugs, suggesting features, or submitting a pull request, all contributions are **greatly appreciated**.

## ☕ Support

If you find this project helpful, consider buying me a coffee!

<a href="https://www.buymeacoffee.com/zied">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" width="210" />
</a>