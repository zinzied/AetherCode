# AetherCode ☁️

A powerful, modern web interface for discovering and interacting with free and open-source AI models. Built with React, Express, and SQLite.

## ✨ Key Features

- **Model Discovery**: Browse a scraped library of free models from OpenRouter and HuggingFace.
- **Full-Screen Chat Editor**: 
    - **Context-Aware**: Upload entire project folders to give the AI full context of your codebase.
    - **Auto-Edit**: The AI can propose code changes directly.
    - **Diff View**: Review changes line-by-line with red/green highlighting before applying.
    - **Permission System**: Choose between "Ask Mode" (safe) and "Always Allow" (fast) for edits.
- **Credit System**: 
    - Start with 100 free credits for standard models.
    - **Unlimited Free Use** for models marked as fully free.
- **Personal API Keys**: rigorous security—your keys are stored locally in your browser (`localStorage`) and never saved to our servers.

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/zinzied/AetherCode.git
    cd AetherCode
    ```

2.  **Setup Backend**
    ```bash
    cd backend
    npm install
    # Optional: Copy .env.example
    cp ../.env.example .env
    npm start
    ```

3.  **Setup Frontend**
    ```bash
    cd ../frontend
    npm install
    npm run dev
    ```

4.  **Open Browser**
    Visit `http://localhost:5173` to start chatting!

## 🔐 Privacy & Security

- **Local Storage**: Your API keys for OpenRouter/HuggingFace are stored only in your browser.
- **Direct Connection**: Keys are sent directly to the model provider via our lightweight proxy, never logged.
- **Project Files**: Uploaded files are processed in-memory for the session and are not permanently stored on the server.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite, Glassmorphism UI
- **Backend**: Express.js, SQLite (Better-SQLite3)
- **AI Integration**: OpenRouter API, HuggingFace

## 🤝 Contributing

Contributions are always welcome! Whether it's reporting bugs, suggesting features, or submitting a pull request, all contributions are welcome.

## ☕ Support

If you find this project helpful, consider buying me a coffee!

<a href="https://www.buymeacoffee.com/zied">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" width="210" />
</a>