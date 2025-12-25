import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './ChatEditor.css'; // New CSS file

interface FileNode {
    name: string;
    path: string;
    kind: 'file' | 'directory';
    source?: string;
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

                if (i % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            setFiles([...root]);
        } catch (error) {
            console.error('Upload failed:', error);
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
        const CONTEXT_LIMIT = 50000;

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
        const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
        let match;
        let lastCode = null;
        while ((match = codeBlockRegex.exec(content)) !== null) {
            lastCode = match[1];
        }
        return lastCode ? lastCode.trim() : null;
    };

    const computeDiff = (oldText: string, newText: string): DiffLine[] => {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const diff: DiffLine[] = [];
        let i = 0; let j = 0;
        while (i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                diff.push({ type: 'unchanged', content: oldLines[i] });
                i++; j++;
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

    const applySearchReplace = (currentCode: string, editBlock: string): string => {
        const lines = editBlock.split('\n');
        let result = currentCode;
        let i = 0;
        while (i < lines.length) {
            if (lines[i].includes('<<<<<<< SEARCH')) {
                let searchContent = [];
                i++;
                while (i < lines.length && !lines[i].includes('=======')) {
                    searchContent.push(lines[i]);
                    i++;
                }
                let replaceContent = [];
                i++;
                while (i < lines.length && !lines[i].includes('>>>>>>> REPLACE')) {
                    replaceContent.push(lines[i]);
                    i++;
                }
                const searchText = searchContent.join('\n');
                const replaceText = replaceContent.join('\n');
                if (searchText.trim() === '') {
                    // Prepend if search is empty
                    result = replaceText + '\n' + result;
                } else if (result.includes(searchText)) {
                    result = result.replace(searchText, replaceText);
                }
            }
            i++;
        }
        return result;
    };

    const applyEdit = (code: string) => {
        if (!selectedFile) return;
        let newCode = code;
        if (code.includes('<<<<<<< SEARCH')) {
            newCode = applySearchReplace(selectedFile.content || '', code);
        }

        const newFiles = [...files];
        const updateNode = (nodes: FileNode[]) => {
            for (const node of nodes) {
                if (node.path === selectedFile.path) {
                    node.content = newCode;
                    return true;
                }
                if (node.children && updateNode(node.children)) return true;
            }
            return false;
        };
        updateNode(newFiles);
        setFiles(newFiles);
        setEditContent(newCode);
        setPendingCode(null);
        setChatMessages(prev => [...prev, { role: 'assistant', content: '✅ Code updated successfully.' }]);
    };

    const handleSendMessage = async () => {
        if (!chatInput.trim()) return;
        const isFullFree = model.name.toLowerCase().includes('free') ||
            model.license?.toLowerCase() === 'free' ||
            model.source === 'huggingface' ||
            model.source === 'github';
        if (!isFullFree && credits <= 0) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'You have run out of credits. Please use a "full free" model or add your own API key in Settings.' }]);
            return;
        }

        const newMessage: ChatMessage = { role: 'user', content: chatInput };
        setChatMessages(prev => [...prev, newMessage]);
        setChatInput('');
        setIsTyping(true);

        const projectContext = files.length > 0 ? generateProjectContext(files) : "";
        const contextMessages = [...chatMessages.slice(-10), newMessage];

        if (projectContext) {
            contextMessages.unshift({
                role: 'user',
                content: `PROJECT ARCHITECTURE & SOURCE CODE: \n${projectContext} \n\nINSTRUCTIONS: You are an expert developer. To modify code, you MUST use one of these formats:\n1. For total rewrites, provide the FULL file content in a code block.\n2. For specific changes, use SEARCH/REPLACE blocks:\n<<<<<<< SEARCH\n[exact code to find]\n=======\n[new code]\n>>>>>>> REPLACE\nAnswer based on this context.`
            });
        }
        if (selectedFile) {
            contextMessages.push({ role: 'user', content: `Focus on: "${selectedFile.path}".` });
        }

        try {
            const payload = {
                model: model.name.includes('(free)') ? model.name.split(' ')[0] : model.name,
                source: model.source || 'openrouter',
                messages: contextMessages,
                apiKey: apiKey
            };
            const payloadSize = JSON.stringify(payload).length;
            console.log(`[Frontend] Sending chat request. Size: ${payloadSize} bytes (~${(payloadSize / 1024).toFixed(2)} KB)`);

            const response = await axios.post('http://localhost:3001/api/chat', payload);

            const assistantMessage: ChatMessage = { role: 'assistant', content: response.data.choices[0].message.content };
            setChatMessages(prev => [...prev, assistantMessage]);

            const extractedCode = extractCodeFromMessage(assistantMessage.content);
            if (extractedCode && selectedFile) {
                if (autoEditMode === 'always') applyEdit(extractedCode);
                else setPendingCode(extractedCode);
            }
            if (!isFullFree) setCredits(prev => prev - 1);
        } catch (error: any) {
            console.error('Chat error:', error);
            let errorMsg = error.response?.data?.error || error.message;
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMsg}` }]);
        } finally {
            setIsTyping(false);
        }
    };

    const renderFileTree = (nodes: FileNode[]) => (
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

    return (
        <div className="chat-editor-view">
            <aside className="editor-sidebar">
                <div className="sidebar-header">
                    <button className="btn-back" onClick={onBack}>← Back</button>
                    <h3>Explorer</h3>
                    <button className="btn-upload" onClick={() => fileInputRef.current?.click()}>
                        Upload Folder
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFolderUpload} style={{ display: 'none' }} {...({ webkitdirectory: "", directory: "" } as any)} />
                </div>
                <div className="sidebar-content">
                    {isUploading ? (
                        <div className="uploading-state">
                            <div className="spinner-small"></div>
                            <p>Indexing...</p>
                        </div>
                    ) : files.length > 0 ? renderFileTree(files) : (
                        <p className="empty-state">Upload a project to begin.</p>
                    )}
                </div>
            </aside>

            <main className="editor-main">
                <header className="editor-header">
                    <span className="file-path">{selectedFile ? selectedFile.path : 'No file selected'}</span>
                    <div className="model-badge">{model.name}</div>
                </header>
                <div className="editor-view">
                    {pendingCode && (
                        <div className="edit-review-overlay">
                            <div className="review-modal">
                                <h4>✨ AI Suggested Changes: <code>{selectedFile?.name}</code></h4>
                                <div className="diff-view">
                                    {selectedFile && computeDiff(selectedFile.content || '', pendingCode).map((line, idx) => (
                                        <div key={idx} className={`diff-line ${line.type}`}>
                                            <span className="line-marker">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                                            <span className="line-content">{line.content}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="review-actions">
                                    <button className="btn-reject" onClick={() => setPendingCode(null)}>Reject</button>
                                    <div className="action-group">
                                        <button className="btn-always" onClick={() => { applyEdit(pendingCode); setAutoEditMode('always'); }}>Always Allow</button>
                                        <button className="btn-apply" onClick={() => applyEdit(pendingCode)}>Apply</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {selectedFile ? (
                        <textarea className="code-textarea" value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} />
                    ) : (
                        <div className="editor-empty">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                            </svg>
                            <p>Select a file to start editing</p>
                        </div>
                    )}
                </div>
            </main>

            <aside className="editor-chat-sidebar">
                <header className="chat-header">
                    <div className="header-left">
                        <h3>AI Agent</h3>
                        {files.length > 0 && <div className="context-status"><span className="dot pulse"></span>Project Indexed</div>}
                    </div>
                    <div className="header-controls">
                        <button className={`btn-mode ${autoEditMode}`} onClick={() => setAutoEditMode(prev => prev === 'ask' ? 'always' : 'ask')}>
                            {autoEditMode === 'ask' ? '🔒 Ask' : '⚡ Always'}
                        </button>
                        {chatMessages.length > 0 && (
                            <button className="btn-clear" onClick={() => setChatMessages([])} title="Clear conversation">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>
                            </button>
                        )}
                    </div>
                </header>
                <div className="chat-messages" ref={chatContainerRef}>
                    {chatMessages.map((msg, i) => (
                        <div key={i} className={`chat-bubble ${msg.role}`}>
                            <div className="bubble-content">{msg.content}</div>
                        </div>
                    ))}
                    {isTyping && <div className="chat-bubble assistant typing">Thinking...</div>}
                </div>
                <div className="chat-input-area">
                    <textarea placeholder="Ask AI to fix or explain code..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} />
                    <button className="btn-send" onClick={handleSendMessage} disabled={!chatInput.trim() || isTyping}>Send</button>
                </div>
            </aside>
        </div>
    );
}
