import React, { useState, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { Sparkles, FileText, RefreshCw, Printer, AlertTriangle, Download, Copy, Check, X, Target, TrendingDown, FileDown, ToggleLeft, ToggleRight, Settings, ArrowRightCircle, ListChecks, Loader2, Bug, Database, FileType, Edit3, Lock, Unlock, Layers, ShieldCheck, Send, MessageSquare, Bot, User as UserIcon, Upload, Key, MousePointerClick, CheckCircle, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";
import { AggregatedYearlyData, SimulationConfig, CoefSettings, TableRowT2 } from '../types';
import { deepClone } from '../utils';
import { T1_CSV_HEADERS, T2_CSV_HEADERS, COEF_CSV_HEADERS } from '../constants';

interface AIAnalysisReportProps {
    data: AggregatedYearlyData[];
    configA: SimulationConfig;
    configB: SimulationConfig;
    onApplyProposal: (newConfig: SimulationConfig) => void;
}

interface ProposedSettings {
    retirementAges?: { type1?: number | string; type2?: number | string; type3?: number | string; type4?: number | string };
    defaultYearlyEval?: number | string;
    cutoffYears?: { type1?: number | string; type2?: number | string; type3?: number | string; type4?: number | string };
    
    // Future params
    retirementAgesFuture?: { type1?: number | string; type2?: number | string; type3?: number | string; type4?: number | string };
    defaultYearlyEvalFuture?: number | string;
    cutoffYearsFuture?: { type1?: number | string; type2?: number | string; type3?: number | string; type4?: number | string };
}

interface CsvMap {
    coef?: string;
    point_t1?: string;
    point_t2?: string;
    point_t3?: string;
    point_t4?: string;
}

// 制約条件の型定義
type ConstraintType = {
    fixedRetirementAge: number | ''; // 数値があればその年齢に固定（変更）、空なら現行維持
    allowPointTableChange: boolean;  // 勤続・職能ポイント表の変更可否
    allowEvalPointChange: boolean;   // 標準考課ポイントの変更可否
    allowCoefChange: boolean;        // 支給率係数の変更可否
    maxRankPointYears: number | '';  // 職能ポイント上限年数（空なら現行維持）
    
    guaranteePreRevision: boolean;   // 制度改定前の支給額の最低保証
    guaranteeBPlan: boolean;         // 定年時のB案の支給額保証

    customInstruction: string;       // 自由記述の制約
};

// Chat Message Type
interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
    hasData?: boolean; // If model response detected parseable data
}

// ヘルパー: 数値パースの堅牢化 (カンマ対応、空文字対応)
const safeParseFloat = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const norm = val.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                        .replace(/[,，\s]+/g, '');
        if (norm === '') return 0;
        const n = parseFloat(norm);
        return isNaN(n) ? 0 : n;
    }
    return 0; // null/undefined/object -> 0
};

// ヘルパー関数をコンポーネント外に定義
function fillGaps<T extends object>(rows: T[], maxYear: number = 47, isCoef: boolean = false): T[] {
    if (!rows || rows.length === 0) return [];
    
    const map = new Map<number, T>();
    rows.forEach(r => {
        const y = (r as any).y || (r as any).years;
        if (y) map.set(y, r);
    });

    if (map.size === 0) return rows;

    const filled: T[] = [];
    let lastValid: T | null = null;

    // 先頭が欠けている場合の補完用
    const sortedYears = Array.from(map.keys()).sort((a,b)=>a-b);
    const firstY = sortedYears[0];
    let initialRow: T | null = null;
    if (firstY !== undefined) {
        initialRow = map.get(firstY)!;
    }

    for (let y = 1; y <= maxYear; y++) {
        if (map.has(y)) {
            lastValid = map.get(y)!;
            const row = { ...lastValid };
            if (isCoef) (row as any).years = y; else (row as any).y = y;
            filled.push(row);
        } else if (lastValid) {
            const newRow = { ...lastValid };
            if (isCoef) (newRow as any).years = y; else (newRow as any).y = y;
            filled.push(newRow);
        } else if (initialRow) {
             // まだ有効な行に出会っていない（1年目などが欠損）場合は、最初の有効行をコピー
            const newRow = { ...initialRow };
            if (isCoef) (newRow as any).years = y; else (newRow as any).y = y;
            filled.push(newRow);
        }
    }
    return filled;
}

const safeNum = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
};

// ヘルパー: CSV解析共通処理
const parseCsvBlock = (csvText: string, label: string, processLog: string[]): any[] => {
    try {
        if (!csvText || typeof csvText !== 'string') {
            processLog.push(`エラー: ${label}のデータが空です。`);
            return [];
        }
        // 改行コードを正規化して分割 (\r\n, \r, \n)
        // BOM削除もここで行う
        const cleanText = csvText.replace(/^\ufeff/, '');
        const lines = cleanText.split(/\r\n|\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
        // #で始まる行は事前に除去されている前提だが、念のためフィルタ
        const validLines = lines.filter(l => !l.startsWith('#'));
        
        // ヘッダー行を探す (条件緩和: 年 or Year or y が含まれ、かつカンマかタブがある)
        const headerIndex = validLines.findIndex(l => {
            const low = l.toLowerCase();
            return (low.includes('year') || low.includes('年') || low.startsWith('y')) && 
                   (low.includes(',') || low.includes('\t'));
        });
        
        if (headerIndex === -1) {
            processLog.push(`警告: ${label}のヘッダー行が見つかりません。"年数"や"Year"を含む行が必要です。AIの生成形式がCSVでない可能性があります。`);
            return [];
        }
        
        const validCsv = validLines.slice(headerIndex).join('\n');
        const parsed = Papa.parse(validCsv, { 
            header: true, 
            dynamicTyping: true, // "1,000"は文字列として扱われるため、後でsafeParseFloatする
            skipEmptyLines: true, 
            // BOM削除 & スペース削除 (ヘッダー名 " T1 勤続 " -> "T1勤続")
            transformHeader: (h: string) => h.replace(/^\ufeff/, '').replace(/\s+/g, '').trim() 
        } as any) as any;
        
        if (parsed.errors && parsed.errors.length > 0) processLog.push(`情報: ${label}解析中に軽微な警告がありました (行数: ${parsed.data.length})`);
        return (parsed.data || []) as any[];
    } catch (e: any) {
        processLog.push(`エラー: ${label}の解析に失敗 (${e.message})`);
        return [];
    }
};

const normalize = (s: string) => s.toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

// ヘッダーから値を取得するヘルパー（曖昧一致対応）
const getValRobust = (row: any, csvHeaders: string[], searchKeywords: string[], excludeKeywords: string[] = []): number => {
    if (!row) return 0;
    
    // 1. Exact Match (Normalized)
    for (const cand of searchKeywords) {
        const normCand = normalize(cand);
        const match = csvHeaders.find(h => normalize(h) === normCand);
        if (match && row[match] !== undefined) return safeParseFloat(row[match]);
    }

    // 2. Partial Match with Exclusions
    const matchedHeader = csvHeaders.find(h => {
        const normH = normalize(h);
        const matchFound = searchKeywords.some(kw => normH.includes(normalize(kw)));
        if (!matchFound) return false;
        
        if (excludeKeywords.some(ex => normH.includes(normalize(ex)))) return false;
        
        return true;
    });

    if (matchedHeader && row[matchedHeader] !== undefined) {
        return safeParseFloat(row[matchedHeader]);
    }
    return 0;
};

// ヘルパー: テキストからCSV/JSONを抽出する共通ロジック
const parseResponseAndExtractData = (text: string): { csvMap: CsvMap, proposedSettings: ProposedSettings | null } => {
    const newCsvMap: CsvMap = {};
    let foundJson: ProposedSettings | null = null;
    
    // Helper function to strip comment lines starting with # AND strip potential BOM
    const cleanCsvContent = (rawText: string) => {
        return rawText.replace(/^\ufeff/, '') // Strip BOM if present in raw string
            .split(/\r\n|\n|\r/)
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('#'))
            .join('\n');
    };

    // Helper: Relaxed JSON Parser
    const tryParseJson = (str: string) => {
        try {
            // Remove comments from JSON string if any (// or /* */)
            const cleaned = str.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            return JSON.parse(cleaned);
        } catch(e) { return null; }
    };

    // Strategy 1: Code Block Regex (Relaxed)
    const codeBlockRegex = /```([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
        let content = match[1].trim();
        
        // Remove language tag if present in first line (csv, json, etc)
        const firstLineEnd = content.indexOf('\n');
        if (firstLineEnd !== -1) {
            const firstLine = content.substring(0, firstLineEnd).trim().toLowerCase();
            if (['csv', 'json', 'xml', 'js', 'javascript'].some(tag => firstLine.startsWith(tag))) {
                 content = content.substring(firstLineEnd + 1).trim();
            }
        }

        const lower = content.toLowerCase();

        // JSON Detection (inside block)
        if (content.trim().startsWith('{')) {
             const parsed = tryParseJson(content);
             if (parsed) { foundJson = parsed; continue; }
        } 

        // CSV Detection (Robust check using headers if comments missing)
        let isCoef = lower.includes('# type: coef') || (lower.includes('t1') && lower.includes('t2') && lower.includes('t3') && lower.includes('t4'));
        
        let isP1 = lower.includes('# type: point_type1') || lower.includes('t1勤続');
        let isP2 = lower.includes('# type: point_type2') || lower.includes('t2勤続');
        let isP3 = lower.includes('# type: point_type3') || lower.includes('t3勤続');
        let isP4 = lower.includes('# type: point_type4') || lower.includes('t4勤続');
        // Fallback for generic T4 if 't4勤続' not found but generic headers exist (and not T1/T2/T3)
        let isGenericP4 = !isP4 && !isP1 && !isP2 && !isP3 && lower.includes('年数') && (lower.includes('勤続') || lower.includes('係員'));

        content = cleanCsvContent(content);

        if (isCoef) {
            newCsvMap.coef = content;
        } else if (isP1) {
            newCsvMap.point_t1 = content;
        } else if (isP2) {
            newCsvMap.point_t2 = content;
        } else if (isP3) {
            newCsvMap.point_t3 = content;
        } else if (isP4) {
            newCsvMap.point_t4 = content;
        } else if (isGenericP4) {
            if (!newCsvMap.point_t4) newCsvMap.point_t4 = content;
        }
    }

    // Strategy 2: Raw Text Scan (Fallback) - Only if regex failed for key items
    const extract = (marker: string) => {
        const idx = text.indexOf(marker);
        if (idx === -1) return null;
        const nextDoubleLine = text.indexOf('\n\n', idx);
        const nextMarker = text.indexOf('# Type:', idx + 1);
        
        let end = text.length;
        if (nextDoubleLine !== -1 && nextDoubleLine > idx) end = Math.min(end, nextDoubleLine);
        if (nextMarker !== -1 && nextMarker > idx) end = Math.min(end, nextMarker);
        
        let candidate = text.substring(idx, end).trim();
        candidate = candidate.replace(/```/g, ''); // remove accidental backticks
        
        return cleanCsvContent(candidate);
    };

    if (!newCsvMap.coef) newCsvMap.coef = extract('# Type: Coef') || undefined;
    if (!newCsvMap.point_t4) newCsvMap.point_t4 = extract('# Type: Point_Type4') || undefined;
    if (!newCsvMap.point_t1) newCsvMap.point_t1 = extract('# Type: Point_Type1') || undefined;
    if (!newCsvMap.point_t2) newCsvMap.point_t2 = extract('# Type: Point_Type2') || undefined;
    if (!newCsvMap.point_t3) newCsvMap.point_t3 = extract('# Type: Point_Type3') || undefined;

    // Strategy 3: JSON Fallback (Find largest {} block outside of code blocks if missed)
    if (!foundJson) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end > start) {
            const jsonCand = text.substring(start, end+1);
            if (jsonCand.includes('retirementAges') || jsonCand.includes('cutoffYears')) {
                const parsed = tryParseJson(jsonCand);
                if (parsed) foundJson = parsed;
            }
        }
    }

    return { csvMap: newCsvMap, proposedSettings: foundJson };
};

export const AIAnalysisReport: React.FC<AIAnalysisReportProps> = ({ data, configA, configB, onApplyProposal }) => {
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
    // Report Content State (Displayed as main report)
    const [reportContent, setReportContent] = useState<string | null>(() => {
        return localStorage.getItem('retirement-sim-report-content');
    });
    const [csvMap, setCsvMap] = useState<CsvMap>(() => {
        const saved = localStorage.getItem('retirement-sim-report-csvmap');
        return saved ? JSON.parse(saved) : {};
    });
    const [proposedSettings, setProposedSettings] = useState<ProposedSettings | null>(() => {
        const saved = localStorage.getItem('retirement-sim-report-proposed');
        return saved ? JSON.parse(saved) : null;
    });
    
    // Chat State
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem('retirement-sim-report-messages');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
            } catch (e) { console.error(e); }
        }
        return [];
    });

    useEffect(() => {
        if (reportContent) localStorage.setItem('retirement-sim-report-content', reportContent);
        else localStorage.removeItem('retirement-sim-report-content');
    }, [reportContent]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-report-csvmap', JSON.stringify(csvMap));
    }, [csvMap]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-report-proposed', JSON.stringify(proposedSettings));
    }, [proposedSettings]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-report-messages', JSON.stringify(messages));
    }, [messages]);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileUploadRef = useRef<HTMLInputElement>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const errorRef = useRef<HTMLDivElement>(null);
    const isCancelledRef = useRef<boolean>(false);
    
    // API Key State (Platform provided)
    const [selectedModel, setSelectedModel] = useState<'pro' | 'flash' | 'lite'>('pro');
 
    // 制度改定日の動的取得
    const transitionDate = useMemo(() => {
        return configB.transitionConfig.enabled ? configB.transitionConfig.date : new Date(2027, 2, 31);
    }, [configB.transitionConfig]);

    const transitionDateStr = useMemo(() => {
        return `${transitionDate.getFullYear()}年${transitionDate.getMonth() + 1}月${transitionDate.getDate()}日`;
    }, [transitionDate]);

    const transitionYear = useMemo(() => transitionDate.getFullYear(), [transitionDate]);

    const baseDate = useMemo(() => {
        const d = new Date(transitionDate);
        d.setDate(d.getDate() - 1);
        return d;
    }, [transitionDate]);

    const baseDateStr = useMemo(() => {
        return `${baseDate.getFullYear()}年${baseDate.getMonth() + 1}月${baseDate.getDate()}日`;
    }, [baseDate]);

    // Initialize Key Check
    useEffect(() => {
        const checkKey = async () => {
            try {
                const aistudio = (window as any).aistudio;
                if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
                    await aistudio.hasSelectedApiKey();
                }
            } catch (e) {
                console.error("Error checking API key status:", e);
            }
        };
        checkKey();
    }, []);

    const handleOpenKeyDialog = async () => {
        try {
            const aistudio = (window as any).aistudio;
            if (aistudio && typeof aistudio.openSelectKey === 'function') {
                await aistudio.openSelectKey();
            } else {
                console.error("AI Studio API (openSelectKey) not found");
            }
        } catch (e: any) {
            console.error("Error opening key dialog:", e);
        }
    };
    
    // --- UI States for Constraints ---
    const [enableTarget, setEnableTarget] = useState<boolean>(false);
    const [targetReductionRange, setTargetReductionRange] = useState<{min: number, max: number}>({min: 10, max: 20});
    
    const [activeConstraintTab, setActiveConstraintTab] = useState<'common'|'type1'|'type2'|'type3'|'type4'>('common'); 
    const [isChatVisible, setIsChatVisible] = useState(true); 
    
    // デフォルトは全て空欄・チェックなしに変更
    const [constraints, setConstraints] = useState<Record<'common'|'type1'|'type2'|'type3'|'type4', ConstraintType>>(() => {
        const saved = localStorage.getItem('retirement-sim-report-constraints');
        return saved ? JSON.parse(saved) : {
            common: {
                fixedRetirementAge: '',
                allowPointTableChange: false,
                allowEvalPointChange: false,
                allowCoefChange: false,
                maxRankPointYears: '',
                guaranteePreRevision: false,
                guaranteeBPlan: false,
                customInstruction: ''
            },
            type1: {
                fixedRetirementAge: '',
                allowPointTableChange: false,
                allowEvalPointChange: false,
                allowCoefChange: false,
                maxRankPointYears: '',
                guaranteePreRevision: false,
                guaranteeBPlan: false,
                customInstruction: ''
            },
            type2: {
                fixedRetirementAge: '',
                allowPointTableChange: false,
                allowEvalPointChange: false,
                allowCoefChange: false,
                maxRankPointYears: '',
                guaranteePreRevision: false,
                guaranteeBPlan: false,
                customInstruction: ''
            },
            type3: {
                fixedRetirementAge: '',
                allowPointTableChange: false,
                allowEvalPointChange: false,
                allowCoefChange: false,
                maxRankPointYears: '',
                guaranteePreRevision: false,
                guaranteeBPlan: false,
                customInstruction: ''
            },
            type4: {
                fixedRetirementAge: '',
                allowPointTableChange: false,
                allowEvalPointChange: false,
                allowCoefChange: false,
                maxRankPointYears: '',
                guaranteePreRevision: false,
                guaranteeBPlan: false,
                customInstruction: ''
            }
        };
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-report-constraints', JSON.stringify(constraints));
    }, [constraints]);

    const updateConstraint = (key: keyof ConstraintType, value: any) => {
        setConstraints(prev => ({
            ...prev,
            [activeConstraintTab]: {
                ...prev[activeConstraintTab],
                [key]: value
            }
        }));
    };

    // 抽出されたデータの概要を表示するためのステート
    const extractedDataSummary = useMemo(() => {
        const parts = [];
        if (csvMap.coef) parts.push("支給率係数");
        if (csvMap.point_t1) parts.push("Type1(旧1)");
        if (csvMap.point_t2) parts.push("Type2(旧2)");
        if (csvMap.point_t3) parts.push("Type3(旧3)");
        if (csvMap.point_t4) parts.push("Type4(新)");
        if (proposedSettings) parts.push("パラメータ設定");
        return parts;
    }, [csvMap, proposedSettings]);

    // Check if data available for application
    const hasAnyCsv = useMemo(() => {
        return !!(csvMap.coef || csvMap.point_t1 || csvMap.point_t2 || csvMap.point_t3 || csvMap.point_t4 || proposedSettings);
    }, [csvMap, proposedSettings]);

    // Scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!data || data.length === 0) return null;

    const handleCancel = () => {
        isCancelledRef.current = true;
        setIsLoading(false);
        setMessages(prev => [...prev, { 
            role: 'model', 
            text: "⚠️ 分析を中止しました。", 
            timestamp: new Date() 
        }]);
    };

    const callAI = async (currentMessages: ChatMessage[], newPrompt: string, isInitial: boolean) => {
        setIsLoading(true);
        isCancelledRef.current = false;
        setError(null);
        if (isInitial) {
            setSuccessMsg(null);
            setCsvMap({});
            setProposedSettings(null);
            setMessages([]); // Reset chat on new generation
        }

        // Add user message to UI immediately
        if (!isInitial) {
            setMessages(prev => [...prev, { role: 'user', text: newPrompt, timestamp: new Date() }]);
        }

        try {
            if (isCancelledRef.current) return;

            // Check for API key selection
            const aistudio = (window as any).aistudio;
            if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
                const selected = await aistudio.hasSelectedApiKey();
                if (isCancelledRef.current) return;
                if (!selected && typeof aistudio.openSelectKey === 'function') {
                    await aistudio.openSelectKey();
                }
            }

            if (isCancelledRef.current) return;

            const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
            
            if (!apiKey) {
                throw new Error("APIキーが設定されていません。AI Studioの設定からAPIキーを選択してください。");
            }

            // Using the new GoogleGenAI SDK with retry logic
            const ai = new GoogleGenAI({ apiKey: apiKey });

            // Build Context History for API
            let contents = [];
            
            if (isInitial) {
                contents = [{ role: 'user', parts: [{ text: newPrompt }] }];
            } else {
                // Reconstruct history from state
                contents = currentMessages.map(m => ({
                    role: m.role,
                    parts: [{ text: m.text }]
                }));
                // Append new user message
                contents.push({ role: 'user', parts: [{ text: newPrompt }] });
            }

            // Retry logic for robustness
            let response = null;
            const maxRetries = 3;
            let attempt = 0;
            
            const modelName = selectedModel === 'pro' ? 'gemini-3.1-pro-preview' : 
                              selectedModel === 'flash' ? 'gemini-3-flash-preview' : 
                              'gemini-3.1-flash-lite-preview';

            while (attempt < maxRetries) {
                if (isCancelledRef.current) return;
                try {
                    response = await ai.models.generateContent({
                        model: modelName,
                        contents: contents,
                        config: {
                            temperature: 0.2,
                        }
                    });
                    if (isCancelledRef.current) return;
                    break; // Success
                } catch (e: any) {
                    if (isCancelledRef.current) return;
                    attempt++;
                    const isRetryable = e.message.includes('429') || e.message.includes('503') || e.message.includes('500');
                    if (attempt >= maxRetries || !isRetryable) {
                        throw e;
                    }
                    console.warn(`Gemini API Error (Attempt ${attempt}): ${e.message}. Retrying...`);
                    await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
                }
            }

            if (isCancelledRef.current) return;

            if (!response || !response.text) throw new Error("レポートの生成に失敗しました（応答が空です）。");
            const text = response.text;
            
            // Parse for Data
            const { csvMap: extractedCsv, proposedSettings: extractedSettings } = parseResponseAndExtractData(text);
            setCsvMap(extractedCsv);
            setProposedSettings(extractedSettings);
            setMessages(prev => [...prev, { role: 'model', text: text, timestamp: new Date() }]);
            if (isInitial) setSuccessMsg("レポートが生成されました。");
        } catch (e: any) {
            if (isCancelledRef.current) return;
            setError(e.message || "AIとの通信中にエラーが発生しました。");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateReport = () => {
        if (isLoading) return;
        setIsChatVisible(true);
        // 削減目標期間（改定年〜10年間）のB案平均コスト算出
        const targetPeriodData = data.filter(d => d.year >= transitionYear && d.year <= transitionYear + 9);
        const totalCostBTarget = targetPeriodData.reduce((sum, d) => sum + Math.round(d.B.total / 1000), 0);
        const avgCostBTarget = targetPeriodData.length > 0 ? Math.round(totalCostBTarget / targetPeriodData.length) : 0;
 
        let targetInstruction = "";
        if (enableTarget) {
            targetInstruction = `
**【重要：コスト削減目標】**
**「${transitionYear}年度〜${transitionYear + 9}年度（向こう10年間）において、現行制度（B案）の毎年の引当金繰入額に対し、平均でおよそ ${targetReductionRange.min}% ～ ${targetReductionRange.max}% の削減」** を達成する制度設計が求められています。
(参考: 目標期間(${transitionYear}-${transitionYear + 9})におけるB案の年間平均引当額は約 ${avgCostBTarget.toLocaleString()} 千円です。ここから ${targetReductionRange.min}% ～ ${targetReductionRange.max}% 程度の削減を目指してください)
`;
        } else {
            targetInstruction = `
**【分析の方針】**
特定のコスト削減目標は設定されていません。A案とB案の差異をフラットに分析し、財務健全性の観点からリスクやメリットを評価してください。
`;
        }

        // --- 参照用CSVデータの作成 (B案) ---
        const prepareCsv = (data: any[], keys: string[], labels: string[]) => {
            const mapped = data.map(r => {
                const obj: any = {};
                keys.forEach((k, i) => obj[labels[i]] = (r as any)[k]);
                return obj;
            });
            return Papa.unparse(mapped);
        };
        
        // Coef
        const coefYears = configB.coefSettings.type1.map(r => r.years);
        const coefData = coefYears.map((y, i) => ({
            years: y,
            t1: configB.coefSettings.type1[i]?.coef,
            t2: configB.coefSettings.type2[i]?.coef,
            t3: configB.coefSettings.type3[i]?.coef,
            t4: configB.coefSettings.type4[i]?.coef,
        }));
        const refCoef = Papa.unparse(coefData.map(r => ({
            [COEF_CSV_HEADERS.labels[0]]: r.years,
            [COEF_CSV_HEADERS.labels[1]]: r.t1,
            [COEF_CSV_HEADERS.labels[2]]: r.t2,
            [COEF_CSV_HEADERS.labels[3]]: r.t3,
            [COEF_CSV_HEADERS.labels[4]]: r.t4,
        })));

        // ポイント
        const refT1 = prepareCsv(configB.masterData1_1, T1_CSV_HEADERS.keys, T1_CSV_HEADERS.labels);
        const refT2 = prepareCsv(configB.masterData1_2, T1_CSV_HEADERS.keys, T1_CSV_HEADERS.labels);
        const refT3 = prepareCsv(configB.masterData1_3, T1_CSV_HEADERS.keys, T1_CSV_HEADERS.labels);
        const refT4 = prepareCsv(configB.masterData2, T2_CSV_HEADERS.keys, T2_CSV_HEADERS.labels);

        // --- シミュレーション結果のCSV作成 ---
        const simulationResultCsv = Papa.unparse(data.map(d => ({
            "年度": d.year,
            "A案_引当増加額": Math.round(d.A.total / 1000),
            "B案_引当増加額": Math.round(d.B.total / 1000),
            "A案_期末残高": Math.round(d.stockA.total / 1000),
            "B案_期末残高": Math.round(d.stockB.total / 1000),
            "A案_キャッシュアウト": Math.round(d.payoutA.total / 1000),
            "B案_キャッシュアウト": Math.round(d.payoutB.total / 1000),
            "退職者数": d.counts.total
        })));

        // --- 制約プロンプトの動的生成 ---
        const buildConstraintPrompt = (typeLabel: string, c: ConstraintType) => {
            const { fixedRetirementAge, allowPointTableChange, allowEvalPointChange, allowCoefChange, maxRankPointYears, customInstruction } = c;
            const parts = [];

            if (fixedRetirementAge) {
                parts.push(`- **定年年齢**: **${fixedRetirementAge}歳** に変更すること。`);
            } else {
                parts.push(`- **定年年齢**: 現行維持（変更しない）。`);
            }
            
            const changeables = [];
            const unchangeables = [];
            if (allowPointTableChange) changeables.push("「勤続・職能ポイント表」"); else unchangeables.push("「勤続・職能ポイント表」");
            if (allowEvalPointChange) changeables.push("「標準考課ポイント」"); else unchangeables.push("「標準考課ポイント」");
            if (allowCoefChange) changeables.push("「支給率係数」"); else unchangeables.push("「支給率係数」");
            
            if (changeables.length > 0) {
                parts.push(`- **変更可能項目**: ${changeables.join('、')} のみを変更してよい。`);
            } else {
                parts.push(`- **変更可能項目**: なし。`);
            }
            if (unchangeables.length > 0) {
                parts.push(`- **変更禁止項目**: ${unchangeables.join('、')} は変更不可。`);
            }

            if (maxRankPointYears) {
                parts.push(`- **職能ポイント上限年数**: **${maxRankPointYears}年** とする。`);
            }

            if (customInstruction) {
                parts.push(`- **特記事項**: ${customInstruction}`);
            }

            return `
   - **${typeLabel}**:
${parts.map(p => "     " + p).join('\n')}
`;
        };

        const constraintPrompt = `
2. **制度区分ごとの変更制約（Strict Constraints）**:
   以下の指示に従って変更内容を決定してください。
   ※「全制度共通」の設定がありますが、**各制度区分ごとの個別指示がある場合は、そちらを最優先**してください。
   ※**変更禁止項目**については、必ず後述の【参照データ】（現行B案）と同一の値を出力してください。勝手な変更は許されません。
 
${buildConstraintPrompt('旧制度① (Type 1)', constraints.type1)}
${buildConstraintPrompt('旧制度② (Type 2)', constraints.type2)}
${buildConstraintPrompt('旧制度③ (Type 3)', constraints.type3)}
${buildConstraintPrompt('新制度 (Type 4)', constraints.type4)}
`;

        const commonRules = [];
        commonRules.push("- 勤続、職能、考課ポイントの**単年度付与分**は、**絶対にマイナスにしてはいけない**（累計ポイントが減少しないこと）。");
        commonRules.push("- シミュレーションにおいては**「昇職・降職は発生しない」**（現在の資格等級が定年まで継続する）ものとして計算を行うこと。上位等級への昇格を前提としたポイント削減は禁止する。");

        const isGuaranteePreRevision = constraints.common.guaranteePreRevision || Object.values(constraints).some((c: ConstraintType) => c.guaranteePreRevision);
        if (isGuaranteePreRevision) {
            commonRules.push("- **【最重要：既得権益の完全保証】** 制度改定日時点の支給額（引当額）が、現行制度（B案）を下回らないようにすること。**全員分をチェックし、一人でも下回る場合は案を修正すること。** これにより、会計上の費用戻入（マイナス費用）が発生しないようにする。");
        } else {
            commonRules.push("- 既得権益（制度改定日時点の評価額）の減少は許容する（必須要件ではない）。費用戻入が発生しても構わない。");
        }

        const isGuaranteeBPlan = constraints.common.guaranteeBPlan || Object.values(constraints).some((c: ConstraintType) => c.guaranteeBPlan);
        if (isGuaranteeBPlan) {
            commonRules.push("- **【最重要：定年時支給額の完全保証】** 全社員について、定年退職時の支給総額見込が、現行制度（B案）を継続した場合の額を下回らないようにすること。**全員分をシミュレーションし、一人でも下回る場合はパラメータを調整して別案を作成すること（不利益変更の完全回避）。**");
        } else {
            commonRules.push("- 定年時の支給総額が現行制度（B案）を下回ることは許容する（コスト削減を優先してよい）。");
        }

        const prompt = `
あなたは人事制度および退職金財務の専門コンサルタントです。
京都バス株式会社の退職金シミュレーション結果（A案：変更案、B案：現行制度）に基づき、経営層向けの「詳細分析レポート」を作成してください。

**システム制約（前提条件）**:
- 当社は「完全ポイント制」です。基本給ベースアップは退職金に影響しません。
- 退職金 = (勤続Pt + 職能Pt +考課Pt) × 単価 × 支給率係数
- 分析対象期間: ${transitionYear}年度〜${transitionYear + 19}年度
- **現行制度（B案）の標準考課ポイント**: ${configB.defaultYearlyEval} Pt/年

**【現在のシミュレーション結果 (集計データ)】**
以下のCSVは、現在の設定における年度別の集計結果です（単位：千円）。
\`\`\`csv
${simulationResultCsv}
\`\`\`

**【分析レポートの構成 (必須項目)】**:
以下の項目を含む、プロフェッショナルな分析レポートを作成してください。

1. **エグゼクティブサマリー**:
   - A案とB案の主要な差異、および制度改定の必要性についての総括。
2. **財務リスク分析**:
   - B案（現行）を継続した場合の将来的な財務負担（引当金増加額、キャッシュアウトのピーク）の予測とリスク。
   - A案による財務リスクの軽減効果。
3. **制度改定による影響分析**:
   - 制度区分（Type1〜4）ごとの影響の度合い。
   - 既得権益の保護状況や、不利益変更の有無に関する評価。
4. **コスト削減および制度最適化の提案**:
   - 設定されたコスト削減目標（${targetReductionRange.min}% ～ ${targetReductionRange.max}%）を達成するための具体的な改善案。
   - 支給率係数、ポイント表、定年年齢、上限年数などの調整案。
   - なぜその提案が有効なのか、論理的な根拠。

**【参照データ: 現行制度(B案)のマスタ】**
**以下のデータを「変更禁止」項目の基準値（正解データ）として使用してください。**
**「変更禁止」の指示がある項目については、以下のCSVデータを一言一句違わずそのまま出力してください。**

[支給率係数 (現行)]
\`\`\`csv
${refCoef}
\`\`\`

[Type1 ポイント表 (現行)]
\`\`\`csv
${refT1}
\`\`\`

[Type2 ポイント表 (現行)]
\`\`\`csv
${refT2}
\`\`\`

[Type3 ポイント表 (現行)]
\`\`\`csv
${refT3}
\`\`\`

[Type4 ポイント表 (現行)]
\`\`\`csv
${refT4}
\`\`\`


**【提案における厳守事項 (絶対条件)】**:
以下の条件を**すべて**満たす制度改定案（A案）を作成してください。

1. **制度改定日**: 
   - **${transitionDateStr}** (移行基準日: ${baseDateStr})。

${constraintPrompt}

3. **全制度共通の制約（財務・ポイント設計）**:
${commonRules.join('\n')}

${targetInstruction}

**【数値フォーマット制約 (Strict Number Format)】**:
以下の精度を守ってデータを出力してください。
1. **支給率係数**: 小数点第2位まで (例: 0.85, 1.00)
2. **ポイント値**: 考課ポイントは整数 (例: 5)。勤続・職能ポイントは小数点第1位まで (例: 5.5)。
3. **年齢・年数**: 整数のみ (例: 60, 35)

**【データ出力 (厳守)】**:
提案内容をシステムに反映させるため、以下のコードブロックを必ずレポートの末尾に出力してください。
変更が必要なマスタのみ出力してください。
**注: CSVデータは「...」などで省略せず、必ず1年目〜47年目までの全ての行を出力してください。**
**注: ポイントマスタはパラメータ変更の有無にかかわらず、Type1, Type2, Type3, Type4 全てを必ず出力してください（変更がない場合は参照データをコピーして出力）。**

**1. 支給率係数マスタ (CSV)**
1つのCSVファイルで全タイプ(T1-T4)を含みます。
\`\`\`csv
# Type: Coef
Year,T1,T2,T3,T4
1,0.50,0.50,0.50,1.00
... (省略不可：47年目まですべて出力)
\`\`\`

**2. ポイントマスタ (CSV)**
**【超重要：ポイント値の出力形式】**
**必ず「単年度ごとの付与ポイント（その年に加算されるポイント数）」で出力してください。絶対に「累計値」で出力しないでください。**
系统側でこの値を年々積み上げて計算します。累計値を出力すると数値が過大になり、計算結果が誤ったものになります。
※ 参照データが累計値の場合は、単年度増分に変換して出力してください。

[出力例: 毎年5ポイントずつ付与される場合]
正 (単年度): 1年目 5.0, 2年目 5.0, 3年目 5.0 ...
誤 (累計): 1年目 5.0, 2年目 10.0, 3年目 15.0 ...

**必ず Type1〜Type4 すべてのCSVを個別のブロックで出力してください。**
カラムヘッダーは識別のため、以下の形式を必ず使用してください。

[Type1用]
\`\`\`csv
# Type: Point_Type1
年数,T1勤続,T1係員,主任,係長,課長,次長,部長
... (省略不可：47年目まですべて出力)
\`\`\`

[Type2用]
\`\`\`csv
# Type: Point_Type2
年数,T2勤続,T2係員,主任,係長,課長,次長,部長
... (省略不可：47年目まですべて出力)
\`\`\`

[Type3用]
\`\`\`csv
# Type: Point_Type3
年数,T3勤続,T3係員,主任,係長,課長,次長,部長
... (省略不可：47年目まですべて出力)
\`\`\`

[Type4用]
\`\`\`csv
# Type: Point_Type4
年数,T4勤続,T4係員,主任,係長,課長,次長,部長
... (省略不可：47年目まですべて出力)
\`\`\`

**3. パラメータ設定 (JSON)**
定年年齢、考課ポイント、上限年数。
「...Future」の項目が改定日以降の設定値です。変更しない場合はnullまたは省略してください。
**注: 変更許可した項目については提案値を、変更不可または指定値がある場合はその値を出力してください。**
**注: defaultYearlyEvalにはB案(現行)の値を設定してください。**
\`\`\`json
{
  "retirementAges": ${JSON.stringify(configB.retirementAges)},
  "retirementAgesFuture": { 
      "type1": ${(constraints.type1.fixedRetirementAge || constraints.common.fixedRetirementAge) || configB.retirementAges.type1}, 
      "type2": ${(constraints.type2.fixedRetirementAge || constraints.common.fixedRetirementAge) || configB.retirementAges.type2}, 
      "type3": ${(constraints.type3.fixedRetirementAge || constraints.common.fixedRetirementAge) || configB.retirementAges.type3}, 
      "type4": ${(constraints.type4.fixedRetirementAge || constraints.common.fixedRetirementAge) || configB.retirementAges.type4} 
  },
  "defaultYearlyEval": ${configB.defaultYearlyEval},
  "defaultYearlyEvalFuture": ${configB.defaultYearlyEval},
  "cutoffYears": ${JSON.stringify(configB.cutoffYears)},
  "cutoffYearsFuture": { 
      "type1": ${(constraints.type1.maxRankPointYears || constraints.common.maxRankPointYears) || configB.cutoffYears.type1}, 
      "type2": ${(constraints.type2.maxRankPointYears || constraints.common.maxRankPointYears) || configB.cutoffYears.type2}, 
      "type3": ${(constraints.type3.maxRankPointYears || constraints.common.maxRankPointYears) || configB.cutoffYears.type3},
      "type4": ${(constraints.type4.maxRankPointYears || constraints.common.maxRankPointYears) || configB.cutoffYears.type4}
  }
}
\`\`\`
`;
        callAI([], prompt, true);
    };

    const handleSendMessage = () => {
        if (!chatInput.trim() || isLoading) return;
        callAI(messages, chatInput, false);
        setChatInput('');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setChatInput(prev => {
                const prefix = prev ? prev + "\n" : "";
                return prefix + `【参照ファイル: ${file.name}】\n\`\`\`\n${content}\n\`\`\`\n`;
            });
        };
        reader.onerror = () => {
            setNotification({ type: 'error', message: "ファイルの読み込みに失敗しました。" });
            setTimeout(() => setNotification(null), 3000);
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };

    const handleApplyToConfigA = async () => {
        if (isApplying) return;
        setIsApplying(true);
        setError(null);
        setSuccessMsg(null);
        
        let processLog: string[] = [];
        
        try {
            console.log("Starting Apply Process...");
            
            // 1. Data Validation Check Before Start
            const hasCsv = csvMap.coef || csvMap.point_t1 || csvMap.point_t2 || csvMap.point_t3 || csvMap.point_t4;
            if (!hasCsv && !proposedSettings) {
                throw new Error("適用可能なデータが見つかりません。AIがデータを正しく生成できなかった可能性があります。\nレポートを再生成してください。");
            }

            if (!configA) {
                throw new Error("設定データ(ConfigA)がロードされていません。");
            }
            
            // Delay to ensure UI updates to "Applying" state
            await new Promise(resolve => setTimeout(resolve, 300));

            // 2. Clone Config
            const newConfigA = deepClone(configA);
            newConfigA.transitionConfig.enabled = true;
            newConfigA.transitionConfig.date = new Date(transitionDate);
            processLog.push(`・初期化: ConfigAを複製, 移行基準日を${baseDateStr}(改定日${transitionDateStr})に設定`);
 
            let anyApplied = false;
            let appliedStatus = { coef: false, t1: false, t2: false, t3: false, t4: false, param: false };

            // 3. Apply Coefs
            if (csvMap.coef) {
                processLog.push("・支給率係数CSVの解析開始");
                const rows = parseCsvBlock(csvMap.coef, "支給率係数", processLog);
                
                if (rows.length > 0) {
                    const csvHeaders = Object.keys(rows[0]);
                    const newCoefs: CoefSettings = { type1: [], type2: [], type3: [], type4: [] };
                    
                    rows.forEach((row: any) => {
                        const y = Math.round(getValRobust(row, csvHeaders, ['Year', '年数', 'y'], ['勤続']));
                        if (y > 0) {
                            newCoefs.type1.push({ years: y, coef: Math.round(getValRobust(row, csvHeaders, ['T1', 'Type1', '旧1'], ['勤続', 'pt']) * 100) / 100 });
                            newCoefs.type2.push({ years: y, coef: Math.round(getValRobust(row, csvHeaders, ['T2', 'Type2', '旧2'], ['勤続', 'pt']) * 100) / 100 });
                            newCoefs.type3.push({ years: y, coef: Math.round(getValRobust(row, csvHeaders, ['T3', 'Type3', '旧3'], ['勤続', 'pt']) * 100) / 100 });
                            newCoefs.type4.push({ years: y, coef: Math.round(getValRobust(row, csvHeaders, ['T4', 'Type4', '新'], ['勤続', 'pt']) * 100) / 100 });
                        }
                    });

                    if (newCoefs.type1.length > 0) {
                        (['type1', 'type2', 'type3', 'type4'] as const).forEach(k => {
                            newCoefs[k] = fillGaps(newCoefs[k], 47, true);
                            newCoefs[k].sort((a,b) => a.years - b.years);
                        });
                        newConfigA.coefSettingsFuture = newCoefs;
                        processLog.push(`  -> 成功: 支給率係数 (${newCoefs.type1.length}行)`);
                        anyApplied = true;
                        appliedStatus.coef = true;
                    } else {
                        processLog.push("  -> 警告: 支給率データの行が抽出できませんでした。");
                    }
                }
            }

            // 4. Apply Point Tables
            const updatePointTable = (csvText: string, typeKey: 'type1'|'type2'|'type3'|'type4', label: string, statusKey: keyof typeof appliedStatus) => {
                processLog.push(`・${label}の解析開始`);
                const rows = parseCsvBlock(csvText, label, processLog);
                if (rows.length > 0) {
                    const csvHeaders = Object.keys(rows[0]);
                    const roundPt = (v: number) => Math.round(v * 10) / 10;

                    let incrementalRows = rows.map((row: any) => ({
                        y: Math.round(getValRobust(row, csvHeaders, ['Year', '年数', 'y'], ['勤続'])),
                        los: roundPt(getValRobust(row, csvHeaders, ['Los', '勤続'])),
                        // Rank 1: exclude '勤続' to avoid '係員勤続' mismatch
                        r1: roundPt(getValRobust(row, csvHeaders, ['Rank1', '係員', 'r1', '1級'], ['勤続'])),
                        r2: roundPt(getValRobust(row, csvHeaders, ['Rank2', '主任', 'r2', '2級'], ['勤続'])),
                        r3: roundPt(getValRobust(row, csvHeaders, ['Rank3', '係長', 'r3', '3級'], ['勤続'])),
                        r4: roundPt(getValRobust(row, csvHeaders, ['Rank4', '課長', 'r4', '4級'], ['勤続'])),
                        r5: roundPt(getValRobust(row, csvHeaders, ['Rank5', '次長', 'r5', '5級'], ['勤続'])),
                        r6: roundPt(getValRobust(row, csvHeaders, ['Rank6', '部長', 'r6', '6級'], ['勤続']))
                    })).filter(r => r.y > 0).sort((a,b) => a.y - b.y);

                    if (incrementalRows.length > 0) {
                        // AIには単年度(増分)での出力を指示しているため、ここで累積計算を行う
                        let acc = { los:0, r1:0, r2:0, r3:0, r4:0, r5:0, r6:0 };
                        let cumulativeTable: TableRowT2[] = [];

                        for (const r of incrementalRows) {
                            acc.los = roundPt(acc.los + r.los);
                            acc.r1 = roundPt(acc.r1 + r.r1);
                            acc.r2 = roundPt(acc.r2 + r.r2);
                            acc.r3 = roundPt(acc.r3 + r.r3);
                            acc.r4 = roundPt(acc.r4 + r.r4);
                            acc.r5 = roundPt(acc.r5 + r.r5);
                            acc.r6 = roundPt(acc.r6 + r.r6);
                            
                            cumulativeTable.push({
                                y: r.y,
                                los: acc.los,
                                r1: acc.r1,
                                r2: acc.r2,
                                r3: acc.r3,
                                r4: acc.r4,
                                r5: acc.r5,
                                r6: acc.r6
                            });
                        }

                        cumulativeTable = fillGaps(cumulativeTable, 47, false);
                        newConfigA.masterDataFuture[typeKey] = cumulativeTable;
                        processLog.push(`  -> 成功: ${label} (${cumulativeTable.length}行) [増分データを累積変換しました]`);
                        anyApplied = true;
                        appliedStatus[statusKey] = true;
                    } else {
                        processLog.push(`  -> 警告: ${label}データの行が抽出できませんでした。`);
                    }
                }
            };

            if (csvMap.point_t1) updatePointTable(csvMap.point_t1, 'type1', 'Type1表', 't1');
            if (csvMap.point_t2) updatePointTable(csvMap.point_t2, 'type2', 'Type2表', 't2');
            if (csvMap.point_t3) updatePointTable(csvMap.point_t3, 'type3', 'Type3表', 't3');
            if (csvMap.point_t4) updatePointTable(csvMap.point_t4, 'type4', 'Type4表', 't4');

            // 5. Apply Settings
            if (proposedSettings) {
                processLog.push("・パラメータ設定の適用");
                const p = proposedSettings;
                let paramUpdated = false;
                
                // Current Params
                if (safeNum(p.defaultYearlyEval) !== undefined) {
                    newConfigA.defaultYearlyEval = Math.round(safeNum(p.defaultYearlyEval)!);
                    paramUpdated = true;
                }
                if (p.retirementAges) {
                    const ra = p.retirementAges;
                    newConfigA.retirementAges = { 
                        type1: safeNum(ra.type1) ?? newConfigA.retirementAges.type1,
                        type2: safeNum(ra.type2) ?? newConfigA.retirementAges.type2,
                        type3: safeNum(ra.type3) ?? newConfigA.retirementAges.type3,
                        type4: safeNum(ra.type4) ?? newConfigA.retirementAges.type4,
                    };
                    paramUpdated = true;
                }
                if (p.cutoffYears) {
                    const cy = p.cutoffYears;
                    newConfigA.cutoffYears = {
                        type1: safeNum(cy.type1) ?? newConfigA.cutoffYears.type1,
                        type2: safeNum(cy.type2) ?? newConfigA.cutoffYears.type2,
                        type3: safeNum(cy.type3) ?? newConfigA.cutoffYears.type3,
                        type4: safeNum(cy.type4) ?? newConfigA.cutoffYears.type4,
                    };
                    paramUpdated = true;
                }

                // Future Params
                if (safeNum(p.defaultYearlyEvalFuture) !== undefined) {
                    newConfigA.defaultYearlyEvalFuture = Math.round(safeNum(p.defaultYearlyEvalFuture)!);
                    const v = newConfigA.defaultYearlyEvalFuture;
                    processLog.push(`  - 標準考課Pt(将来): ${v}pt に更新`);
                    paramUpdated = true;
                }
                if (p.retirementAgesFuture) {
                    const ra = p.retirementAgesFuture;
                    newConfigA.retirementAgesFuture = { 
                        type1: safeNum(ra.type1) ?? newConfigA.retirementAgesFuture.type1,
                        type2: safeNum(ra.type2) ?? newConfigA.retirementAgesFuture.type2,
                        type3: safeNum(ra.type3) ?? newConfigA.retirementAgesFuture.type3,
                        type4: safeNum(ra.type4) ?? newConfigA.retirementAgesFuture.type4,
                    };
                    const r = newConfigA.retirementAgesFuture;
                    processLog.push(`  - 定年年齢(将来): T1:${r.type1}, T2:${r.type2}, T3:${r.type3}, T4:${r.type4}歳 に更新`);
                    paramUpdated = true;
                }
                if (p.cutoffYearsFuture) {
                    const cy = p.cutoffYearsFuture;
                    newConfigA.cutoffYearsFuture = {
                        type1: safeNum(cy.type1) ?? newConfigA.cutoffYearsFuture.type1,
                        type2: safeNum(cy.type2) ?? newConfigA.cutoffYearsFuture.type2,
                        type3: safeNum(cy.type3) ?? newConfigA.cutoffYearsFuture.type3,
                        type4: safeNum(cy.type4) ?? newConfigA.cutoffYearsFuture.type4,
                    };
                    const c = newConfigA.cutoffYearsFuture;
                    processLog.push(`  - 上限年数(将来): T1:${c.type1}, T2:${c.type2}, T3:${c.type3}, T4:${c.type4}年 に更新`);
                    paramUpdated = true;
                }

                if (paramUpdated) {
                    processLog.push("  -> 成功: パラメータ設定");
                    anyApplied = true;
                    appliedStatus.param = true;
                }
            }

            if (!anyApplied) {
                throw new Error("有効な更新データが一つも見つかりませんでした。");
            }

            // 6. Sanitize check to prevent NaN crash in Parent
            const checkNaN = (obj: any): boolean => {
                if (typeof obj === 'number') return isNaN(obj);
                if (obj && typeof obj === 'object') return Object.values(obj).some(checkNaN);
                return false;
            };
            
            // 簡易チェック
            if (newConfigA.masterDataFuture.type4.some(r => isNaN(r.los) || isNaN(r.r1))) {
                console.warn("Detected NaN in new configuration, simple sanitization applied.");
                processLog.push("警告: データ内に不正な数値(NaN)が検出されました。");
            }

            // 7. Commit to Parent
            onApplyProposal(newConfigA);
            
            setSuccessMsg(`【反映成功】\nパターンAの「将来設定」を更新しました。\n\n詳細:\n` + processLog.join('\n'));
            
            // Scroll to success message
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);

        } catch(e: any) {
            console.error("Apply Error:", e);
            const errDetail = processLog.length > 0 ? `\n\n[処理ログ]\n${processLog.join('\n')}` : "";
            const msg = `反映処理中にエラーが発生しました。\n${e.message}${errDetail}`;
            
            // 画面上のエラーボックスにも表示
            setError(msg);
            
            // エラー箇所へスクロール
            setTimeout(() => {
                if (errorRef.current) errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        } finally {
            setIsApplying(false);
        }
    };

    const handleDownloadCsv = (content: string, filename: string) => {
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadReportText = () => {
        if (messages.length === 0) return;
        const textContent = messages.map(m => `[${m.role === 'user' ? 'USER' : 'AI'} - ${m.timestamp.toLocaleString()}]\n${m.text}\n`).join('\n-------------------\n');
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `AI分析レポート_${new Date().toISOString().slice(0,10)}.txt`;
        link.click();
    };

    const handleDownloadPdf = async () => {
        if (isPdfGenerating) return;
        setIsPdfGenerating(true);
        const element = document.getElementById('ai-report-content');
        if (!element) {
            setIsPdfGenerating(false);
            return;
        }
        
        try {
            // Capture container. Note: HTML2Canvas might clip scrollable content unless properly configured.
            // For a simple report snapshot, standard capture is often enough. 
            // If full chat history is needed in PDF, we'd typically render it to a hidden full-height div first.
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: element.scrollWidth
            });
            
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const imgProps = pdf.getImageProperties(imgData);
            const pdfImgHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            let heightLeft = pdfImgHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfImgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft >= 0) {
              position = heightLeft - pdfImgHeight;
              pdf.addPage();
              pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfImgHeight);
              heightLeft -= pdfHeight;
            }
            
            pdf.save(`AI分析レポート_${new Date().toISOString().slice(0,10)}.pdf`);
        } catch (e) {
            console.error(e);
            setNotification({ type: 'error', message: "PDF生成に失敗しました。印刷機能(PDF保存)をご利用ください。" });
            setTimeout(() => setNotification(null), 5000);
        } finally {
            setIsPdfGenerating(false);
        }
    };

    const renderMarkdown = (text: string) => {
        if (!text) return null;
        
        const parts = text.split(/(```[\s\S]*?```)/g);

        return parts.map((part, idx) => {
            if (part.startsWith('```')) {
                const content = part.replace(/^```[a-z]*\n?|```$/g, '');
                return (
                    <div key={idx} className="bg-slate-800 text-slate-100 p-3 rounded my-2 text-xs font-mono overflow-x-auto touch-pan-y">
                        <pre>{content}</pre>
                    </div>
                );
            }
            return (
                <div key={idx} className="whitespace-pre-wrap">
                    {part.split('\n').map((line, i) => {
                        if (line.trim().startsWith('###')) {
                             return <h4 key={i} className="font-bold text-lg mt-4 mb-2 text-slate-800">{line.replace(/^#+\s*/, '')}</h4>;
                        }
                        if (line.trim().startsWith('##')) {
                             return <h3 key={i} className="font-bold text-xl mt-5 mb-2 text-slate-800 border-b pb-1">{line.replace(/^#+\s*/, '')}</h3>;
                        }
                        if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
                            return <p key={i} className="font-bold my-1">{line.replace(/\*\*/g, '')}</p>;
                        }
                        
                        const segments = line.split(/(\*\*.*?\*\*|`.*?`)/g);
                        return (
                            <div key={i} className="min-h-[1em] py-0.5">
                                {segments.map((seg, j) => {
                                    if (seg.startsWith('**') && seg.endsWith('**')) {
                                        return <span key={j} className="font-bold text-slate-900">{seg.slice(2, -2)}</span>;
                                    }
                                    if (seg.startsWith('`') && seg.endsWith('`')) {
                                        return <code key={j} className="bg-slate-100 px-1 py-0.5 rounded text-red-500 font-mono text-xs">{seg.slice(1, -1)}</code>;
                                    }
                                    return <span key={j}>{seg}</span>;
                                })}
                            </div>
                        );
                    })}
                </div>
            );
        });
    };

    return (
        <>
            <div className="mt-12 border-t-2 border-slate-200 pt-10 print-break-inside-avoid">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-6 no-print">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-100 rounded-xl text-purple-600">
                        <Sparkles className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800">比較シミュレーション 2026</h3>
                        <p className="text-slate-500">Gemini AIがシミュレーション結果を分析し、改善案とマスタ案を作成します。</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 no-print mx-auto space-y-6">
                
                {/* 1. コスト削減目標 */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <h4 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                        <Target className="w-5 h-5 text-indigo-600"/>
                        コスト削減目標の設定
                    </h4>
                    <button onClick={() => setEnableTarget(!enableTarget)} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition ${enableTarget ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {enableTarget ? <ToggleRight className="w-5 h-5"/> : <ToggleLeft className="w-5 h-5"/>}
                        {enableTarget ? '目標を設定する' : '目標なし(分析のみ)'}
                    </button>
                </div>
                
                {enableTarget && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6 animate-in fade-in slide-in-from-top-2">
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-slate-500 mb-1">現行(B案)の毎年の引当増加額に対する削減率</label>
                            <div className="flex items-center gap-3">
                                <div className="relative w-28">
                                    <input 
                                        type="number" min="0" max="100" 
                                        value={targetReductionRange.min} 
                                        onChange={(e) => setTargetReductionRange(prev => ({...prev, min: Number(e.target.value)}))} 
                                        className="w-full pl-4 pr-8 py-3 border border-slate-300 rounded-lg font-bold text-lg focus:ring-2 focus:ring-indigo-500 text-right" 
                                        placeholder="10" 
                                    />
                                    <div className="absolute right-3 top-3.5 text-slate-400 font-bold text-sm">%</div>
                                </div>
                                <div className="text-slate-400 font-bold px-1">～</div>
                                <div className="relative w-28">
                                    <input 
                                        type="number" min="0" max="100" 
                                        value={targetReductionRange.max} 
                                        onChange={(e) => setTargetReductionRange(prev => ({...prev, max: Number(e.target.value)}))} 
                                        className="w-full pl-4 pr-8 py-3 border border-slate-300 rounded-lg font-bold text-lg focus:ring-2 focus:ring-indigo-500 text-right" 
                                        placeholder="20" 
                                    />
                                    <div className="absolute right-3 top-3.5 text-slate-400 font-bold text-sm">%</div>
                                </div>
                                <div className="text-sm text-emerald-600 font-bold flex items-center gap-1 ml-2"><TrendingDown className="w-4 h-4"/> 削減を目指す</div>
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-50 p-4 rounded-lg text-xs text-slate-500 leading-relaxed border border-slate-200">
                            <span className="font-bold text-indigo-600">AIへの指示:</span><br/>
                            B案と比較して、{transitionYear}-{transitionYear + 9}年度の期間で年間の引当金費用を<span className="font-bold">{targetReductionRange.min}% ～ {targetReductionRange.max}%</span>程度抑制できるような案を提案させます。<br/>※ 改定日は<span className="font-bold">{transitionDateStr}</span>で固定されます。
                        </div>
                    </div>
                )}

                {/* 2. 制度区分ごとの詳細制約 */}
                <div className="pt-4 border-t border-slate-100">
                    <h4 className="font-bold text-slate-700 flex items-center gap-2 text-lg mb-4">
                        <Settings className="w-5 h-5 text-indigo-600"/>
                        前提条件の詳細設定 (制度区分別)
                    </h4>
                    
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 bg-white overflow-x-auto scrollbar-hide">
                            {[
                                { k: 'common', l: '全制度共通' },
                                { k: 'type1', l: '旧制度①' },
                                { k: 'type2', l: '旧制度②' },
                                { k: 'type3', l: '旧制度③' },
                                { k: 'type4', l: '新制度' },
                            ].map(t => (
                                <button
                                    key={t.k}
                                    onClick={() => setActiveConstraintTab(t.k as any)}
                                    className={`flex-1 py-3 text-sm font-bold transition border-b-2 ${activeConstraintTab === t.k ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                                >
                                    {t.l}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="p-6 bg-white space-y-6">
                            {/* ... (Existing Fields) ... */}
                            {activeConstraintTab === 'common' && (
                                <div className="bg-orange-50 border border-orange-100 p-3 rounded text-xs text-orange-800 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4"/>
                                    <span>ここで設定した内容は、各制度区分で「個別指定」がない場合のデフォルト設定として適用されます。</span>
                                </div>
                            )}

                            {/* 定年年齢設定 */}
                            <div className="flex items-center gap-6">
                                <div className="w-40 font-bold text-slate-700 text-sm">定年年齢の変更</div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="number" 
                                        placeholder="現行維持" 
                                        value={constraints[activeConstraintTab].fixedRetirementAge}
                                        onChange={(e) => updateConstraint('fixedRetirementAge', e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-24 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-right"
                                    />
                                    <span className="text-sm text-slate-500">歳 とする (空欄なら現行B案を維持)</span>
                                </div>
                            </div>

                            {/* 変更許可フラグ */}
                            <div className="flex items-start gap-6">
                                <div className="w-40 font-bold text-slate-700 text-sm pt-1">変更可能な項目</div>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={constraints[activeConstraintTab].allowPointTableChange}
                                            onChange={(e) => updateConstraint('allowPointTableChange', e.target.checked)}
                                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">勤続ポイント表・職能ポイント表</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={constraints[activeConstraintTab].allowEvalPointChange}
                                            onChange={(e) => updateConstraint('allowEvalPointChange', e.target.checked)}
                                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">標準考課ポイント</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={constraints[activeConstraintTab].allowCoefChange}
                                            onChange={(e) => updateConstraint('allowCoefChange', e.target.checked)}
                                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">支給率係数</span>
                                    </label>
                                </div>
                            </div>

                            {/* 職能P上限 */}
                            {activeConstraintTab !== 'type4' && (
                                <div className="flex items-center gap-6 border-t border-slate-100 pt-4">
                                    <div className="w-40 font-bold text-slate-700 text-sm">職能ポイント上限</div>
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="number" 
                                            placeholder="現行維持" 
                                            value={constraints[activeConstraintTab].maxRankPointYears}
                                            onChange={(e) => updateConstraint('maxRankPointYears', e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-24 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-right"
                                        />
                                        <span className="text-sm text-slate-500">年 まで延長可 (空欄なら現行維持)</span>
                                    </div>
                                </div>
                            )}

                            {/* 新規追加: 保証フラグ */}
                            <div className="flex items-start gap-6 border-t border-slate-100 pt-4">
                                <div className="w-40 font-bold text-slate-700 text-sm pt-1">既得権・支給額保証</div>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={constraints[activeConstraintTab].guaranteePreRevision}
                                            onChange={(e) => updateConstraint('guaranteePreRevision', e.target.checked)}
                                            className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                                        />
                                        <span className="text-sm text-slate-700">制度改定前の支給額の最低保証（既得権保証）</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={constraints[activeConstraintTab].guaranteeBPlan}
                                            onChange={(e) => updateConstraint('guaranteeBPlan', e.target.checked)}
                                            className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                                        />
                                        <span className="text-sm text-slate-700">定年時のB案支給額の保証（不利益変更なし）</span>
                                    </label>
                                </div>
                            </div>

                            {/* 自由記述 */}
                            <div className="border-t border-slate-100 pt-4">
                                <div className="font-bold text-slate-700 text-sm mb-2 flex items-center gap-2">
                                    <Edit3 className="w-4 h-4 text-slate-400"/>
                                    その他、制約条件（自由記述）
                                </div>
                                <textarea 
                                    className="w-full p-3 border border-slate-300 rounded-lg text-sm h-24 focus:ring-2 focus:ring-indigo-500 resize-none"
                                    placeholder="例: 支給率は勤続20年未満は変更不可。20年以上は0.8を下限とする... など"
                                    value={constraints[activeConstraintTab].customInstruction}
                                    onChange={(e) => updateConstraint('customInstruction', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {messages.length === 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-end mb-8 no-print gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-bold text-slate-500 flex items-center gap-1">
                            <Bot className="w-4 h-4 text-indigo-500" />
                            使用AI:
                        </label>
                        <select 
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value as any)}
                            disabled={isLoading}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-400"
                        >
                            <option value="pro">PRO (高性能・推論重視)</option>
                            <option value="flash">FLASH (高速・バランス)</option>
                            <option value="lite">LITE (最速・軽量)</option>
                        </select>
                    </div>
                    {isLoading ? (
                        <button onClick={handleCancel} className="px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-3 transition-all bg-red-500 text-white hover:bg-red-600 hover:scale-105">
                            <AlertCircle className="w-6 h-6" />
                            分析を中止する
                        </button>
                    ) : (
                        <button onClick={handleGenerateReport} className="px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-3 transition-all bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:scale-105 hover:shadow-xl">
                            <FileText className="w-6 h-6" />
                            分析レポートを作成する
                        </button>
                    )}
                </div>
            )}

            {error && (
                <div id="ai-report-error" ref={errorRef} className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl flex items-center gap-3 mb-6 whitespace-pre-wrap">
                    <AlertTriangle className="w-6 h-6 shrink-0 mt-1" />
                    <div><div className="font-bold">生成または適用エラー</div><div className="text-sm font-mono mt-1">{error}</div></div>
                </div>
            )}
            
            {successMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-6 rounded-xl flex items-start gap-3 mb-6 whitespace-pre-wrap animate-in fade-in slide-in-from-top-2">
                    <Check className="w-6 h-6 shrink-0 mt-1" />
                    <div><div className="text-sm font-mono mt-1 leading-relaxed">{successMsg}</div></div>
                </div>
            )}

            {/* Chat Interface (Shows after initial generation) */}
            {messages.length > 0 && (
                <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 print:block">
                    {!isChatVisible ? (
                        <div className="flex justify-center no-print">
                            <button 
                                onClick={() => setIsChatVisible(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-full font-bold shadow-lg hover:bg-slate-700 transition"
                            >
                                <MessageSquare className="w-5 h-5 text-indigo-300" />
                                AI分析チャットを再表示する
                            </button>
                        </div>
                    ) : (
                        /* Chat Window */
                        <div id="ai-report-content" className="bg-white shadow-xl border border-slate-200 mx-auto w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col">
                            <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center no-print">
                                <div className="flex items-center gap-3">
                                    <Bot className="w-6 h-6 text-indigo-300" />
                                    <span className="font-bold">AI Consultant Chat</span>
                                    <div className="ml-4 flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-full">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Model:</span>
                                        <select 
                                            value={selectedModel}
                                            onChange={(e) => setSelectedModel(e.target.value as any)}
                                            className="bg-transparent text-xs font-bold text-indigo-300 outline-none cursor-pointer"
                                        >
                                            <option value="pro" className="bg-slate-800 text-white">PRO</option>
                                            <option value="flash" className="bg-slate-800 text-white">FLASH</option>
                                            <option value="lite" className="bg-slate-800 text-white">LITE</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-slate-400 font-mono uppercase">{selectedModel}</div>
                                    <button 
                                        onClick={() => setIsChatVisible(false)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition text-xs font-bold text-slate-300 hover:text-white"
                                    >
                                        <X className="w-4 h-4" />
                                        <span>閉じる</span>
                                    </button>
                                </div>
                            </div>

                        <div className="p-6 bg-slate-50 min-h-[400px] max-h-[800px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 space-y-6">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-purple-100 text-purple-600'}`}>
                                        {msg.role === 'user' ? <UserIcon className="w-5 h-5"/> : <Bot className="w-6 h-6"/>}
                                    </div>
                                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`rounded-2xl p-5 shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                                            {renderMarkdown(msg.text)}
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                                            {msg.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                        <Loader2 className="w-5 h-5 animate-spin"/>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2 text-slate-500 text-sm">
                                        考え中... <span className="animate-pulse">...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-slate-200 no-print">
                            <div className="relative flex items-center gap-3">
                                {/* Hidden File Input */}
                                <input 
                                    type="file" 
                                    ref={fileUploadRef}
                                    className="hidden"
                                    accept=".txt,.csv,.json,.md,.log,.xml,.js,.ts,.html,.css"
                                    onChange={handleFileUpload}
                                />
                                <textarea 
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="AIに追加の指示を出す (例: 定年を65歳に変更して、再計算してください)"
                                    className="w-full p-3 pr-24 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-14"
                                />
                                <div className="absolute right-2 top-2 flex items-center gap-1">
                                    {isLoading ? (
                                        <button 
                                            onClick={handleCancel}
                                            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center gap-1 px-3"
                                            title="中止"
                                        >
                                            <AlertCircle className="w-5 h-5" />
                                            <span className="text-xs font-bold">中止</span>
                                        </button>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => fileUploadRef.current?.click()}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                                                title="テキストファイルを読み込む"
                                            >
                                                <Upload className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={handleSendMessage}
                                                disabled={!chatInput.trim() || isLoading}
                                                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                                            >
                                                <Send className="w-5 h-5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                    {/* Action Dashboard (No Print) */}
                    <div className="no-print w-full max-w-5xl mx-auto bg-slate-100 border border-slate-200 rounded-2xl p-6 shadow-inner">
                        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                             <ListChecks className="w-5 h-5 text-indigo-600"/>
                             ネクストアクション
                        </h3>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Apply Proposal Panel */}
                            <div className="bg-white border border-indigo-100 rounded-xl p-5 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                <h4 className="font-bold text-indigo-800 flex items-center gap-2 mb-2">
                                    <Sparkles className="w-5 h-5"/> AI提案の反映
                                </h4>
                                
                                <p className="text-sm text-slate-600 mb-4">
                                    AIがチャットで提案した最新の改善案（マスタデータ・係数・各種パラメータ）を<span className="font-bold text-indigo-700">パターンA（変更案）</span>に反映し、シミュレーションを実行します。
                                    <br/><span className="text-xs text-slate-400">※改定日は自動的に {transitionDateStr} に設定されます。</span>
                                </p>
                                
                                {hasAnyCsv ? (
                                    <div className="mb-4 bg-indigo-50/50 p-3 rounded border border-indigo-100 text-xs">
                                        <div className="font-bold text-indigo-700 mb-1 flex items-center gap-1"><Database className="w-3 h-3"/> 抽出完了データ:</div>
                                        <div className="flex flex-wrap gap-1">
                                            {extractedDataSummary.map(k => (
                                                <span key={k} className="px-2 py-0.5 bg-white border border-indigo-200 rounded text-indigo-600 font-bold">{k}</span>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-4 bg-orange-50 p-3 rounded border border-orange-100 text-xs text-orange-700 font-bold flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4"/> 反映可能なデータがまだありません。
                                    </div>
                                )}
                                
                                <div className="flex flex-col gap-3">
                                    <button 
                                        type="button"
                                        onClick={handleApplyToConfigA}
                                        disabled={isApplying || !hasAnyCsv}
                                        className={`${isApplying ? 'bg-slate-400 cursor-wait' : !hasAnyCsv ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-md transition-all hover:shadow-lg`}
                                    >
                                        {isApplying ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightCircle className="w-5 h-5" />}
                                        {isApplying ? '反映中...' : 'A案に反映して再計算'}
                                    </button>
                                    
                                    <div className="flex flex-wrap items-center gap-2 justify-center mt-1">
                                        {csvMap.coef && (
                                            <button onClick={() => handleDownloadCsv(csvMap.coef!, 'AI提案_支給率係数.csv')} className="text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition">
                                                <Download className="w-3 h-3" /> 支給率CSV
                                            </button>
                                        )}
                                        {csvMap.point_t1 && (
                                            <button onClick={() => handleDownloadCsv(csvMap.point_t1!, 'AI提案_Type1ポイント.csv')} className="text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-2 py-1 rounded flex items-center gap-1 transition">
                                                <Download className="w-3 h-3" /> Type1
                                            </button>
                                        )}
                                            {csvMap.point_t2 && (
                                            <button onClick={() => handleDownloadCsv(csvMap.point_t2!, 'AI提案_Type2ポイント.csv')} className="text-xs text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 px-2 py-1 rounded flex items-center gap-1 transition">
                                                <Download className="w-3 h-3" /> Type2
                                            </button>
                                        )}
                                            {csvMap.point_t3 && (
                                            <button onClick={() => handleDownloadCsv(csvMap.point_t3!, 'AI提案_Type3ポイント.csv')} className="text-xs text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded flex items-center gap-1 transition">
                                                <Download className="w-3 h-3" /> Type3
                                            </button>
                                        )}
                                        {csvMap.point_t4 && (
                                            <button onClick={() => handleDownloadCsv(csvMap.point_t4!, 'AI提案_Type4ポイント.csv')} className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1 transition">
                                                <Download className="w-3 h-3" /> Type4
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Export / Print Panel */}
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                                <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
                                    <FileText className="w-5 h-5"/> レポートの保存・印刷
                                </h4>
                                <p className="text-sm text-slate-600 mb-4">
                                    表示されている分析チャットの内容をテキストファイルとして保存、またはPDFとして出力します。
                                </p>
                                <div className="mt-auto grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button onClick={handleDownloadReportText} className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 px-3 py-3 rounded-lg hover:bg-white hover:border-slate-300 transition font-bold text-sm">
                                        <FileText className="w-4 h-4" /> Text
                                    </button>
                                    <button 
                                        onClick={handleDownloadPdf} 
                                        disabled={isPdfGenerating}
                                        className="flex items-center justify-center gap-2 bg-red-50 text-red-700 border border-red-200 px-3 py-3 rounded-lg hover:bg-red-100 hover:border-red-300 transition font-bold text-sm"
                                    >
                                        {isPdfGenerating ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileType className="w-4 h-4" />} PDF
                                    </button>
                                    <button onClick={() => window.print()} className="flex items-center justify-center gap-2 bg-slate-800 text-white px-3 py-3 rounded-lg hover:bg-slate-700 transition font-bold shadow-md text-sm">
                                        <Printer className="w-4 h-4" /> 印刷
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        {notification && (
            <div className={`fixed bottom-4 right-4 z-[100] p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
                notification.type === 'success' ? 'bg-emerald-500 text-white' : 
                notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white'
            }`}>
                {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : 
                 notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                <span className="font-medium">{notification.message}</span>
                <button onClick={() => setNotification(null)} className="ml-2 hover:bg-white/20 rounded p-0.5 transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
        )}
        </>
    );
};