
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { 
    Calculator, Settings, Download, Upload, Search, 
    FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, Sliders,
    FileDown, Database, Trash2, ShieldCheck, RotateCcw, Copy, FileText,
    PieChart, Users, Medal, ChevronDown, ChevronUp, UserPlus, Calendar, ArrowRightCircle, HelpCircle,
    Play, Lock, RefreshCw, BookOpen, MessageSquare, X, Moon, Sun
} from 'lucide-react';
import { 
    EmployeeInputRow, TableRowT1, TableRowT2, CoefSettings, 
    CalculationResult, SimulationConfig, FractionConfig, AggregatedYearlyData
} from './types';
import { 
    SAMPLE_EMPLOYEE_DATA, DEFAULT_TABLE_1_1, DEFAULT_TABLE_1_2, DEFAULT_TABLE_1_3, DEFAULT_TABLE_2, 
    DEFAULT_COEF_SETTINGS, T1_CSV_HEADERS, T2_CSV_HEADERS, 
    COEF_CSV_HEADERS, COL_ALIASES, EMPLOYEE_CSV_HEADERS
} from './constants';
import { processRow, roundTo2, formatDateWithWareki, parseDate, calculatePeriodYears, deepClone } from './utils';
import { ResultCard } from './components/ResultCard';
import { AnnualCostChart } from './components/AnnualCostChart';
import { HelpModal } from './components/HelpModal';
import { MasterEditorModal } from './components/MasterEditorModal';
import { AIAnalysisReport } from './components/AIAnalysisReport';
import { AIChatMode } from './components/AIChatMode';
import ErrorBoundary from './components/ErrorBoundary';

// 旧制度マスタ(T1形式)を新制度マスタ(T2形式)の構造に変換するヘルパー
const convertT1toT2 = (t1: TableRowT1[]): TableRowT2[] => {
    return t1.map(row => ({
        y: row.y,
        los: row.los1, // 旧勤続 -> 新勤続
        r1: row.r1_1,  // 旧係員 -> 新係員
        r2: row.r2,
        r3: row.r3,
        r4: row.r4,
        r5: row.r5,
        r6: row.r6
    }));
};

// デフォルト設定
const DEFAULT_CONFIG: Omit<SimulationConfig, 'label'> = {
    unitPrice: 10000,
    // 現行
    defaultYearlyEval: 0,
    retirementAges: { type1: 60, type2: 60, type3: 60, type4: 60 },
    cutoffYears: { type1: 35, type2: 36, type3: 37, type4: 38 },
    // 将来
    defaultYearlyEvalFuture: 0,
    retirementAgesFuture: { type1: 60, type2: 60, type3: 60, type4: 60 },
    cutoffYearsFuture: { type1: 35, type2: 36, type3: 37, type4: 38 },

    transitionConfig: { enabled: false, date: new Date(2027, 2, 31) }, // 2027/03/31
    adjustmentConfig: { 
        enabled: false,
        retirementAges: { type1: 65, type2: 65, type3: 65, type4: 65 },
        targetTypes: { type1: true, type2: true, type3: true, type4: true } // Default all true
    }, 
    unifyNewSystemConfig: {
        enabled: false,
        retirementAges: { type1: 60, type2: 60, type3: 65, type4: 65 },
        targetTypes: { type1: false, type2: false, type3: true, type4: true }
    },
    masterData1_1: DEFAULT_TABLE_1_1,
    masterData1_2: DEFAULT_TABLE_1_2,
    masterData1_3: DEFAULT_TABLE_1_3,
    masterData2: DEFAULT_TABLE_2,
    masterDataFuture: {
        type1: convertT1toT2(DEFAULT_TABLE_1_1), // 旧制度1の現行値をデフォルトに
        type2: convertT1toT2(DEFAULT_TABLE_1_2), // 旧制度2の現行値をデフォルトに
        type3: convertT1toT2(DEFAULT_TABLE_1_3), // 旧制度3の現行値をデフォルトに
        type4: DEFAULT_TABLE_2,                  // 新制度の現行値をデフォルトに
    },
    coefSettings: DEFAULT_COEF_SETTINGS,
    coefSettingsFuture: DEFAULT_COEF_SETTINGS,
};

export default function App() {
    // --- State ---
    const [data, setData] = useState<EmployeeInputRow[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('retirement-sim-data');
            return saved ? JSON.parse(saved) : [];
        }
        return [];
    }); 
    const [showHelp, setShowHelp] = useState<boolean>(false);
    const [showChatMode, setShowChatMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('retirement-sim-view-chat') === 'true';
        }
        return false;
    });
    const [darkMode, setDarkMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('retirement-sim-dark-mode');
            return saved === 'true';
        }
        return false;
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-dark-mode', String(darkMode));
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-data', JSON.stringify(data));
    }, [data]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-view-chat', String(showChatMode));
    }, [showChatMode]);
    
    // Deep Clone for independence
    const [configA, setConfigA] = useState<SimulationConfig>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('retirement-sim-config-a');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.transitionConfig?.date) parsed.transitionConfig.date = new Date(parsed.transitionConfig.date);
                    return parsed;
                } catch (e) { console.error(e); }
            }
        }
        return { 
            ...deepClone(DEFAULT_CONFIG), 
            label: 'パターンA (変更案)',
            transitionConfig: { enabled: false, date: new Date(2027, 2, 31) }
        };
    });
    const [configB, setConfigB] = useState<SimulationConfig>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('retirement-sim-config-b');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.transitionConfig?.date) parsed.transitionConfig.date = new Date(parsed.transitionConfig.date);
                    return parsed;
                } catch (e) { console.error(e); }
            }
        }
        return { ...deepClone(DEFAULT_CONFIG), label: 'パターンB (現行制度)' };
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-config-a', JSON.stringify(configA));
    }, [configA]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-config-b', JSON.stringify(configB));
    }, [configB]);

    const [status, setStatus] = useState<string>('待機中');
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [progress, setProgress] = useState<number>(0);
    const [isCalculating, setIsCalculating] = useState<boolean>(false);
    
    // Manual Trigger
    const [calcTrigger, setCalcTrigger] = useState<number>(0);
    
    // Master Editor State
    const [editingPattern, setEditingPattern] = useState<'A' | 'B' | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('retirement-sim-editing-pattern');
            return (saved === 'A' || saved === 'B') ? saved : null;
        }
        return null;
    });

    useEffect(() => {
        if (editingPattern) localStorage.setItem('retirement-sim-editing-pattern', editingPattern);
        else localStorage.removeItem('retirement-sim-editing-pattern');
    }, [editingPattern]);
    const [editorInitialTab, setEditorInitialTab] = useState<'masterData2' | 'future'>('masterData2');

    // Aggregated Data for Chart
    const [aggregatedData, setAggregatedData] = useState<AggregatedYearlyData[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('retirement-sim-aggregated');
            return saved ? JSON.parse(saved) : [];
        }
        return [];
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-aggregated', JSON.stringify(aggregatedData));
    }, [aggregatedData]);

    // Settings (Hidden/Fixed)
    const [fractionConfig] = useState<FractionConfig>({ 
        los: 'ceil', rank: 'ceil', eval: 'ceil', 
        losDateMode: 'end_of_month', rankDateMode: 'end_of_month', evalDateMode: 'end_of_month' 
    });
    const [includeCurrentFiscalYear] = useState<boolean>(false);

    // Search State
    const [searchTerm, setSearchTerm] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('retirement-sim-search-term') || '';
        }
        return '';
    });
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('retirement-sim-selected-id');
        }
        return null;
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-search-term', searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        if (selectedEmployeeId) localStorage.setItem('retirement-sim-selected-id', selectedEmployeeId);
        else localStorage.removeItem('retirement-sim-selected-id');
    }, [selectedEmployeeId]);
    const [searchError, setSearchError] = useState<string | null>(null);

    // Analysis View State
    const [showAnalysis, setShowAnalysis] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('retirement-sim-view-analysis') === 'true';
        }
        return false;
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-view-analysis', String(showAnalysis));
    }, [showAnalysis]);

    // Helper to run calculation
    const runCalculation = useCallback((
        row: EmployeeInputRow, 
        config: SimulationConfig, 
        targetB: number | undefined = undefined,
        targetReserve2026: number | undefined = undefined
    ) => {
        return processRow(
            row, 
            config.masterData1_1, 
            config.masterData1_2, 
            config.masterData1_3, 
            config.masterData2, 
            config.masterDataFuture, // Pass future master
            config.retirementAges, 
            config.cutoffYears, 
            config.coefSettings, 
            config.coefSettingsFuture, // Pass future coef
            config.defaultYearlyEval, 
            fractionConfig, 
            includeCurrentFiscalYear, 
            config.unitPrice,
            config.transitionConfig, // Pass transition config
            config.retirementAgesFuture, // New Future Params
            config.cutoffYearsFuture, // New Future Params
            config.defaultYearlyEvalFuture, // New Future Params
            config.adjustmentConfig, // Adjustment Config
            config.unifyNewSystemConfig, // Unify Config
            targetB, // Target B Amount (for Adjustment Mode)
            targetReserve2026 // Target B 2026 Amount
        );
    }, [fractionConfig, includeCurrentFiscalYear]);

    // --- Search Logic ---
    const executeSearch = useCallback(() => {
        setSelectedEmployeeId(null);
        setSearchError(null);
        const term = searchTerm.trim(); 
        if (!term) return;
        
        if (data.length === 0) { 
            setSearchError('データがありません。先に社員データをアップロードしてください。'); 
            return; 
        }

        const found = data.find(row => {
            const idVal = COL_ALIASES.id.reduce((found: any, alias: string) => found || (row as any)[alias], undefined as string | number | undefined);
            if (String(idVal) === term) return true;
            const nameVal = COL_ALIASES.name.reduce((found: any, alias: string) => found || (row as any)[alias], undefined as string | number | undefined);
            if (nameVal && String(nameVal).includes(term)) return true;
            return false;
        });

        if (found) {
            // IDを取得してセット
            const id = String(COL_ALIASES.id.reduce((f: any, a: string) => f || (found as any)[a], undefined));
            setSelectedEmployeeId(id);
        } else { 
            setSearchError('該当する社員が見つかりませんでした。'); 
        }
    }, [data, searchTerm]);

    // Derived Result for Selected Employee
    const searchResult = useMemo(() => {
        if (!selectedEmployeeId || data.length === 0) return null;
        
        const found = data.find(row => {
            const idVal = COL_ALIASES.id.reduce((f: any, a: string) => f || (row as any)[a], undefined as string | number | undefined);
            return String(idVal) === selectedEmployeeId;
        });

        if (!found) return null;

        // B Calculation (Standard)
        const resB = runCalculation(found, configB);
        // A Calculation (May depend on B)
        const targetAmount = (configA.adjustmentConfig?.enabled || configA.unifyNewSystemConfig?.enabled) && resB ? resB.retirementAllowance : undefined;
        // Pass B's 2026 reserve to ensure consistency in adjustment mode
        const targetReserve = (configA.adjustmentConfig?.enabled || configA.unifyNewSystemConfig?.enabled) && resB ? resB.reserve2026 : undefined;
        
        const resA = runCalculation(found, configA, targetAmount, targetReserve);

        if (resA && resB) {
            return { resA, resB };
        }
        return null;
    }, [selectedEmployeeId, data, configA, configB, runCalculation]);

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);

    // Auto-search (Initial Load or when data changes but search term exists)
    useEffect(() => {
        if (data.length > 0 && !selectedEmployeeId && !searchTerm) {
            const sorted = [...data].sort((a, b) => {
                const idA = String(COL_ALIASES.id.reduce((found: any, alias: string) => found !== undefined ? found : (a as any)[alias], undefined) || '999999');
                const idB = String(COL_ALIASES.id.reduce((found: any, alias: string) => found !== undefined ? found : (b as any)[alias], undefined) || '999999');
                return idA.localeCompare(idB, undefined, {numeric: true});
            });
            if(sorted.length > 0) {
                const firstRow = sorted[0] as any;
                const minId = String(COL_ALIASES.id.reduce((found: any, alias: string) => found !== undefined ? found : firstRow[alias], undefined) || '');
                if (minId) {
                    setSearchTerm(minId);
                    // Automatically select the first one
                    setSelectedEmployeeId(minId);
                }
            }
        }
    }, [data, selectedEmployeeId, searchTerm]);

    const isInitialMount = useRef(true);

    // --- Aggregation Logic (Manual Trigger + Config Change) ---
    useEffect(() => {
        const calculateAggregatedCosts = async () => {
            if (!data || data.length === 0) {
                setAggregatedData([]);
                return;
            }
            
            // Skip initial calculation if we already have aggregated data from localStorage
            if (isInitialMount.current && aggregatedData.length > 0) {
                isInitialMount.current = false;
                return;
            }
            isInitialMount.current = false;
            
            setIsCalculating(true);
            setProgress(0);
            setStatus('計算中...');
            
            try {
                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 50));

                const costsMap = new Map<number, {
                    A: { type1: number, type2: number, type3: number, type4: number },
                    B: { type1: number, type2: number, type3: number, type4: number },
                    payoutA: { type1: number, type2: number, type3: number, type4: number },
                    payoutB: { type1: number, type2: number, type3: number, type4: number },
                    counts: { type1: number, type2: number, type3: number, type4: number },
                    stockA: { type1: number, type2: number, type3: number, type4: number },
                    stockB: { type1: number, type2: number, type3: number, type4: number }
                }>();

                for (let y = 2025; y <= 2080; y++) {
                    costsMap.set(y, {
                        A: { type1: 0, type2: 0, type3: 0, type4: 0 },
                        B: { type1: 0, type2: 0, type3: 0, type4: 0 },
                        payoutA: { type1: 0, type2: 0, type3: 0, type4: 0 },
                        payoutB: { type1: 0, type2: 0, type3: 0, type4: 0 },
                        counts: { type1: 0, type2: 0, type3: 0, type4: 0 },
                        stockA: { type1: 0, type2: 0, type3: 0, type4: 0 },
                        stockB: { type1: 0, type2: 0, type3: 0, type4: 0 }
                    });
                }

                const chunkSize = 100; // Process 100 employees at a time
                for (let i = 0; i < data.length; i += chunkSize) {
                    const chunk = data.slice(i, i + chunkSize);
                    
                    chunk.forEach(row => {
                        const resB = runCalculation(row, configB);
                        const targetAmount = (configA.adjustmentConfig?.enabled || configA.unifyNewSystemConfig?.enabled) && resB ? resB.retirementAllowance : undefined;
                        const targetReserve = (configA.adjustmentConfig?.enabled || configA.unifyNewSystemConfig?.enabled) && resB ? resB.reserve2026 : undefined;
                        
                        const resA = runCalculation(row, configA, targetAmount, targetReserve);

                        if (resA && resB) {
                            const typeKey = resA.typeKey;

                            // Optimized counts: only loop up to retirement year
                            const rYearA = resA.retirementFiscalYear;
                            for (let y = 2025; y <= 2080; y++) {
                                if (y < rYearA) {
                                    if(costsMap.has(y)) costsMap.get(y)!.counts[typeKey] += 1;
                                } else {
                                    break; // No need to check further years
                                }
                            }

                            resA.yearlyDetails.forEach(d => { if (costsMap.has(d.year)) costsMap.get(d.year)!.A[typeKey] += d.amountInc; });
                            resB.yearlyDetails.forEach(d => { if (costsMap.has(d.year)) costsMap.get(d.year)!.B[typeKey] += d.amountInc; });

                            if (costsMap.has(rYearA)) {
                                costsMap.get(rYearA)!.payoutA[typeKey] += resA.retirementAllowance;
                            }

                            const rYearB = resB.retirementFiscalYear;
                            if (costsMap.has(rYearB)) {
                                costsMap.get(rYearB)!.payoutB[typeKey] += resB.retirementAllowance;
                            }

                            if (costsMap.has(2025)) {
                                costsMap.get(2025)!.stockA[typeKey] += resA.reserve2026;
                                costsMap.get(2025)!.stockB[typeKey] += resB.reserve2026;
                            }
                        }
                    });

                    setProgress(Math.round(((i + chunk.length) / data.length) * 100));
                    // Yield to main thread
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                const sorted: AggregatedYearlyData[] = Array.from(costsMap.entries())
                    .map(([year, val]) => {
                        const totalA = val.A.type1 + val.A.type2 + val.A.type3 + val.A.type4;
                        const totalB = val.B.type1 + val.B.type2 + val.B.type3 + val.B.type4;
                        const totalPayoutA = val.payoutA.type1 + val.payoutA.type2 + val.payoutA.type3 + val.payoutA.type4;
                        const totalPayoutB = val.payoutB.type1 + val.payoutB.type2 + val.payoutB.type3 + val.payoutB.type4;
                        const totalCount = val.counts.type1 + val.counts.type2 + val.counts.type3 + val.counts.type4;
                        
                        const totalStockA = val.stockA.type1 + val.stockA.type2 + val.stockA.type3 + val.stockA.type4;
                        const totalStockB = val.stockB.type1 + val.stockB.type2 + val.stockB.type3 + val.stockB.type4;

                        return {
                            year,
                            A: { type1: val.A.type1, type2: val.A.type2, type3: val.A.type3, type4: val.A.type4, total: totalA },
                            B: { type1: val.B.type1, type2: val.B.type2, type3: val.B.type3, type4: val.B.type4, total: totalB },
                            stockA: { type1: val.stockA.type1, type2: val.stockA.type2, type3: val.stockA.type3, type4: val.stockA.type4, total: totalStockA },
                            stockB: { type1: val.stockB.type1, type2: val.stockB.type2, type3: val.stockB.type3, type4: val.stockB.type4, total: totalStockB },
                            payoutA: { type1: val.payoutA.type1, type2: val.payoutA.type2, type3: val.payoutA.type3, type4: val.payoutA.type4, total: totalPayoutA },
                            payoutB: { type1: val.payoutB.type1, type2: val.payoutB.type2, type3: val.payoutB.type3, type4: val.payoutB.type4, total: totalPayoutB },
                            counts: { type1: val.counts.type1, type2: val.counts.type2, type3: val.counts.type3, type4: val.counts.type4, total: totalCount }
                        };
                    })
                    .sort((a, b) => a.year - b.year);
                
                setAggregatedData(sorted);
            } catch (err) {
                console.error('Aggregation error:', err);
                setError('集計中にエラーが発生しました。');
            } finally {
                setIsCalculating(false);
                setStatus('待機中');
            }
        };

        calculateAggregatedCosts();
    }, [data, calcTrigger, configA, configB]); // Re-run when data or configs change

    const handleRunSimulation = () => {
        setCalcTrigger(prev => prev + 1);
        setStatus('再計算完了');
        setTimeout(() => setStatus('待機中'), 2000);
    };

    // --- Data Analysis Logic ---
    const analysisResult = useMemo(() => {
        if (data.length === 0) return null;
        
        const d1999 = new Date(1999, 2, 31);
        const d2000 = new Date(2000, 2, 31);
        const d2011 = new Date(2011, 8, 30);
        
        // 基準日: デフォルトは現在。改定日設定があればそれを使用
        let refDate = new Date();
        refDate.setHours(0,0,0,0);
        let isTransitionDate = false;

        if (configA.transitionConfig.enabled && configA.transitionConfig.date) {
            refDate = new Date(configA.transitionConfig.date);
            isTransitionDate = true;
        } else if (configB.transitionConfig.enabled && configB.transitionConfig.date) {
            refDate = new Date(configB.transitionConfig.date);
            isTransitionDate = true;
        }

        const groups = {
            type1: [] as any[],
            type2: [] as any[],
            type3: [] as any[],
            type4: [] as any[]
        };

        data.forEach(row => {
            const jd = parseDate(row['入社日'] || row['joinDate']);
            if (!jd) return;
            const bd = parseDate(row['生年月日'] || row['birthDate']);
            const item = { ...row, _joinDate: jd, _birthDate: bd };
            
            if (jd <= d1999) groups.type1.push(item);
            else if (jd <= d2000) groups.type2.push(item);
            else if (jd <= d2011) groups.type3.push(item);
            else groups.type4.push(item);
        });

        const getCoef = (d: Date, years: number) => {
            let table = [];
            if (d <= d1999) table = configB.coefSettings.type1;
            else if (d <= d2000) table = configB.coefSettings.type2;
            else if (d <= d2011) table = configB.coefSettings.type3;
            else table = configB.coefSettings.type4;
            
            if (!table || table.length === 0) return 1.0;
            const y = Math.max(1, Math.floor(years));
            const r = table.find(x => x.years === y) || table[table.length - 1];
            return r ? r.coef : 1.0;
        };

        const processGroup = (list: any[]) => {
            if (list.length === 0) return null;
            list.sort((a, b) => a._joinDate.getTime() - b._joinDate.getTime());
            
            const oldest = list[0];
            const newest = list[list.length - 1]; 

            const calcYears = (d: Date) => calculatePeriodYears(d, refDate, 'floor');
            const calcAge = (birth: Date | null | undefined) => {
                if(!birth) return null;
                return Math.floor(calculatePeriodYears(birth, refDate, 'floor'));
            }
            
            const oldestYears = calcYears(oldest._joinDate);
            const newestYears = calcYears(newest._joinDate);

            return {
                count: list.length,
                oldest: {
                    name: oldest['氏名'] || oldest['name'] || '不明',
                    id: oldest['社員番号'] || oldest['employeeId'] || '不明',
                    date: oldest._joinDate,
                    years: oldestYears,
                    age: calcAge(oldest._birthDate),
                    coef: getCoef(oldest._joinDate, oldestYears)
                },
                newest: {
                    name: newest['氏名'] || newest['name'] || '不明',
                    id: newest['社員番号'] || newest['employeeId'] || '不明',
                    date: newest._joinDate,
                    years: newestYears,
                    age: calcAge(newest._birthDate),
                    coef: getCoef(newest._joinDate, newestYears)
                }
            };
        };

        return {
            type1: processGroup(groups.type1),
            type2: processGroup(groups.type2),
            type3: processGroup(groups.type3),
            type4: processGroup(groups.type4),
            total: data.length,
            refDateStr: formatDateWithWareki(refDate),
            isTransitionDate
        };
    }, [data, configB.coefSettings, configA.transitionConfig, configB.transitionConfig]); 


    // --- Handlers ---
    const handleDataFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; 
        if (!file) return;
        
        setStatus('データ読込中...');
        setError(null);
        
        try {
            // Use modern arrayBuffer() if available, otherwise fallback to FileReader
            let buf: ArrayBuffer;
            if (typeof file.arrayBuffer === 'function') {
                buf = await file.arrayBuffer();
            } else {
                buf = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => resolve(evt.target?.result as ArrayBuffer);
                    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
                    reader.readAsArrayBuffer(file);
                });
            }

            if (!buf) throw new Error("ファイルの読み込みに失敗しました");
            
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            const sheetName = wb.SheetNames[0];
            const worksheet = wb.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as EmployeeInputRow[];
            
            if (json.length === 0) throw new Error("データが含まれていません");
            
            setData(json);
            setSelectedEmployeeId(null);
            setSuccess(`社員データ ${json.length}件を読み込みました`);
            setCalcTrigger(prev => prev + 1);
            setStatus('待機中');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { 
            console.error(err);
            setError('データ読込エラー: ' + err.message + '\nCSVまたはExcel形式であることを確認してください。'); 
            setStatus('エラー');
        } finally {
            e.target.value = '';
        }
    };

    const handleLoadSample = () => {
        setConfirmAction({
            title: 'サンプルデータの読み込み',
            message: 'サンプルデータを読み込みますか？（現在のデータは上書きされます）',
            onConfirm: () => {
                setData(SAMPLE_EMPLOYEE_DATA);
                setSelectedEmployeeId(null);
                setSuccess(`サンプルデータ ${SAMPLE_EMPLOYEE_DATA.length}件を読み込みました`);
                setCalcTrigger(prev => prev + 1);
                setStatus('待機中');
                setTimeout(() => setSuccess(null), 3000);
                setConfirmAction(null);
            }
        });
    };

    const handleDownloadTemplate = () => {
        const csv = Papa.unparse({ fields: EMPLOYEE_CSV_HEADERS, data: [] });
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "社員データ入力用テンプレート.csv";
        link.click();
    };

    const handleClearData = () => {
        setConfirmAction({
            title: 'データのクリア',
            message: '全ての社員データ、分析レポート、チャット履歴を消去しますか？この操作は取り消せません。',
            onConfirm: () => {
                setData([]);
                setAggregatedData([]);
                setSelectedEmployeeId(null);
                setSearchTerm('');
                setStatus('待機中');
                setShowAnalysis(false);
                setSuccess('全てのデータをクリアしました。');
                
                // Clear AI related localStorage
                localStorage.removeItem('retirement-sim-report-content');
                localStorage.removeItem('retirement-sim-report-csvmap');
                localStorage.removeItem('retirement-sim-report-proposed');
                localStorage.removeItem('retirement-sim-report-messages');
                localStorage.removeItem('retirement-sim-report-constraints');
                localStorage.removeItem('retirement-sim-chat-messages');
                
                setTimeout(() => setSuccess(null), 3000);
                setConfirmAction(null);
                
                // Reload to reset states that don't have effects
                window.location.reload();
            }
        });
    };

    const handleResetSettings = (target: 'A' | 'B') => {
        setConfirmAction({
            title: '設定のリセット',
            message: `${target === 'A' ? 'パターンA' : 'パターンB'}の設定を初期値に戻しますか？`,
            onConfirm: () => {
                const def = { ...deepClone(DEFAULT_CONFIG), label: target === 'A' ? 'パターンA (変更案)' : 'パターンB (現行制度)' };
                if (target === 'A') setConfigA(def);
                else setConfigB(def);
                setCalcTrigger(prev => prev + 1);
                setSuccess(`${target === 'A' ? 'パターンA' : 'パターンB'}をリセットしました`);
                setTimeout(() => setSuccess(null), 3000);
                setConfirmAction(null);
            }
        });
    };
    
    const handleMasterSave = (newConfig: SimulationConfig) => {
        if (editingPattern === 'A') {
            setConfigA(newConfig);
        } else {
            setConfigB(newConfig);
        }
    };

    const handleApplyAIProposal = (newConfig: SimulationConfig) => {
        setConfigA(newConfig);
        // Force calculation trigger slightly after state update
        setTimeout(() => setCalcTrigger(prev => prev + 1), 100);
    };

    const handleCalculateAndExport = async (format: 'xlsx' | 'csv') => {
        if (!data.length) return;
        setStatus('計算開始...'); setError(null); setProgress(0); setIsCalculating(true);
        
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `退職金シミュレーション比較_${timestamp}.${format}`;

        const processInTimeSlices = async () => {
            const results: { resA: CalculationResult, resB: CalculationResult }[] = [];
            let index = 0;
            const BATCH_SIZE = 50; 
            while (index < data.length) {
                let count = 0;
                while (index < data.length && count < BATCH_SIZE) {
                    const r = data[index];
                    const resB = runCalculation(r, configB);
                    const targetAmount = (configA.adjustmentConfig?.enabled || configA.unifyNewSystemConfig?.enabled) && resB ? resB.retirementAllowance : undefined;
                    const targetReserve = (configA.adjustmentConfig?.enabled || configA.unifyNewSystemConfig?.enabled) && resB ? resB.reserve2026 : undefined;
                    const resA = runCalculation(r, configA, targetAmount, targetReserve);
                    if(resA && resB) results.push({ resA, resB });
                    index++; count++;
                }
                setProgress(Math.round((index / data.length) * 100));
                setStatus(`計算中... ${index} / ${data.length}`);
                await new Promise(r => setTimeout(r, 0));
            }
            return results;
        };

        try {
            await new Promise(r => setTimeout(r, 10)); 
            const results = await processInTimeSlices();
            if (results.length === 0) throw new Error("計算結果が0件でした。");

            // Build Headers
            const headers = [
                "社員番号","氏名","制度区分","入社日","生年月日",
                "【A】定年日", "【A】勤続年数", "【A】退職時総Pt", "【A】退職金支給額", "【A】2026/3末引当残",
                "【B】定年日", "【B】勤続年数", "【B】退職時総Pt", "【B】退職金支給額", "【B】2026/3末引当残",
                "支給額差分(A-B)", "引当残差分(A-B)"
            ];
            
            // Output columns up to 2080 to match calculation range
            for(let y=2025; y<=2080; y++) {
                headers.push(`${y}年度費用(A)`);
                headers.push(`${y}年度費用(B)`); // Added B cost
                headers.push(`${y}年度費用(差A-B)`);
            }

            const outData = [headers, ...results.map(({ resA, resB }) => {
                const row: any[] = [
                    resA.employeeId, resA.name, resA.typeName, formatDateWithWareki(resA.joinDate), formatDateWithWareki(resA.birthDate),
                    formatDateWithWareki(resA.retirementDate), resA.yearsOfService, resA.totalPointsAtRetirement, resA.retirementAllowance, resA.reserve2026,
                    formatDateWithWareki(resB.retirementDate), resB.yearsOfService, resB.totalPointsAtRetirement, resB.retirementAllowance, resB.reserve2026,
                    resA.retirementAllowance - resB.retirementAllowance, resA.reserve2026 - resB.reserve2026
                ];
                for(let y=2025; y<=2080; y++) { 
                    const dA = resA.yearlyDetails.find(d => d.year === y);
                    const dB = resB.yearlyDetails.find(d => d.year === y);
                    const amountA = dA ? dA.amountInc : 0;
                    const amountB = dB ? dB.amountInc : 0;
                    row.push(amountA);
                    row.push(amountB);
                    row.push(amountA - amountB);
                }
                return row;
            })];

            // Add Grand Total Row
            const sumArray = new Array(headers.length).fill(0);
            results.forEach(({ resA, resB }) => {
                // Sum Amount A (Index 8)
                sumArray[8] += resA.retirementAllowance;
                // Sum Reserve A (Index 9)
                sumArray[9] += resA.reserve2026;
                // Sum Amount B (Index 13)
                sumArray[13] += resB.retirementAllowance;
                // Sum Reserve B (Index 14)
                sumArray[14] += resB.reserve2026;
                // Diff Amount (Index 15)
                sumArray[15] += (resA.retirementAllowance - resB.retirementAllowance);
                // Diff Reserve (Index 16)
                sumArray[16] += (resA.reserve2026 - resB.reserve2026);

                let colIdx = 17;
                for(let y=2025; y<=2080; y++) {
                    const dA = resA.yearlyDetails.find(d => d.year === y);
                    const dB = resB.yearlyDetails.find(d => d.year === y);
                    const amountA = dA ? dA.amountInc : 0;
                    const amountB = dB ? dB.amountInc : 0;
                    sumArray[colIdx] += amountA;
                    sumArray[colIdx+1] += amountB;
                    sumArray[colIdx+2] += (amountA - amountB);
                    colIdx += 3;
                }
            });
            // Set Label
            sumArray[0] = "総合計";
            sumArray[1] = `${results.length}名`;
            
            // Format to avoid floating point errors in display
            const formattedTotal = sumArray.map((v, i) => (i >= 8 && typeof v === 'number') ? Math.round(v) : v);
            outData.push(formattedTotal);

            if (format === 'csv') {
                const csv = Papa.unparse(outData);
                const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
            } else {
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(outData), "比較結果");
                XLSX.writeFile(wb, filename);
            }
            setStatus('完了'); setProgress(100);
        } catch (e: any) { 
            setError(e.message); setStatus('エラー'); 
        } finally {
            setIsCalculating(false);
        }
    };

    // Helper for Settings Panel
    const renderSettingsPanel = (config: SimulationConfig, setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>, label: string) => {
        const pattern = label.includes('A') ? 'A' : 'B';
        const isA = pattern === 'A';
        return (
        <div className={`p-6 rounded-2xl border transition-all duration-300 ${isA ? 'bg-white border-indigo-100 shadow-indigo-100/50 shadow-lg' : 'bg-white border-emerald-100 shadow-emerald-100/50 shadow-lg'}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isA ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
                        <span className="text-white font-black text-xl">{pattern}</span>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Simulation Pattern</div>
                        <div className="font-bold text-slate-800 text-lg leading-none">{config.label}</div>
                    </div>
                </div>
                <button 
                    onClick={() => handleResetSettings(pattern as 'A'|'B')}
                    className="p-2 text-slate-300 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                    title="初期値に戻す"
                >
                    <RotateCcw className="w-5 h-5"/>
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ポイント単価 (円)</label>
                    <input type="number" value={config.unitPrice} onChange={e => setConfig({...config, unitPrice: Number(e.target.value)})} className="w-full p-2.5 border-slate-300 rounded text-base text-right" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        標準考課Pt (年) {config.transitionConfig.enabled && <span className="text-indigo-600 ml-1">[現行]</span>}
                    </label>
                    <input type="number" value={config.defaultYearlyEval} onChange={e => setConfig({...config, defaultYearlyEval: Number(e.target.value)})} className="w-full p-2.5 border-slate-300 rounded text-base text-right" />
                    
                    {config.transitionConfig.enabled && (
                        <div className="mt-2 p-2 bg-indigo-50/50 rounded border border-indigo-100 animate-in fade-in slide-in-from-top-1">
                            <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">標準考課Pt <span className="bg-indigo-600 text-white px-1 py-0.5 rounded text-[9px] ml-1">改定後</span></label>
                            <input 
                                type="number" 
                                value={config.defaultYearlyEvalFuture ?? 0} 
                                onChange={e => setConfig({...config, defaultYearlyEvalFuture: Number(e.target.value)})} 
                                className="w-full p-1.5 border-indigo-200 bg-white rounded text-sm text-right text-indigo-700 font-bold" 
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Transition Settings */}
            <div className={`p-4 rounded-lg border-2 transition-colors ${config.transitionConfig.enabled ? 'bg-indigo-50 border-indigo-500' : 'bg-slate-100 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                    <input 
                        type="checkbox" 
                        id={`trans-${pattern}`}
                        checked={config.transitionConfig.enabled}
                        onChange={(e) => setConfig({ ...config, transitionConfig: { ...config.transitionConfig, enabled: e.target.checked } })}
                        className="w-6 h-6 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label htmlFor={`trans-${pattern}`} className={`text-lg font-bold flex items-center gap-2 cursor-pointer select-none ${config.transitionConfig.enabled ? 'text-indigo-700' : 'text-slate-600'}`}>
                        <Calendar className={`w-6 h-6 ${config.transitionConfig.enabled ? 'text-indigo-600' : 'text-slate-400'}`}/>
                        制度改定日
                    </label>
                </div>
                
                {config.transitionConfig.enabled && (
                    <div className="space-y-3 mt-4 animate-in slide-in-from-top-1 pl-1">
                        <div>
                            <label className="block text-sm font-bold text-slate-500 mb-1">移行基準日 (現行制度終了日)</label>
                            <div className="relative">
                                <Calendar className="w-5 h-5 absolute left-3 top-2.5 text-slate-500"/>
                                <input 
                                    type="date" 
                                    min="2026-01-01"
                                    value={(config.transitionConfig.date instanceof Date && !isNaN(config.transitionConfig.date.getTime())) ? 
                                        `${config.transitionConfig.date.getFullYear()}-${String(config.transitionConfig.date.getMonth() + 1).padStart(2, '0')}-${String(config.transitionConfig.date.getDate()).padStart(2, '0')}` : ''}
                                    onChange={(e) => {
                                        const [y, m, d] = e.target.value.split('-').map(Number);
                                        if (y && m && d) {
                                            setConfig({ ...config, transitionConfig: { ...config.transitionConfig, date: new Date(y, m - 1, d) } });
                                        }
                                    }}
                                    className="w-full pl-10 p-2.5 text-base border-slate-300 rounded shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="pt-2 border-t border-indigo-200">
                            <button 
                                onClick={() => {
                                    setEditorInitialTab('future');
                                    setEditingPattern(pattern as 'A' | 'B');
                                }}
                                className="w-full py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
                            >
                                <Database className="w-4 h-4"/> 改定後（将来）のポイント・支給率を編集する
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Special Modes (Only for Pattern A) */}
            {pattern === 'A' && (
                <div className="space-y-4">
                    {/* Adjustment Mode */}
                    <div className={`p-4 rounded-lg border-2 transition-colors ${config.adjustmentConfig?.enabled ? 'bg-amber-50 border-amber-500' : 'bg-slate-100 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                id="adj-a"
                                checked={config.adjustmentConfig?.enabled || false}
                                onChange={(e) => setConfig({ 
                                    ...config, 
                                    adjustmentConfig: { 
                                        enabled: e.target.checked,
                                        retirementAges: config.adjustmentConfig?.retirementAges || { type1: 65, type2: 65, type3: 65, type4: 65 },
                                        targetTypes: config.adjustmentConfig?.targetTypes || { type1: true, type2: true, type3: true, type4: true }
                                    },
                                    unifyNewSystemConfig: e.target.checked ? { ...config.unifyNewSystemConfig!, enabled: false } : config.unifyNewSystemConfig
                                })}
                                className="w-6 h-6 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                            <label htmlFor="adj-a" className={`text-lg font-bold flex items-center gap-2 cursor-pointer select-none ${config.adjustmentConfig?.enabled ? 'text-amber-700' : 'text-slate-600'}`}>
                                <Lock className={`w-6 h-6 ${config.adjustmentConfig?.enabled ? 'text-amber-600' : 'text-slate-400'}`}/>
                                調整ポイントモード
                            </label>
                        </div>
                        {config.adjustmentConfig?.enabled && (
                            <div className="mt-3 space-y-2">
                                <div className="text-xs text-amber-800 bg-amber-100/50 p-2 rounded leading-relaxed">
                                    2026/3/31時点の引当金を凍結し、定年時のB案支給額との差額を「調整ポイント」として将来期間で均等割りして加算します。
                                </div>
                                <div className="bg-white p-3 rounded border border-amber-200">
                                    <label className="block text-xs font-bold text-amber-800 mb-2">適用対象と定年年齢 (制度区分別)</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['type1','type2','type3','type4'] as const).map((t, i) => {
                                            const isChecked = config.adjustmentConfig?.targetTypes?.[t] ?? true;
                                            return (
                                            <div key={t} className="flex flex-col items-center gap-1.5 p-1.5 rounded border border-slate-100 bg-slate-50">
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => setConfig({
                                                            ...config,
                                                            adjustmentConfig: {
                                                                ...config.adjustmentConfig!,
                                                                targetTypes: {
                                                                    ...config.adjustmentConfig!.targetTypes!,
                                                                    [t]: e.target.checked
                                                                }
                                                            }
                                                        })}
                                                        className="w-3.5 h-3.5 text-amber-600 rounded"
                                                    />
                                                    <span className="text-[10px] text-amber-600 font-bold">{['旧①','旧②','旧③','新'][i]}</span>
                                                </div>
                                                <select 
                                                    value={(config.adjustmentConfig?.retirementAges as any)?.[t] || 65}
                                                    disabled={!isChecked}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        setConfig({
                                                            ...config,
                                                            adjustmentConfig: {
                                                                ...config.adjustmentConfig!,
                                                                retirementAges: {
                                                                    ...config.adjustmentConfig!.retirementAges!,
                                                                    [t]: val
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    className={`text-xs border border-amber-300 rounded p-1 text-center font-bold text-amber-900 focus:ring-amber-500 focus:border-amber-500 w-full ${!isChecked ? 'opacity-50 cursor-not-allowed bg-slate-200' : 'bg-amber-50'}`}
                                                >
                                                    <option value={60}>60歳</option>
                                                    <option value={65}>65歳</option>
                                                </select>
                                            </div>
                                        )})}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Unified New System Mode */}
                    <div className={`p-4 rounded-lg border-2 transition-colors ${config.unifyNewSystemConfig?.enabled ? 'bg-sky-50 border-sky-500' : 'bg-slate-100 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                id="unify-a"
                                checked={config.unifyNewSystemConfig?.enabled || false}
                                onChange={(e) => setConfig({ 
                                    ...config, 
                                    unifyNewSystemConfig: { 
                                        enabled: e.target.checked,
                                        retirementAges: config.unifyNewSystemConfig?.retirementAges || { type1: 65, type2: 65, type3: 65, type4: 65 },
                                        targetTypes: config.unifyNewSystemConfig?.targetTypes || { type1: false, type2: false, type3: true, type4: true }
                                    },
                                    adjustmentConfig: e.target.checked ? { ...config.adjustmentConfig!, enabled: false } : config.adjustmentConfig
                                })}
                                className="w-6 h-6 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                            <label htmlFor="unify-a" className={`text-lg font-bold flex items-center gap-2 cursor-pointer select-none ${config.unifyNewSystemConfig?.enabled ? 'text-sky-700' : 'text-slate-600'}`}>
                                <RefreshCw className={`w-6 h-6 ${config.unifyNewSystemConfig?.enabled ? 'text-sky-600' : 'text-slate-400'}`}/>
                                新制度に統一モード
                            </label>
                        </div>
                        {config.unifyNewSystemConfig?.enabled && (
                            <div className="mt-3 space-y-2">
                                <div className="text-xs text-sky-800 bg-sky-100/50 p-2 rounded leading-relaxed">
                                    2026/3/31時点の引当金を凍結し、2026年4月以降は、対象となる全社員を<span className="font-bold">「新制度（Type 4）」</span>のルール（ポイント表・計算式）で積み上げ計算します。
                                </div>
                                <div className="bg-white p-3 rounded border border-sky-200">
                                    <label className="block text-xs font-bold text-sky-800 mb-2">適用対象と定年年齢</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['type1','type2','type3','type4'] as const).map((t, i) => {
                                            const isChecked = config.unifyNewSystemConfig?.targetTypes?.[t] ?? true;
                                            return (
                                            <div key={t} className="flex flex-col items-center gap-1.5 p-1.5 rounded border border-slate-100 bg-slate-50">
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => setConfig({
                                                            ...config,
                                                            unifyNewSystemConfig: {
                                                                ...config.unifyNewSystemConfig!,
                                                                targetTypes: {
                                                                    ...config.unifyNewSystemConfig!.targetTypes!,
                                                                    [t]: e.target.checked
                                                                }
                                                            }
                                                        })}
                                                        className="w-3.5 h-3.5 text-sky-600 rounded"
                                                    />
                                                    <span className="text-[10px] text-sky-600 font-bold">{['旧①','旧②','旧③','新'][i]}</span>
                                                </div>
                                                <select 
                                                    value={(config.unifyNewSystemConfig?.retirementAges as any)?.[t] || 65}
                                                    disabled={!isChecked}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        setConfig({
                                                            ...config,
                                                            unifyNewSystemConfig: {
                                                                ...config.unifyNewSystemConfig!,
                                                                retirementAges: {
                                                                    ...config.unifyNewSystemConfig!.retirementAges!,
                                                                    [t]: val
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    className={`text-xs border border-sky-300 rounded p-1 text-center font-bold text-sky-900 focus:ring-sky-500 focus:border-sky-500 w-full ${!isChecked ? 'opacity-50 cursor-not-allowed bg-slate-200' : 'bg-sky-50'}`}
                                                >
                                                    <option value={60}>60歳</option>
                                                    <option value={65}>65歳</option>
                                                </select>
                                            </div>
                                        )})}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    定年年齢 (歳) {config.transitionConfig.enabled && <span className="text-indigo-600 ml-1">[現行]</span>}
                </label>
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {['type1','type2','type3','type4'].map((t, i) => (
                        <div key={t}>
                            <span className="block text-[10px] sm:text-[11px] text-slate-400 text-center mb-0.5">{['旧①','旧②','旧③','新'][i]}</span>
                            <input 
                                type="number" 
                                value={(config.retirementAges as any)[t]} 
                                onChange={e => setConfig({...config, retirementAges: {...config.retirementAges, [t]: Number(e.target.value)}})} 
                                disabled={config.adjustmentConfig?.enabled || config.unifyNewSystemConfig?.enabled}
                                className={`w-full p-1.5 sm:p-2 border-slate-300 rounded text-sm sm:text-base text-center ${config.adjustmentConfig?.enabled || config.unifyNewSystemConfig?.enabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {config.transitionConfig.enabled && (
                <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-1">
                    <label className="block text-xs font-bold text-indigo-600 uppercase mb-2">
                        定年年齢 (歳) <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[10px] ml-1">改定後</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2 sm:gap-3">
                        {['type1','type2','type3','type4'].map((t, i) => (
                            <div key={t}>
                                <span className="block text-[10px] sm:text-[11px] text-indigo-400 text-center mb-0.5">{['旧①','旧②','旧③','新'][i]}</span>
                                <input 
                                    type="number" 
                                    value={(config.retirementAgesFuture as any)[t]} 
                                    onChange={e => setConfig({...config, retirementAgesFuture: {...config.retirementAgesFuture, [t]: Number(e.target.value)}})} 
                                    className="w-full p-1.5 sm:p-2 border-indigo-200 bg-white rounded text-sm sm:text-base text-center text-indigo-700 font-bold"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    職能P 上限年数 {config.transitionConfig.enabled && <span className="text-indigo-600 ml-1">[現行]</span>}
                </label>
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {['type1','type2','type3','type4'].map((t, i) => (
                        <div key={t}>
                            <span className="block text-[10px] sm:text-[11px] text-slate-400 text-center mb-0.5">{['旧①','旧②','旧③','新'][i]}</span>
                            <input 
                                type="number" min={30} max={47}
                                value={(config.cutoffYears as any)[t]} 
                                onChange={e => setConfig({...config, cutoffYears: {...config.cutoffYears, [t]: Number(e.target.value)}})} 
                                className="w-full p-1.5 sm:p-2 border-slate-300 rounded text-sm sm:text-base text-center" 
                            />
                        </div>
                    ))}
                </div>
            </div>

            {config.transitionConfig.enabled && (
                <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-1">
                    <label className="block text-xs font-bold text-indigo-600 uppercase mb-2">
                        職能P 上限年数 <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[10px] ml-1">改定後</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2 sm:gap-3">
                        {['type1','type2','type3','type4'].map((t, i) => (
                            <div key={t}>
                                <span className="block text-[10px] sm:text-[11px] text-indigo-400 text-center mb-0.5">{['旧①','旧②','旧③','新'][i]}</span>
                                <input 
                                    type="number" min={30} max={47}
                                    value={(config.cutoffYearsFuture as any)[t]} 
                                    onChange={e => setConfig({...config, cutoffYearsFuture: {...config.cutoffYearsFuture, [t]: Number(e.target.value)}})} 
                                    className="w-full p-1.5 sm:p-2 border-indigo-200 bg-white rounded text-sm sm:text-base text-center text-indigo-700 font-bold"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="pt-4 border-t border-slate-200">
                <button 
                    onClick={() => {
                        setEditorInitialTab('masterData2');
                        setEditingPattern(pattern as 'A' | 'B');
                    }}
                    className="w-full py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition flex items-center justify-center gap-2"
                >
                    <Database className="w-4 h-4"/> 勤続P・職能P・支給率テーブルを確認・編集する
                </button>
            </div>
        </div>
    )};

    const renderAnalysisCard = (title: React.ReactNode, groupData: any, colorClass: string) => {
        if (!groupData) return (
            <div className="bg-white p-5 rounded-lg border border-slate-100 shadow-sm opacity-60 flex flex-col justify-center items-center h-full min-h-[160px]">
                <div className={`font-bold text-sm mb-2 ${colorClass} text-center`}>{title}</div>
                <div className="text-slate-300 text-sm">該当者なし</div>
            </div>
        );

        return (
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition h-full flex flex-col">
                <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-2">
                    <div className={`font-bold text-sm ${colorClass}`}>{title}</div>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono shrink-0 ml-2">
                        {groupData.count} <span className="text-[10px] text-slate-400">名</span>
                    </span>
                </div>
                
                <div className="space-y-4 flex-1">
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Oldest (最古参)</span>
                            <span className="text-[10px] font-mono text-slate-400">{formatDateWithWareki(groupData.oldest.date).split(' ')[0]}入社</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 truncate" title={groupData.oldest.name}>{groupData.oldest.name}</span>
                            <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    {groupData.oldest.age !== null ? `${groupData.oldest.age}歳` : '-'}
                                </span>
                                <span className="text-xs font-bold text-indigo-600">勤続 {groupData.oldest.years.toFixed(1)}年</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Newest (最若手)</span>
                            <span className="text-[10px] font-mono text-slate-400">{formatDateWithWareki(groupData.newest.date).split(' ')[0]}入社</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 truncate" title={groupData.newest.name}>{groupData.newest.name}</span>
                            <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    {groupData.newest.age !== null ? `${groupData.newest.age}歳` : '-'}
                                </span>
                                <span className="text-xs font-bold text-indigo-600">勤続 {groupData.newest.years.toFixed(1)}年</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`min-h-screen overflow-x-auto transition-colors duration-300 ${darkMode ? 'dark bg-slate-950' : 'bg-slate-50'} font-sans`}>
            <div className="max-w-[1600px] mx-auto bg-white dark:bg-slate-900 shadow-2xl min-h-screen flex flex-col relative overflow-x-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-10 flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden no-print">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]"></div>
                        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[120px]"></div>
                    </div>
                    
                    <div className="flex items-center gap-4 sm:gap-8 relative z-10 w-full sm:w-auto">
                        <div className="p-3 sm:p-4 bg-white/10 rounded-xl sm:rounded-2xl backdrop-blur-md border border-white/20 shadow-2xl">
                            <Calculator className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-1 sm:mb-2">
                                比較シミュレーション <span className="text-indigo-400">2026</span>
                            </h1>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                                <span className="text-slate-400 text-sm sm:text-lg font-medium">京都バス 退職金試算システム Ver 2.0</span>
                                <div className="flex items-center gap-2">
                                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 sm:px-3 py-1 rounded-full border border-indigo-500/30">
                                        A/B Pattern Analysis
                                    </span>
                                    <button 
                                        onClick={() => setShowChatMode(true)}
                                        className="bg-emerald-500/20 text-emerald-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 sm:px-3 py-1 rounded-full border border-emerald-500/30 hover:bg-emerald-500/30 transition flex items-center gap-1"
                                    >
                                        <MessageSquare className="w-3 h-3" />
                                        AI Chat Mode
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 w-full sm:w-auto relative z-10">
                         <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                            <button 
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2.5 sm:p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all shadow-lg"
                                title={darkMode ? "ライトモードに切り替え" : "ダークモードに切り替え"}
                            >
                                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </button>
                            <button 
                                onClick={() => setShowHelp(true)}
                                className="flex-1 sm:flex-none bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 transition no-print font-bold shadow-lg border border-white/20 hover:scale-105"
                            >
                                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5"/>
                                <span className="hidden sm:inline">使用マニュアル</span>
                                <span className="sm:hidden">マニュアル</span>
                            </button>
                            <span className={`text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 rounded-full border border-white/30 text-white ${status.includes('エラー') ? 'bg-red-500/50' : 'bg-white/20'}`}>
                                {status}
                            </span>
                        </div>
                        {isCalculating && (
                            <div className="w-full sm:w-40 bg-indigo-900/50 rounded-full h-1.5 sm:h-2 overflow-hidden">
                                <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 sm:p-8 space-y-10 dark:bg-slate-900">
                    {/* Section 1: Conditions & Compare Settings */}
                    <div className="no-print">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-3 text-lg sm:text-xl">
                                <Sliders className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" /> 計算条件の比較設定
                            </h3>
                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                {data.length > 0 && (
                                    <button 
                                        onClick={handleRunSimulation} 
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-3 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 text-white px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-bold text-lg sm:text-2xl shadow-xl hover:shadow-2xl hover:scale-105 hover:from-indigo-500 hover:to-indigo-700 transform duration-200 transition-all border border-indigo-400/20 ring-4 ring-indigo-500/10"
                                    >
                                        <Play className="w-5 h-5 sm:w-8 sm:h-8 fill-current"/> 再計算する
                                    </button>
                                )}
                                {/* Copy Button Removed */}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            {renderSettingsPanel(configA, setConfigA, 'A')}
                            {renderSettingsPanel(configB, setConfigB, 'B')}
                        </div>
                    </div>

                    {/* Section 2: Data Input */}
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-8 no-print">
                        <div className="grid md:grid-cols-2 gap-10">
                            <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center gap-4">
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="relative flex items-center gap-4 cursor-pointer hover:bg-white dark:hover:bg-slate-700 p-4 rounded-xl transition border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 group"
                                >
                                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full group-hover:scale-110 transition-transform">
                                        <Database className="w-6 h-6"/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-700 dark:text-slate-200 text-base">社員データ読込 (.xlsx/.csv)</div>
                                        <div className="text-sm text-slate-400 dark:text-slate-500">現在: {data.length} 件</div>
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        className="hidden" 
                                        accept=".csv,.xlsx,.xls" 
                                        onChange={handleDataFile} 
                                    />
                                </div>
                                <div className="flex gap-3 justify-end items-center">
                                    {data.length > 0 && (
                                        <button 
                                            onClick={() => setShowAnalysis(!showAnalysis)}
                                            className={`mr-auto text-sm flex items-center gap-2 px-4 py-2 rounded-lg border transition font-bold ${showAnalysis ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                        >
                                            <PieChart className="w-4 h-4" /> 
                                            {showAnalysis ? '分析を隠す' : 'データ分析'}
                                        </button>
                                    )}
                                    <button onClick={handleLoadSample} className="text-sm px-3 py-1.5 text-indigo-600 hover:bg-white dark:hover:bg-slate-700 rounded font-bold border border-indigo-100">サンプル読込</button>
                                    <button onClick={handleDownloadTemplate} className="text-sm px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 rounded font-medium">テンプレートDL</button>
                                    <button onClick={handleClearData} className="text-sm px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded font-medium">クリア</button>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center gap-3">
                                <p className="text-sm text-slate-500 font-bold">パターンAとBの結果をまとめて出力します</p>
                                <button 
                                    onClick={() => handleCalculateAndExport('xlsx')} 
                                    disabled={isCalculating || data.length === 0}
                                    className={`w-full max-w-sm flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-lg text-white shadow-md transition ${isCalculating || data.length === 0 ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                >
                                    {isCalculating ? <Loader2 className="w-5 h-5 animate-spin"/> : <FileSpreadsheet className="w-5 h-5"/>} 
                                    比較結果をExcel出力
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Section 2.5: Analysis Panel */}
                    {showAnalysis && analysisResult && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                             <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-4">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="font-bold text-slate-700 flex items-center gap-3 text-lg">
                                        <PieChart className="w-6 h-6 text-indigo-600" /> 社員データ分析レポート
                                    </h4>
                                    <div className="text-sm font-mono bg-white px-3 py-1.5 rounded border border-slate-200 text-slate-500">
                                        Total: <span className="font-bold text-indigo-600 text-base">{analysisResult.total}</span> 名
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {renderAnalysisCard(
                                        <div>旧制度区分①<div className="text-[11px] font-normal text-slate-500 mt-0.5">～1999.3 (～H11.3)</div></div>,
                                        analysisResult.type1, 
                                        "text-orange-500"
                                    )}
                                    {renderAnalysisCard(
                                        <div>旧制度区分②<div className="text-[11px] font-normal text-slate-500 mt-0.5">1999.4～2000.3 (H11.4～H12.3)</div></div>,
                                        analysisResult.type2, 
                                        "text-yellow-600"
                                    )}
                                    {renderAnalysisCard(
                                        <div>旧制度区分③<div className="text-[11px] font-normal text-slate-500 mt-0.5">2000.4～2011.9 (H12.4～H23.9)</div></div>,
                                        analysisResult.type3, 
                                        "text-emerald-600"
                                    )}
                                    {renderAnalysisCard(
                                        <div>新制度<div className="text-[11px] font-normal text-slate-500 mt-0.5">2011.10～ (H23.10～)</div></div>,
                                        analysisResult.type4, 
                                        "text-blue-500"
                                    )}
                                </div>
                                <div className="mt-4 text-xs text-slate-400 text-right">
                                    ※ 勤続年数・年齢は <span className="font-bold">{analysisResult.refDateStr.split(' ')[0]} {analysisResult.isTransitionDate ? '(制度改定日)' : ''}</span> 時点での概算です
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Section 3: Chart */}
                    <div className="border-t border-slate-200 pt-8">
                        <AnnualCostChart data={aggregatedData} />
                    </div>
                    
                    {/* Section 4: Individual Simulation */}
                    <div className="border-t border-slate-200 pt-8 print-break-inside-avoid">
                        <h3 className="font-bold text-slate-700 flex items-center gap-3 mb-6 text-lg">
                            <Search className="w-6 h-6 text-indigo-600" /> 個人別シミュレーション比較
                        </h3>
                        <div className="flex gap-3 max-w-xl mb-6 no-print">
                            <input 
                                type="text" 
                                placeholder="社員番号 または 氏名..." 
                                className="flex-1 border-slate-300 rounded-xl px-5 py-3 text-base focus:ring-2 focus:ring-indigo-500" 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                            />
                            <button onClick={executeSearch} className="bg-indigo-600 text-white px-6 py-3 rounded-xl text-base font-bold hover:bg-indigo-700 transition">検索</button>
                        </div>
                        
                        {searchError && <div className="text-red-500 text-base bg-red-50 p-4 rounded border border-red-100"><AlertCircle className="w-5 h-5 inline mr-2"/>{searchError}</div>}
                        
                        {searchResult && (
                            <ResultCard 
                                resA={searchResult.resA} 
                                resB={searchResult.resB} 
                                configA={configA} 
                                configB={configB} 
                                onClose={() => setSelectedEmployeeId(null)} 
                            />
                        )}
                    </div>
                    
                    {/* Section 5: AI Analysis Report (New) */}
                    <div className="report-section">
                        <ErrorBoundary>
                            <AIAnalysisReport 
                                data={aggregatedData} 
                                configA={configA} 
                                configB={configB} 
                                onApplyProposal={handleApplyAIProposal}
                            />
                        </ErrorBoundary>
                    </div>

                    {/* Footer / Info */}
                    <div className="mt-10 pt-8 border-t border-slate-200 text-center text-sm text-slate-400 no-print">
                        <p>&copy; 2025 Kyoto Bus Co., Ltd. / Retirement Allowance Simulation System Ver 2.0.0 (Compare Ed.)</p>
                    </div>
                    {error && (
                        <div className="fixed bottom-6 right-6 bg-red-600 text-white p-5 rounded-xl shadow-lg flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 z-50 max-w-[90vw] sm:max-w-md">
                            <AlertCircle className="w-6 h-6 shrink-0" />
                            <div>
                                <p className="font-bold text-base">エラーが発生しました</p>
                                <p className="text-sm opacity-90 whitespace-pre-wrap">{error}</p>
                            </div>
                            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-white/20 rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    {success && (
                        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white p-5 rounded-xl shadow-lg flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 z-50 max-w-[90vw] sm:max-w-md">
                            <CheckCircle2 className="w-6 h-6 shrink-0" />
                            <div>
                                <p className="font-bold text-base">成功</p>
                                <p className="text-sm opacity-90">{success}</p>
                            </div>
                            <button onClick={() => setSuccess(null)} className="ml-auto p-1 hover:bg-white/20 rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Modals */}
                {editingPattern && (
                    <MasterEditorModal 
                        config={editingPattern === 'A' ? configA : configB}
                        defaultConfig={DEFAULT_CONFIG as SimulationConfig}
                        onSave={handleMasterSave}
                        onClose={() => setEditingPattern(null)}
                        initialTab={editorInitialTab}
                    />
                )}
                {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
                
                <AIChatMode 
                    isOpen={showChatMode} 
                    onClose={() => setShowChatMode(false)} 
                    data={aggregatedData}
                    configA={configA}
                    configB={configB}
                />

                {/* Floating Manual Button */}
                <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-3 no-print">
                    <button
                        onClick={() => setShowChatMode(!showChatMode)}
                        className={`p-4 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center justify-center group ${showChatMode ? 'bg-slate-800 text-white ring-4 ring-slate-200' : 'bg-indigo-600 text-white hover:shadow-indigo-500/50'}`}
                        title="AIチャットを開く"
                    >
                        {showChatMode ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
                        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold text-sm group-hover:ml-2 text-white">
                            AIチャット
                        </span>
                    </button>
                    <button
                        onClick={() => setShowHelp(true)}
                        className="bg-white text-slate-600 p-4 rounded-full shadow-xl hover:bg-slate-50 transition-all hover:scale-110 flex items-center justify-center group border border-slate-200"
                        title="使用マニュアルを開く"
                    >
                        <BookOpen className="w-6 h-6" />
                        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold text-sm group-hover:ml-2">
                            マニュアル
                        </span>
                    </button>
                </div>
            </div>
            {/* Confirm Modal */}
            {confirmAction && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold mb-2">{confirmAction.title}</h3>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">{confirmAction.message}</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">キャンセル</button>
                            <button onClick={confirmAction.onConfirm} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">実行する</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
