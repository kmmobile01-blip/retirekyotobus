import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User as UserIcon, Loader2, AlertCircle, Trash2, Maximize2, Minimize2, Sparkles, AlertTriangle } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { SimulationConfig, AggregatedYearlyData } from '../types';
import Markdown from 'react-markdown';

interface AIChatModeProps {
    isOpen: boolean;
    onClose: () => void;
    data: AggregatedYearlyData[];
    configA: SimulationConfig;
    configB: SimulationConfig;
}

interface Message {
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
}

export const AIChatMode: React.FC<AIChatModeProps> = ({ isOpen, onClose, data, configA, configB }) => {
    const [messages, setMessages] = useState<Message[]>([
        { 
            role: 'model', 
            text: "こんにちは！京都バス退職金シミュレーションAIコンサルタントです。制度改定案の比較や、特定の社員への影響、将来の費用予測など、何でもお気軽にご相談ください。", 
            timestamp: new Date() 
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!isOpen) return null;

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userText = input.trim();
        setInput('');
        setError(null);
        const newMessages: Message[] = [...messages, { role: 'user', text: userText, timestamp: new Date() }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            // Check for API key selection
            const aistudio = (window as any).aistudio;
            if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
                const selected = await aistudio.hasSelectedApiKey();
                if (!selected && typeof aistudio.openSelectKey === 'function') {
                    await aistudio.openSelectKey();
                }
            }

            const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
            if (!apiKey) {
                throw new Error("APIキーが設定されていません。AI Studioの設定からAPIキーを選択してください。");
            }

            const ai = new GoogleGenAI({ apiKey });

            // Build context
            const contextPrompt = `
あなたは京都バスの退職金制度コンサルタントです。
以下のシミュレーションデータと設定情報を踏まえて、ユーザーの質問に答えてください。

【現在のデータ概要】
- 対象人数: ${data.length || 0}名
- パターンA (変更案): ${configA.label}
- パターンB (現行制度): ${configB.label}

【現在の設定 (パターンA)】
- 定年年齢: ${JSON.stringify(configA.retirementAges)}
- 制度改定日: ${configA.transitionConfig.enabled ? configA.transitionConfig.date.toLocaleDateString() : '未設定'}

【現在の設定 (パターンB)】
- 定年年齢: ${JSON.stringify(configB.retirementAges)}

ユーザーからの質問に対して、専門的かつ分かりやすく回答してください。
必要に応じて、シミュレーション結果の傾向（費用が増えるか減るかなど）についても言及してください。
`;

            // Build history for API
            const contents = messages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));
            
            // Add context to the first message if it's the start
            if (contents.length > 0 && contents[0].role === 'model') {
                contents[0].parts[0].text = contextPrompt + "\n\n" + contents[0].parts[0].text;
            }

            // Append current user message
            contents.push({ role: 'user', parts: [{ text: userText }] });

            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: contents,
                config: {
                    temperature: 0.7,
                }
            });

            const responseText = response.text || "申し訳ありません。回答を生成できませんでした。";
            setMessages(prev => [...prev, { role: 'model', text: responseText, timestamp: new Date() }]);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "通信エラーが発生しました。");
            setMessages(prev => [...prev, { role: 'model', text: "申し訳ありません。エラーが発生したため、回答を生成できませんでした。", timestamp: new Date() }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([{ 
            role: 'model', 
            text: "チャット履歴をクリアしました。何かお手伝いできることはありますか？", 
            timestamp: new Date() 
        }]);
    };

    return (
        <div className={`fixed z-[100] transition-all duration-300 ease-in-out flex flex-col bg-white shadow-2xl border border-slate-200 overflow-hidden ${isMaximized ? 'inset-4 rounded-3xl' : 'bottom-24 right-8 w-[450px] h-[600px] rounded-2xl'}`}>
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-lg">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <div className="font-bold text-sm">AIコンサルタント</div>
                        <div className="text-[10px] text-indigo-300 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                            Online | Gemini Powered
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsMaximized(!isMaximized)} className="p-2 hover:bg-white/10 rounded-lg transition" title={isMaximized ? "縮小" : "拡大"}>
                        {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={clearChat} className="p-2 hover:bg-white/10 rounded-lg transition text-slate-400 hover:text-red-400" title="履歴クリア">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={onClose} 
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition text-xs font-bold"
                    >
                        <X className="w-4 h-4" />
                        <span>閉じる</span>
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 scrollbar-thin scrollbar-thumb-slate-300">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-indigo-600'}`}>
                            {msg.role === 'user' ? <UserIcon className="w-4 h-4"/> : <Bot className="w-5 h-5"/>}
                        </div>
                        <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`rounded-2xl p-4 shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                                <div className="prose prose-sm max-w-none prose-slate">
                                    <Markdown>{msg.text}</Markdown>
                                </div>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 px-1">
                                {msg.timestamp.toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-200 text-indigo-600 flex items-center justify-center shrink-0">
                            <Loader2 className="w-4 h-4 animate-spin"/>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2 text-slate-500 text-sm">
                            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                            考え中...
                        </div>
                    </div>
                )}
                {error && (
                    <div className="flex justify-center">
                        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-full text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-200">
                <div className="relative flex items-center gap-2">
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder="AIに質問する..."
                        className="w-full p-3 pr-12 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-12 text-sm"
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-1.5 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition shadow-md"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 text-center">
                    ※ AIの回答は必ずしも正確ではありません。重要な判断はシミュレーション結果を元に行ってください。
                </div>
            </div>
        </div>
    );
};
