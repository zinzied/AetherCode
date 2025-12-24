import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

interface FileNode {
    name: string;
    path: string;
    kind: 'file' | 'directory';
    content?: string;
    children?: FileNode[];
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface DiffLine {
    type: 'added' | 'removed' | 'unchanged';
    content: string;
}

interface ChatEditorProps {
    model: any;
    apiKey: string;
    credits: number;
    setCredits: (credits: number | ((prev: number) => number)) => void;
    onBack: () => void;
}

const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.vite'];
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB limit for editor

export default function ChatEditor({ model, apiKey, credits, setCredits, onBack }: ChatEditorProps) {
    const [files, setFiles] = useState<FileNode[]>([]);
    const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
    const [editContent, setEditContent] = useState('');
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showScrollButton, setShowScrollButton] = useState(false);

    // Auto-Edit State
    const [autoEditMode, setAutoEditMode] = useState<'ask' | 'always'>(() => {
        return (localStorage.getItem('auto_edit_mode') as 'ask' | 'always') || 'ask';
    });
    const [pendingCode, setPendingCode] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Persist auto edit mode
    useEffect(() => {
        localStorage.setItem('auto_edit_mode', autoEditMode);
    }, [autoEditMode]);

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
            setShowScrollButton(false);
        }
    };

    const handleScroll = () => {
        if (chatContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
            setShowScrollButton(!isNearBottom);
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages, isTyping]);

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFiles = e.target.files;
        if (!uploadedFiles || uploadedFiles.length === 0) return;

        setIsUploading(true);
        try {
            const root: FileNode[] = [];

            for (let i = 0; i < uploadedFiles.length; i++) {
                const file = uploadedFiles[i];
                const relativePath = file.webkitRelativePath || file.name;
                const pathParts = relativePath.split('/').filter(p => p !== '');

                // Skip excluded directories
                if (pathParts.some(part => EXCLUDED_DIRS.includes(part))) continue;

                let currentLevel = root;
                let currentPath = '';

                for (let j = 0; j < pathParts.length; j++) {
                    const part = pathParts[j];
                    currentPath += (currentPath ? '/' : '') + part;
                    const kind = j === pathParts.length - 1 ? 'file' : 'directory';

                    let node = currentLevel.find(n => n.name === part);
                    if (!node) {
                        node = {
                            name: part,
                            path: currentPath,
                            kind,
                            children: kind === 'directory' ? [] : undefined
                        };
                        currentLevel.push(node);
                        if (kind === 'file') {
                            if (file.size > MAX_FILE_SIZE) {
                                node.content = `[File too large to display: ${(file.size / 1024 / 1024).toFixed(2)}MB]`;
                            } else {
                                node.content = await file.text();
                            }
                        }
                    }
                    if (kind === 'directory') {
                        currentLevel = node.children!;
                    }
                }

                // Yield to UI thread every 50 files
                if (i % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            setFiles([...root]);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload files. Please try again.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleFileClick = (node: FileNode) => {
        if (node.kind === 'file') {
            setSelectedFile(node);
            setEditContent(node.content || '');
        }
    };

    const generateProjectContext = (nodes: FileNode[]): string => {
        let structure = "PROJECT STRUCTURE:\n";
        let contentOverview = "\nFILE CONTENTS:\n";
        let totalContextLength = 0;
        const CONTEXT_LIMIT = 50000; // Total character limit for all file contents in context

        const walk = (items: FileNode[], depth: number) => {
            items.forEach(node => {
                structure += "  ".repeat(depth) + (node.kind === 'directory' ? '📁 ' : '📄 ') + node.name + "\n";

                if (node.kind === 'file' && node.content && totalContextLength < CONTEXT_LIMIT) {
                    const snippet = node.content.length > 5000 ? node.content.substring(0, 5000) + "... [truncated]" : node.content;
                    contentOverview += `\n--- START FILE: ${node.path} ---\n${snippet}\n--- END FILE: ${node.path} ---\n`;
                    totalContextLength += snippet.length;
                }

                if (node.children) walk(node.children, depth + 1);
            });
        };

        walk(nodes, 0);
        return structure + contentOverview;
    };

    const extractCodeFromMessage = (content: string): string | null => {
        // Look for the last code block (assuming it's the final solution)
        const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
        let match;
        let lastCode = null;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            lastCode = match[1];
        }
        return lastCode ? lastCode.trim() : null;
    };

    // Simple line-based diff algorithm
    const computeDiff = (oldText: string, newText: string): DiffLine[] => {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const diff: DiffLine[] = [];

        let i = 0;
        let j = 0;

        while (i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                diff.push({ type: 'unchanged', content: oldLines[i] });
                i++;
                j++;
            } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) {
                diff.push({ type: 'added', content: newLines[j] });
                j++;
            } else if (i < oldLines.length) {
                diff.push({ type: 'removed', content: oldLines[i] });
                i++;
            }
        }
        return diff;
    };

    const applyEdit = (code: string) => {
        if (!selectedFile) return;

        // Update file content in memory
        const newFiles = [...files];
        const updateNode = (nodes: FileNode[]) => {
            for (const node of nodes) {
                if (node.path === selectedFile.path) {
                    node.content = code;
                    return true;
                }
                if (node.children && updateNode(node.children)) return true;
            }
            return false;
        };
        updateNode(newFiles);
        setFiles(newFiles);

        // Update editor view
        setEditContent(code);
        setPendingCode(null); // Clear pending

        // Visual feedback
        setChatMessages(prev => [...prev, { role: 'assistant', content: '✅ Code updated successfully.' }]);
    };

    const handleSendMessage = async () => {
        if (!chatInput.trim()) return;

        // Credit check
        const isFullFree = model.name.toLowerCase().includes('free') || model.license?.toLowerCase() === 'free';
        if (!isFullFree && credits <= 0) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'You have run out of credits. Please use a "full free" model or add your own API key in Settings.' }]);
            return;
        }

        const newMessage: ChatMessage = { role: 'user', content: chatInput };
        setChatMessages(prev => [...prev, newMessage]);
        setChatInput('');
        setIsTyping(true);

        const projectContext = files.length > 0 ? generateProjectContext(files) : "";

        // Limit context messages to last 10 to prevent massive payloads
        const recentHistory = chatMessages.slice(-10);
        const contextMessages = [...recentHistory, newMessage];

        if (projectContext) {
            contextMessages.unshift({
                role: 'user',
                content: `PROJECT ARCHITECTURE & SOURCE CODE:\n${projectContext}\n\nINSTRUCTIONS: Read the above project context carefully. You are an expert developer. Answer questions strictly based on this project. If files are truncated, acknowledge it.`
            });
        }

        if (selectedFile) {
            contextMessages.push({
                role: 'user',
                content: `NOTE: The user is currently focusing on this specific file: "${selectedFile.path}".`
            });
        }

        try {
            const response = await axios.post('http://localhost:3001/api/chat', {
                model: model.name.includes('(free)') ? model.name.split(' ')[0] : model.name,
                messages: contextMessages,
                apiKey: apiKey
            });

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response.data.choices[0].message.content
            };
            setChatMessages(prev => [...prev, assistantMessage]);

            // Auto-Edit Logic
            const extractedCode = extractCodeFromMessage(assistantMessage.content);
            if (extractedCode && selectedFile) {
                if (autoEditMode === 'always') {
                    applyEdit(extractedCode);
                } else {
                    setPendingCode(extractedCode);
                }
            }

            // Consume credit if not full free
            if (!isFullFree) {
                setCredits(prev => prev - 1);
            }
        } catch (error: any) {
            console.error('Chat error:', error);

            let status = 0;
            let errorMsg = 'Unknown error occurred';

            if (error.response) {
                status = error.response.status;
                // Try to extract message from various common API error structures
                errorMsg = error.response.data?.error?.message ||
                    error.response.data?.details?.error?.message ||
                    error.response.data?.error ||
                    error.message;
            } else if (error.request) {
                errorMsg = "Network Error: Could not connect to the server. Please ensure the backend is running.";
            } else {
                errorMsg = error.message;
            }

            if (status === 429) {
                errorMsg = "Too Many Requests (Rate Limited). " +
                    (apiKey ? "Your personal API key has reached its limit." : "The shared API key is rate-limited. Please add your own API key in Settings to continue.");
            } else if (status === 401) {
                errorMsg = "Unauthorized. Please check your API key in Settings.";
            }

            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMsg}` }]);
        } finally {
            setIsTyping(false);
        }
    };

    const renderFileTree = (nodes: FileNode[]) => {
        return (
            <ul className="file-tree">
                {nodes.map(node => (
                    <li key={node.path} className={`file-node ${node.kind}`}>
                        <div
                            className={`node-label ${selectedFile?.path === node.path ? 'selected' : ''}`}
                            onClick={() => handleFileClick(node)}
                        >
                            {node.kind === 'directory' ? '📁' : '📄'} {node.name}
                        </div>
                        {node.children && node.children.length > 0 && renderFileTree(node.children)}
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className="chat-editor-container">
            {/* SIDEBAR: File Explorer */}
            <aside className="editor-sidebar">
                <div className="sidebar-header">
                    <button className="btn-back" onClick={onBack}>← Back</button>
                    <h3>Explorer</h3>
                    <button className="btn-upload" onClick={() => fileInputRef.current?.click()}>
                        Upload Folder
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFolderUpload}
                        style={{ display: 'none' }}
                        {...({ webkitdirectory: "", directory: "" } as any)}
                    />
                </div>
                <div className="sidebar-content">
                    {isUploading ? (
                        <div className="uploading-state">
                            <div className="spinner-small"></div>
                            <p>Reading files...</p>
                        </div>
                    ) : files.length > 0 ? (
                        renderFileTree(files)
                    ) : (
                        <p className="empty-state">Upload a project to see files.</p>
                    )}
                </div>
            </aside>

            {/* MAIN: Code Editor */}
            <main className="editor-main">
                <div className="editor-header">
                    <span className="file-path">{selectedFile ? selectedFile.path : 'No file selected'}</span>
                    <div className="model-badge">{model.name}</div>
                </div>
                <div className="editor-view">
                    {pendingCode && (
                        <div className="edit-review-overlay">
                            <div className="review-modal">
                                <h4>✨ AI Suggests Changes for <code>{selectedFile?.name}</code></h4>
                                <div className="diff-view">
                                    {selectedFile && computeDiff(selectedFile.content || '', pendingCode).map((line, idx) => (
                                        <div key={idx} className={`diff-line ${line.type}`}>
                                            <span className="line-marker">
                                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                                            </span>
                                            <span className="line-content">{line.content}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="review-actions">
                                    <button className="btn-reject" onClick={() => setPendingCode(null)}>
                                        Reject
                                    </button>
                                    <div className="action-group">
                                        <button className="btn-always" onClick={() => {
                                            applyEdit(pendingCode);
                                            setAutoEditMode('always');
                                        }}>
                                            Always Allow
                                        </button>
                                        <button className="btn-apply" onClick={() => applyEdit(pendingCode)}>
                                            Apply Change
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {selectedFile ? (
                        <textarea
                            className="code-textarea"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            spellCheck={false}
                        />
                    ) : (
                        <div className="editor-empty">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                            </svg>
                            <p>Select a file to start editing</p>
                        </div>
                    )}
                </div>
            </main>

            {/* CHAT: AI Agent */}
            <aside className="editor-chat-sidebar">
                <div className="chat-header">
                    <div className="header-left">
                        <h3>AI Agent</h3>
                        {files.length > 0 && (
                            <div className="context-status">
                                <span className="dot pulse"></span>
                                Project Indexed
                            </div>
                        )}
                    </div>
                    <div className="header-controls">
                        <button
                            className={`btn-mode ${autoEditMode}`}
                            onClick={() => setAutoEditMode(prev => prev === 'ask' ? 'always' : 'ask')}
                            title={`Auto-Edit: ${autoEditMode === 'ask' ? 'Ask Permission' : 'Always Allow'}`}
                        >
                            {autoEditMode === 'ask' ? '🔒 Ask' : '⚡ Always'}
                        </button>
                        {chatMessages.length > 0 && (
                            <button className="btn-clear" onClick={() => setChatMessages([])} title="Clear conversation">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
                <div className="chat-messages" ref={chatContainerRef} onScroll={handleScroll}>
                    {chatMessages.map((msg, i) => (
                        <div key={i} className={`chat-bubble ${msg.role}`}>
                            <div className="bubble-content">{msg.content}</div>
                        </div>
                    ))}
                    {isTyping && <div className="chat-bubble assistant typing">Thinking...</div>}

                    {showScrollButton && (
                        <button className="btn-scroll-bottom" onClick={scrollToBottom}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                            </svg>
                        </button>
                    )}
                </div>
                <div className="chat-input-area">
                    <textarea
                        placeholder="Ask AI to fix or explain code..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                    />
                    <button onClick={handleSendMessage} disabled={!chatInput.trim() || isTyping}>
                        Send
                    </button>
                </div>
            </aside>

            <style>{`
        .chat-editor-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 9999 !important;
            background: var(--bg-dark);
            display: grid;
            grid-template-columns: 260px 1fr 350px;
        }
        .editor-chat-sidebar {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            border-left: 1px solid var(--border-glass);
            background: rgba(15, 23, 42, 0.8);
        }
        .sidebar-header { padding: 1rem; border-bottom: 1px solid var(--border-glass); }
        .btn-back { background: none; border: none; color: var(--text-muted); cursor: pointer; margin-bottom: 0.5rem; }
        .btn-upload { width: 100%; padding: 0.5rem; background: var(--grad-linear); border: none; border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; }
        .sidebar-content { flex: 1; overflow-y: auto; padding: 0.5rem; }
        .file-tree { list-style: none; padding-left: 1rem; font-size: 0.85rem; }
        .file-node { margin: 0.25rem 0; }
        .node-label { padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .node-label:hover { background: rgba(255, 255, 255, 0.05); }
        .node-label.selected { background: var(--primary); color: white; }
        .empty-state { color: var(--text-muted); text-align: center; margin-top: 2rem; font-size: 0.9rem; }
        .uploading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; margin-top: 3rem; color: var(--text-muted); font-size: 0.9rem; }
        
        .editor-header { padding: 0.75rem 1.5rem; background: rgba(15, 23, 42, 0.6); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-glass); }
        .file-path { font-size: 0.85rem; color: var(--text-muted); font-family: monospace; }
        .model-badge { font-size: 0.75rem; background: rgba(99, 102, 241, 0.2); color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 1rem; border: 1px solid var(--border-glass); }
        .editor-view { flex: 1; position: relative; }
        .code-textarea { width: 100%; height: 100%; background: transparent; border: none; color: #d1d5db; font-family: 'Fira Code', 'Cascadia Code', monospace; font-size: 0.95rem; line-height: 1.6; padding: 1.5rem; resize: none; outline: none; }
        .editor-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); gap: 1rem; }
        
        .header-controls { display: flex; align-items: center; gap: 0.5rem; }
        .btn-mode { font-size: 0.7rem; padding: 0.2rem 0.6rem; border-radius: 1rem; border: 1px solid var(--border-glass); cursor: pointer; background: rgba(0,0,0,0.2); color: var(--text-muted); transition: all 0.2s; font-weight: 600; }
        .btn-mode.always { background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4); }
        .btn-mode:hover { transform: scale(1.05); }

        .edit-review-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
        .review-modal { background: #0f172a; border: 1px solid var(--border-glass); border-radius: 0.75rem; width: 90%; max-width: 1000px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .review-modal h4 { padding: 1rem; margin: 0; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border-glass); color: white; border-top-left-radius: 0.75rem; border-top-right-radius: 0.75rem; }
        .diff-view { flex: 1; overflow-y: auto; padding: 1rem; font-family: monospace; font-size: 0.85rem; background: #0d1117; color: #c9d1d9; }
        .diff-line { display: flex; padding: 0 0.5rem; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
        .diff-line.added { background: rgba(46, 160, 67, 0.15); color: #fff; }
        .diff-line.removed { background: rgba(248, 81, 73, 0.15); color: #ff7b72; text-decoration: line-through; opacity: 0.7; }
        .diff-line.unchanged { opacity: 0.5; }
        .line-marker { display: inline-block; width: 1.5rem; user-select: none; opacity: 0.5; }
        .review-actions { padding: 1rem; border-top: 1px solid var(--border-glass); display: flex; justify-content: space-between; gap: 1rem; background: rgba(0,0,0,0.2); border-bottom-left-radius: 0.75rem; border-bottom-right-radius: 0.75rem; }
        .action-group { display: flex; gap: 0.5rem; }
        .btn-apply { padding: 0.6rem 1.5rem; background: var(--primary); color: white; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-apply:hover { opacity: 0.9; }
        .btn-always { padding: 0.6rem 1rem; background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; }
        .btn-always:hover { background: rgba(16, 185, 129, 0.2); }
        .btn-reject { padding: 0.6rem 1rem; background: transparent; color: #94a3b8; border: 1px solid var(--border-glass); border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; }
        .btn-reject:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
        .btn-clear { background: none; border: 1px solid var(--border-glass); color: var(--text-muted); padding: 0.4rem; border-radius: 0.4rem; cursor: pointer; transition: all 0.2s; }
        .btn-clear:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
        .context-status { font-size: 0.65rem; color: var(--primary); display: flex; align-items: center; gap: 0.3rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); }
        .dot.pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
        
        .chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; scroll-behavior: smooth; position: relative; }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-track { background: transparent; }
        .chat-messages::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .chat-messages::-webkit-scrollbar-thumb:hover { background: var(--primary); }
        
        .btn-scroll-bottom { position: sticky; bottom: 1rem; left: 50%; transform: translateX(-50%); background: var(--primary); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); animation: fadeIn 0.2s ease-out; z-index: 10; margin-top: -46px; align-self: center; }
        .btn-scroll-bottom:hover { transform: translateX(-50%) scale(1.1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

        .chat-bubble { max-width: 90%; padding: 0.75rem 1rem; border-radius: 1rem; font-size: 0.9rem; line-height: 1.5; animation: bubbleAppear 0.2s ease-out; }
        @keyframes bubbleAppear { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .chat-bubble.user { align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 0.25rem; }
        .chat-bubble.assistant { align-self: flex-start; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); border-bottom-left-radius: 0.25rem; }
        .bubble-content { white-space: pre-wrap; word-break: break-word; }
        .chat-input-area { padding: 1rem; border-top: 1px solid var(--border-glass); background: rgba(15, 23, 42, 0.4); display: flex; flex-direction: column; gap: 0.75rem; }
        .chat-input-area textarea { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-glass); border-radius: 0.75rem; padding: 0.75rem; color: white; font-family: inherit; font-size: 0.9rem; resize: none; min-height: 80px; outline: none; }
        .chat-input-area button { padding: 0.6rem; background: var(--primary); color: white; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; }
        .chat-input-area button:disabled { opacity: 0.5; }
      `}</style>
        </div>
    );
}
