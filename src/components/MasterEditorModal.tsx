import React, { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { X, Save, RotateCcw, Table as TableIcon, Layers, BarChart, Upload, FileUp, Clipboard, FileDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { SimulationConfig, TableRowT1, TableRowT2, CoefSettings } from '../types';
import { deepClone } from '../utils';
import { T1_CSV_HEADERS, T2_CSV_HEADERS, COEF_CSV_HEADERS } from '../constants';

interface MasterEditorModalProps {
    config: SimulationConfig;
    defaultConfig: SimulationConfig;
    onSave: (newConfig: SimulationConfig) => void;
    onClose: () => void;
    initialTab?: TabKey;
}

type TabKey = 'masterData1_1' | 'masterData1_2' | 'masterData1_3' | 'masterData2' | 'coefSettings' | 'future';
type InputMode = 'incremental' | 'cumulative'; // 単年度(増分) or 累計

export const MasterEditorModal: React.FC<MasterEditorModalProps> = ({ config, defaultConfig, onSave, onClose, initialTab = 'masterData2' }) => {
    const [localConfig, setLocalConfig] = useState<SimulationConfig>(() => {
        const saved = localStorage.getItem('retirement-sim-editing-config');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.transitionConfig?.date) parsed.transitionConfig.date = new Date(parsed.transitionConfig.date);
                return parsed;
            } catch (e) { console.error(e); }
        }
        return deepClone(config);
    });
    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        const saved = localStorage.getItem('retirement-sim-editing-tab');
        return (saved as TabKey) || initialTab;
    });

    useEffect(() => {
        localStorage.setItem('retirement-sim-editing-config', JSON.stringify(localConfig));
    }, [localConfig]);

    useEffect(() => {
        localStorage.setItem('retirement-sim-editing-tab', activeTab);
    }, [activeTab]);
    const [inputMode, setInputMode] = useState<InputMode>('incremental'); // Default to incremental
    const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning', message: string} | null>(null);
    
    // Future Master用のサブステート
    const [futureSubTab, setFutureSubTab] = useState<'type1' | 'type2' | 'type3' | 'type4'>('type4');
    const [futureDataType, setFutureDataType] = useState<'table' | 'coef' | 'params'>('table');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [confirmAction, setConfirmAction] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);

    // --- Save Handler with Confirmation ---
    const handleSave = () => {
        // 変更箇所の集計
        const changes: string[] = [];
        let totalDiffCount = 0;

        // Helper to compare tables
        const checkTable = (current: any[], initial: any[], label: string) => {
            let diffs = 0;
            current.forEach((row, i) => {
                const defRow = initial.find(r => (r.y || r.years) === (row.y || row.years));
                if (!defRow) return;
                Object.keys(row).forEach(k => {
                    if (k === 'y' || k === 'years') return;
                    if (Math.abs(Number(row[k]) - Number(defRow[k])) > 0.001) diffs++;
                });
            });
            if (diffs > 0) {
                changes.push(`・${label}: ${diffs} 箇所の変更`);
                totalDiffCount += diffs;
            }
        };

        // Helper to compare Coefs
        const checkCoefs = (current: CoefSettings, initial: CoefSettings, label: string) => {
            let diffs = 0;
            (['type1', 'type2', 'type3', 'type4'] as const).forEach(k => {
                current[k].forEach((row, i) => {
                    const def = initial[k][i];
                    if (def && Math.abs(row.coef - def.coef) > 0.001) diffs++;
                });
            });
            if (diffs > 0) {
                changes.push(`・${label}: ${diffs} 箇所の変更`);
                totalDiffCount += diffs;
            }
        };

        // 1. Params
        let paramChanges = 0;
        if (localConfig.unitPrice !== config.unitPrice) paramChanges++;
        if (localConfig.defaultYearlyEval !== config.defaultYearlyEval) paramChanges++;
        // ... simplistic check for params
        if (JSON.stringify(localConfig.retirementAges) !== JSON.stringify(config.retirementAges)) paramChanges++;
        if (JSON.stringify(localConfig.cutoffYears) !== JSON.stringify(config.cutoffYears)) paramChanges++;
        
        // Future Params
        if (localConfig.defaultYearlyEvalFuture !== config.defaultYearlyEvalFuture) paramChanges++;
        if (JSON.stringify(localConfig.retirementAgesFuture) !== JSON.stringify(config.retirementAgesFuture)) paramChanges++;
        if (JSON.stringify(localConfig.cutoffYearsFuture) !== JSON.stringify(config.cutoffYearsFuture)) paramChanges++;

        if (paramChanges > 0) changes.push(`・基本パラメータ設定: ${paramChanges} 箇所の変更`);

        // 2. Tables
        checkTable(localConfig.masterData1_1, config.masterData1_1, "旧制度①ポイント表");
        checkTable(localConfig.masterData1_2, config.masterData1_2, "旧制度②ポイント表");
        checkTable(localConfig.masterData1_3, config.masterData1_3, "旧制度③ポイント表");
        checkTable(localConfig.masterData2, config.masterData2, "新制度ポイント表");
        
        // Future Tables
        checkTable(localConfig.masterDataFuture.type1, config.masterDataFuture.type1, "改定案(Type1)ポイント表");
        checkTable(localConfig.masterDataFuture.type2, config.masterDataFuture.type2, "改定案(Type2)ポイント表");
        checkTable(localConfig.masterDataFuture.type3, config.masterDataFuture.type3, "改定案(Type3)ポイント表");
        checkTable(localConfig.masterDataFuture.type4, config.masterDataFuture.type4, "改定案(Type4)ポイント表");

        // 3. Coefs
        checkCoefs(localConfig.coefSettings, config.coefSettings, "現行支給率");
        checkCoefs(localConfig.coefSettingsFuture, config.coefSettingsFuture, "改定案支給率");

        const message = changes.length > 0 
            ? `以下の変更を適用して再計算を行いますか？\n\n${changes.join('\n')}\n\n(合計 ${totalDiffCount} 箇所のマスタ値変更)`
            : "変更箇所は検出されませんでした。\n設定を終了しますか？";

        setConfirmAction({
            title: '設定の保存',
            message: message,
            onConfirm: () => {
                onSave(localConfig);
                localStorage.removeItem('retirement-sim-editing-config');
                localStorage.removeItem('retirement-sim-editing-tab');
                onClose();
                setConfirmAction(null);
            }
        });
    };

    const handleClose = () => {
        localStorage.removeItem('retirement-sim-editing-config');
        localStorage.removeItem('retirement-sim-editing-tab');
        onClose();
    };

    const handleResetTab = () => {
        setConfirmAction({
            title: 'タブのリセット',
            message: '現在のタブの設定を初期値に戻しますか？',
            onConfirm: () => {
                if (activeTab === 'future') {
                    if (futureDataType === 'table') {
                        setLocalConfig(prev => ({
                            ...prev,
                            masterDataFuture: {
                                ...prev.masterDataFuture,
                                [futureSubTab]: deepClone(defaultConfig.masterDataFuture[futureSubTab])
                            }
                        }));
                    } else if (futureDataType === 'coef') {
                         setLocalConfig(prev => ({
                            ...prev,
                            coefSettingsFuture: {
                                ...prev.coefSettingsFuture,
                                [futureSubTab]: deepClone(defaultConfig.coefSettingsFuture[futureSubTab])
                            }
                        }));
                    } else {
                         setLocalConfig(prev => ({
                            ...prev,
                            retirementAgesFuture: deepClone(defaultConfig.retirementAgesFuture),
                            cutoffYearsFuture: deepClone(defaultConfig.cutoffYearsFuture),
                            defaultYearlyEvalFuture: defaultConfig.defaultYearlyEvalFuture
                        }));
                    }
                } else {
                    setLocalConfig(prev => ({
                        ...prev,
                        [activeTab]: deepClone(defaultConfig[activeTab as keyof SimulationConfig])
                    }));
                }
                setConfirmAction(null);
            }
        });
    };

    // --- CSV Export Logic ---
    const handleExportCsv = () => {
        try {
            let dataToExport: any[] = [];
            let fileName = "";
            
            // 1. Determine Data Source & FileName
            if (activeTab === 'coefSettings' || (activeTab === 'future' && futureDataType === 'coef')) {
                // Coef Export
                const isFuture = activeTab === 'future';
                const settings = isFuture ? localConfig.coefSettingsFuture : localConfig.coefSettings;
                fileName = isFuture ? "支給率係数_改定案.csv" : "支給率係数_現行.csv";
                
                // Pivot Data: { type1: [], ... } -> [{ Year, Type1, Type2... }]
                // Assuming all types have same length/years structure
                const years = settings.type1.map(r => r.years);
                dataToExport = years.map((y, i) => {
                    return {
                        [COEF_CSV_HEADERS.labels[0]]: y, // 年数
                        [COEF_CSV_HEADERS.labels[1]]: settings.type1[i]?.coef || 0,
                        [COEF_CSV_HEADERS.labels[2]]: settings.type2[i]?.coef || 0,
                        [COEF_CSV_HEADERS.labels[3]]: settings.type3[i]?.coef || 0,
                        [COEF_CSV_HEADERS.labels[4]]: settings.type4[i]?.coef || 0,
                    };
                });
                
            } else {
                // Point Table Export (T1 or T2)
                let rawData: any[] = [];
                let headersDef = T2_CSV_HEADERS; // default T2
                
                if (activeTab === 'future') {
                    // Future Tab (Table)
                    rawData = localConfig.masterDataFuture[futureSubTab];
                    fileName = `新制度ポイント表_改定案_${futureSubTab}.csv`;
                    // Future data is always T2 format in this system
                    headersDef = T2_CSV_HEADERS; 
                } else if (activeTab === 'masterData2') {
                    rawData = localConfig.masterData2;
                    fileName = "現行新制度ポイント表.csv";
                    headersDef = T2_CSV_HEADERS;
                } else {
                    // T1
                    rawData = localConfig[activeTab as 'masterData1_1'|'masterData1_2'|'masterData1_3'];
                    fileName = `現行旧制度ポイント表_${activeTab}.csv`;
                    headersDef = T1_CSV_HEADERS;
                }

                // Map raw keys to Japanese labels
                dataToExport = rawData.map(row => {
                    const newRow: any = {};
                    headersDef.keys.forEach((key, idx) => {
                        newRow[headersDef.labels[idx]] = row[key];
                    });
                    return newRow;
                });
            }

            // 2. Generate CSV
            const csv = Papa.unparse(dataToExport);
            
            // 3. Download with BOM for Excel
            const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setNotification({ type: 'success', message: `${fileName} をエクスポートしました` });
            setTimeout(() => setNotification(null), 3000);

        } catch (e: any) {
            console.error(e);
            setNotification({ type: 'error', message: "エクスポート中にエラーが発生しました: " + e.message });
        }
    };

    // --- CSV Import Logic ---
    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const buffer = event.target?.result as ArrayBuffer;
            
            // --- Encoding Detection Strategy ---
            // Excel CSVs in Japan are often Shift-JIS.
            // AI generated or Developer CSVs might be UTF-8.
            // ASCII headers (like 'Year', 'T1') exist in both, making simple detection tricky.
            // We count "Japanese Keywords" to decide.
            
            const decoderUtf8 = new TextDecoder('utf-8');
            const textUtf8 = decoderUtf8.decode(buffer);
            
            let textSjis = '';
            try {
                const decoderSjis = new TextDecoder('shift-jis');
                textSjis = decoderSjis.decode(buffer);
            } catch(e) { /* ignore */ }

            const jpKeywords = ['年数', '勤続', '係員', '係数', '職能', '主任', '係長', '課長', '次長', '部長'];
            
            const countMatches = (txt: string) => {
                let count = 0;
                for(const k of jpKeywords) {
                    if (txt.includes(k)) count++;
                }
                return count;
            };

            const scoreUtf8 = countMatches(textUtf8);
            const scoreSjis = countMatches(textSjis);

            let text = textUtf8;
            if (scoreSjis > scoreUtf8) {
                text = textSjis;
                console.log("Detected Shift-JIS encoding based on keywords.");
            } else {
                console.log("Detected UTF-8 encoding.");
            }

            // BOM除去 & 全角スペース除去など前処理
            text = text.replace(/^\ufeff/, '');

            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                comments: "#", // Skip comment lines
                // Strip whitespace from headers
                transformHeader: (h: string) => h.replace(/\s+/g, '').trim(), 
                complete: (results: any) => {
                    const data = results.data as any[];
                    if (!data || data.length === 0) {
                        setNotification({ type: 'error', message: '有効なデータが見つかりませんでした。' });
                        return;
                    }
                    processImportedData(data);
                },
                error: (err: any) => {
                    setNotification({ type: 'error', message: 'CSV読み込みエラー: ' + err.message });
                }
            });
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ''; 
    };
    
    // --- Paste Logic ---
    const handlePasteClick = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                setNotification({ type: 'warning', message: "クリップボードが空です" });
                return;
            }
            
            const isTsv = text.includes('\t');
            
            Papa.parse(text.replace(/^\ufeff/, ''), {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                delimiter: isTsv ? '\t' : ',', // Auto-detect delimiter logic
                comments: "#",
                transformHeader: (h: string) => h.replace(/\s+/g, '').trim(),
                complete: (results: any) => {
                    const data = results.data as any[];
                    if (!data || data.length === 0) {
                        setNotification({ type: 'error', message: 'データを解析できませんでした。フォーマットを確認してください。' });
                        return;
                    }
                    processImportedData(data);
                },
                error: (err: any) => {
                    setNotification({ type: 'error', message: '解析エラー: ' + err.message });
                }
            });
        } catch (err) {
            console.error(err);
            setNotification({ type: 'error', message: "クリップボードからの読み取りに失敗しました。ブラウザの権限設定を確認してください。" });
        }
    };

    const processImportedData = (rows: any[]) => {
        try {
            if (rows.length === 0) return;

            // --- Robust Header Mapping ---
            // 実際にCSVに含まれるヘッダー名と、内部キーの対応表を作る
            const csvHeaders = Object.keys(rows[0]);
            
            const normalize = (s: string) => s.toLowerCase()
                .replace(/[\s\u3000]+/g, '') // Remove spaces (half/full)
                .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); // Full-width to Half-width

            // 候補リストと除外キーワードを使って、最適なヘッダーを探す
            // 完全一致(normalized)を優先し、なければ部分一致(normalized)を探す
            const findBestHeader = (candidates: string[], excludeKeywords: string[] = []): string | undefined => {
                // 1. Exact Match Check (Normalized)
                for (const cand of candidates) {
                    const normCand = normalize(cand);
                    const found = csvHeaders.find(h => normalize(h) === normCand);
                    if (found) return found;
                }

                // 2. Partial Match Check (Normalized) with Exclusions
                for (const cand of candidates) {
                    const normCand = normalize(cand);
                    const found = csvHeaders.find(h => {
                        const normH = normalize(h);
                        if (!normH.includes(normCand)) return false;
                        // Exclude check (e.g. skip "係員勤続" when searching for "係員")
                        if (excludeKeywords.some(ex => normH.includes(normalize(ex)))) return false;
                        return true;
                    });
                    if (found) return found;
                }
                return undefined;
            };

            const getVal = (row: any, headerName: string | undefined): number | undefined => {
                if (!headerName) return undefined;
                let val = row[headerName];
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                    // 全角数字対応 & カンマ/スペース除去
                    const norm = val.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                                    .replace(/[,，\s]+/g, '');
                    if (norm === '') return undefined;
                    const n = parseFloat(norm);
                    return isNaN(n) ? undefined : n;
                }
                return undefined;
            };

            // Determine Context
            if (activeTab === 'coefSettings' || (activeTab === 'future' && futureDataType === 'coef')) {
                // Coef Import
                // "勤続" (Los) を除外してマッチングさせる（年数はOKだが、T1勤続などを誤認しないように）
                const hYear = findBestHeader(['年数', 'year', '勤続年数', 'y'], ['勤続ポイント', '勤続pt']);
                const hT1 = findBestHeader(['t1係数', 'type1coef', '旧制度1', 't1', 'type1'], ['勤続', 'point', 'pt', '係員']);
                const hT2 = findBestHeader(['t2係数', 'type2coef', '旧制度2', 't2', 'type2'], ['勤続', 'point', 'pt', '係員']);
                const hT3 = findBestHeader(['t3係数', 'type3coef', '旧制度3', 't3', 'type3'], ['勤続', 'point', 'pt', '係員']);
                const hT4 = findBestHeader(['t4係数', 'type4coef', '新制度', 't4', 'type4'], ['勤続', 'point', 'pt', '係員']);

                if (!hYear) throw new Error("「年数」列が見つかりません。");

                const map = new Map<number, { t1?: number, t2?: number, t3?: number, t4?: number }>();
                
                rows.forEach(row => {
                    const y = getVal(row, hYear);
                    if (y !== undefined && y > 0) {
                        map.set(y, {
                            t1: getVal(row, hT1),
                            t2: getVal(row, hT2),
                            t3: getVal(row, hT3),
                            t4: getVal(row, hT4)
                        });
                    }
                });

                // Reconstruct full 47 years
                const newCoefs: CoefSettings = { type1: [], type2: [], type3: [], type4: [] };
                let lastVals = { t1: 0, t2: 0, t3: 0, t4: 1.0 }; 
                const maxYearInData = Math.max(...Array.from(map.keys()));
                const targetMax = Math.max(47, maxYearInData);

                for (let y = 1; y <= targetMax; y++) {
                    const rowData = map.get(y);
                    if (rowData) {
                        if (rowData.t1 !== undefined) lastVals.t1 = rowData.t1;
                        if (rowData.t2 !== undefined) lastVals.t2 = rowData.t2;
                        if (rowData.t3 !== undefined) lastVals.t3 = rowData.t3;
                        if (rowData.t4 !== undefined) lastVals.t4 = rowData.t4;
                    }
                    newCoefs.type1.push({ years: y, coef: lastVals.t1 });
                    newCoefs.type2.push({ years: y, coef: lastVals.t2 });
                    newCoefs.type3.push({ years: y, coef: lastVals.t3 });
                    newCoefs.type4.push({ years: y, coef: lastVals.t4 });
                }

                if (activeTab === 'future') {
                    setLocalConfig(prev => ({ ...prev, coefSettingsFuture: newCoefs }));
                } else {
                    setLocalConfig(prev => ({ ...prev, coefSettings: newCoefs }));
                }

            } else {
                // Point Table Import
                const isT1 = ['masterData1_1', 'masterData1_2', 'masterData1_3'].includes(activeTab);
                
                // Header Mapping
                // Note: exclude '勤続' from Rank columns to prevent matching '係員勤続' when searching for '係員'
                const hYear = findBestHeader(['年数', 'year', 'y'], ['勤続']);
                const hLos = findBestHeader(['勤続', 'los']);
                const hR1 = findBestHeader(['係員', 'rank1', 'r1', '1級'], ['勤続', 'los']);
                const hR2 = findBestHeader(['主任', 'rank2', 'r2', '2級'], ['勤続', 'los']);
                const hR3 = findBestHeader(['係長', 'rank3', 'r3', '3級'], ['勤続', 'los']);
                const hR4 = findBestHeader(['課長', 'rank4', 'r4', '4級'], ['勤続', 'los']);
                const hR5 = findBestHeader(['次長', 'rank5', 'r5', '5級'], ['勤続', 'los']);
                const hR6 = findBestHeader(['部長', 'rank6', 'r6', '6級'], ['勤続', 'los']);

                if (!hYear) throw new Error("「年数」列が見つかりません。");

                const mappedData: any[] = [];
                
                rows.forEach(row => {
                    const y = getVal(row, hYear);
                    if (y !== undefined && y > 0) {
                        const newRow: any = { y };
                        if (isT1) {
                             newRow.los1 = getVal(row, hLos) || 0;
                             newRow.r1_1 = getVal(row, hR1) || 0;
                             newRow.r2 = getVal(row, hR2) || 0;
                             newRow.r3 = getVal(row, hR3) || 0;
                             newRow.r4 = getVal(row, hR4) || 0;
                             newRow.r5 = getVal(row, hR5) || 0;
                             newRow.r6 = getVal(row, hR6) || 0;
                        } else {
                             newRow.los = getVal(row, hLos) || 0;
                             newRow.r1 = getVal(row, hR1) || 0;
                             newRow.r2 = getVal(row, hR2) || 0;
                             newRow.r3 = getVal(row, hR3) || 0;
                             newRow.r4 = getVal(row, hR4) || 0;
                             newRow.r5 = getVal(row, hR5) || 0;
                             newRow.r6 = getVal(row, hR6) || 0;
                        }
                        mappedData.push(newRow);
                    }
                });
                
                if (mappedData.length === 0) throw new Error("有効なデータが見つかりませんでした。");
                
                // Sort by year
                mappedData.sort((a,b) => a.y - b.y);

                if (activeTab === 'future' && futureDataType === 'table') {
                    setLocalConfig(prev => ({
                        ...prev,
                        masterDataFuture: {
                            ...prev.masterDataFuture,
                            [futureSubTab]: mappedData as TableRowT2[]
                        }
                    }));
                } else if (activeTab === 'masterData2') {
                    setLocalConfig(prev => ({ ...prev, masterData2: mappedData as TableRowT2[] }));
                } else {
                    setLocalConfig(prev => ({ ...prev, [activeTab]: mappedData as TableRowT1[] }));
                }
            }
            setNotification({ type: 'success', message: `データを正常に読み込みました (対象: ${rows.length}行)。\n変更箇所は赤色で表示されます。\n内容を確認し「変更を適用」ボタンを押してください。` });
        } catch (e: any) {
            console.error(e);
            setNotification({ type: 'error', message: 'データ読み込みエラー: ' + e.message });
        }
    };

    // Helper to round float
    const round = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

    // Helper to check if value changed from default
    const isChanged = (
        currentCum: number, 
        prevCum: number, 
        defCum: number, 
        defPrevCum: number
    ) => {
        if (inputMode === 'cumulative') {
            return Math.abs(currentCum - defCum) > 0.001;
        } else {
            const currentInc = round(currentCum - prevCum);
            const defInc = round(defCum - defPrevCum);
            return Math.abs(currentInc - defInc) > 0.001;
        }
    };

    const renderT2Table = (key: 'masterData2' | 'masterDataFuture') => {
        const data = key === 'masterDataFuture' ? localConfig.masterDataFuture[futureSubTab] : localConfig[key];
        const defaultData = key === 'masterDataFuture' ? defaultConfig.masterDataFuture[futureSubTab] : defaultConfig[key];

        const handleBlur = (index: number, field: keyof TableRowT2, valStr: string) => {
            const val = parseFloat(valStr);
            if (isNaN(val)) return; // Do nothing if invalid

            const newData = [...data];

            if (inputMode === 'cumulative') {
                newData[index] = { ...newData[index], [field]: val };
            } else {
                const prevVal = index > 0 ? newData[index - 1][field] : 0;
                const currentInc = round(newData[index][field] - prevVal);
                const delta = round(val - currentInc);
                if (delta === 0) return;
                for (let i = index; i < newData.length; i++) {
                    newData[i] = { ...newData[i], [field]: round(newData[i][field] + delta) };
                }
            }
            
            if (key === 'masterDataFuture') {
                setLocalConfig(prev => ({
                    ...prev,
                    masterDataFuture: {
                        ...prev.masterDataFuture,
                        [futureSubTab]: newData
                    }
                }));
            } else {
                setLocalConfig(prev => ({ ...prev, [key]: newData }));
            }
        };

        const renderCell = (row: TableRowT2, field: keyof TableRowT2, i: number) => {
            const defRow = defaultData.find(r => r.y === row.y) || { y: row.y, los:0, r1:0,r2:0,r3:0,r4:0,r5:0,r6:0 };
            const prevRow = i > 0 ? data[i-1] : { los:0, r1:0,r2:0,r3:0,r4:0,r5:0,r6:0 };
            const defPrevRow = i > 0 ? defaultData[i-1] : { los:0, r1:0,r2:0,r3:0,r4:0,r5:0,r6:0 };

            const currentVal = row[field];
            const prevVal = (prevRow as any)[field];
            const defVal = (defRow as any)[field];
            const defPrevVal = (defPrevRow as any)[field];

            const displayVal = inputMode === 'incremental' ? round(currentVal - prevVal) : currentVal;
            const changed = isChanged(currentVal, prevVal, defVal, defPrevVal);

            return (
                <td className={`p-1 relative group border border-slate-100 ${changed ? 'bg-red-50 border-red-300' : ''}`}>
                    <input 
                        type="number" step="0.1"
                        key={displayVal} // Force re-render on value change from external source
                        defaultValue={displayVal}
                        onBlur={(e) => handleBlur(i, field, e.target.value)}
                        className={`w-full text-right p-1 rounded bg-transparent outline-none focus:ring-2 focus:ring-indigo-400 ${changed ? 'text-red-700 font-bold' : 'text-slate-700'}`}
                    />
                    {inputMode === 'incremental' && changed && (
                        <div className="absolute hidden group-hover:block bottom-full left-0 bg-slate-800 text-white text-xs px-2 py-1 rounded shadow z-20 whitespace-nowrap mb-1">
                            累計: {currentVal} (初期値: {defVal})
                        </div>
                    )}
                </td>
            );
        };

        return (
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-2 px-1">
                    <div className="text-xs text-slate-500 font-bold">
                        {inputMode === 'incremental' ? '単年度付与ポイント (編集すると累計値が自動再計算されます)' : '累計ポイント (直接編集)'}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleExportCsv} className="text-xs bg-white hover:bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-emerald-200">
                            <FileDown className="w-3.5 h-3.5"/> CSV出力
                        </button>
                        <button onClick={handlePasteClick} className="text-xs bg-white hover:bg-slate-50 text-indigo-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-indigo-200">
                            <Clipboard className="w-3.5 h-3.5"/> 貼付
                        </button>
                        <button onClick={handleImportClick} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-slate-300">
                            <FileUp className="w-3.5 h-3.5"/> CSV取込
                        </button>
                    </div>
                </div>
                <div className="overflow-auto h-[500px] border border-slate-200 rounded-lg flex-1">
                    <table className="w-full text-sm text-right border-collapse relative">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-16 text-center border-b border-slate-200">年数</th>
                                <th className="p-3 border-b border-slate-200">係員勤続P</th>
                                <th className="p-3 border-b border-slate-200">係員職能P</th>
                                <th className="p-3 border-b border-slate-200">主任職能P</th>
                                <th className="p-3 border-b border-slate-200">係長職能P</th>
                                <th className="p-3 border-b border-slate-200">課長職能P</th>
                                <th className="p-3 border-b border-slate-200">次長職能P</th>
                                <th className="p-3 border-b border-slate-200">部長職能P</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.map((row, i) => (
                                <tr key={row.y} className="hover:bg-slate-50">
                                    <td className="p-2 text-center font-bold text-slate-500 bg-slate-50">{row.y}</td>
                                    {renderCell(row, 'los', i)}
                                    {renderCell(row, 'r1', i)}
                                    {renderCell(row, 'r2', i)}
                                    {renderCell(row, 'r3', i)}
                                    {renderCell(row, 'r4', i)}
                                    {renderCell(row, 'r5', i)}
                                    {renderCell(row, 'r6', i)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderT1Table = (key: 'masterData1_1' | 'masterData1_2' | 'masterData1_3') => {
        const data = localConfig[key];
        const defaultData = defaultConfig[key];

        const handleBlur = (index: number, field: keyof TableRowT1, valStr: string) => {
            const val = parseFloat(valStr);
            if (isNaN(val)) return;

            const newData = [...data];

            if (inputMode === 'cumulative') {
                newData[index] = { ...newData[index], [field]: val };
            } else {
                const prevVal = index > 0 ? newData[index - 1][field] : 0;
                const currentInc = round(newData[index][field] - prevVal);
                const delta = round(val - currentInc);
                if (delta === 0) return;
                for (let i = index; i < newData.length; i++) {
                    newData[i] = { ...newData[i], [field]: round(newData[i][field] + delta) };
                }
            }
            setLocalConfig(prev => ({ ...prev, [key]: newData }));
        };

        const renderCell = (row: TableRowT1, field: keyof TableRowT1, i: number) => {
            const defRow = defaultData.find(r => r.y === row.y) || { y: row.y, los1:0, r1_1:0,r2:0,r3:0,r4:0,r5:0,r6:0 };
            const prevRow = i > 0 ? data[i-1] : { los1:0, r1_1:0,r2:0,r3:0,r4:0,r5:0,r6:0 };
            const defPrevRow = i > 0 ? defaultData[i-1] : { los1:0, r1_1:0,r2:0,r3:0,r4:0,r5:0,r6:0 };

            const currentVal = row[field];
            const prevVal = (prevRow as any)[field];
            const defVal = (defRow as any)[field];
            const defPrevVal = (defPrevRow as any)[field];

            const displayVal = inputMode === 'incremental' ? round(currentVal - prevVal) : currentVal;
            const changed = isChanged(currentVal, prevVal, defVal, defPrevVal);

            return (
                <td className={`p-1 relative group border border-slate-100 ${changed ? 'bg-red-50 border-red-300' : ''}`}>
                    <input 
                        type="number" step="0.1"
                        key={displayVal}
                        defaultValue={displayVal}
                        onBlur={(e) => handleBlur(i, field, e.target.value)}
                        className={`w-full text-right p-1 rounded bg-transparent outline-none focus:ring-2 focus:ring-indigo-400 ${changed ? 'text-red-700 font-bold' : 'text-slate-700'}`}
                    />
                    {inputMode === 'incremental' && changed && (
                        <div className="absolute hidden group-hover:block bottom-full left-0 bg-slate-800 text-white text-xs px-2 py-1 rounded shadow z-20 whitespace-nowrap mb-1">
                            累計: {currentVal} (初期値: {defVal})
                        </div>
                    )}
                </td>
            );
        };

        return (
            <div className="flex flex-col h-full">
                 <div className="flex justify-between items-center mb-2 px-1">
                    <div className="text-xs text-slate-500 font-bold">
                        {inputMode === 'incremental' ? '単年度付与ポイント (編集すると累計値が自動再計算されます)' : '累計ポイント (直接編集)'}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleExportCsv} className="text-xs bg-white hover:bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-emerald-200">
                            <FileDown className="w-3.5 h-3.5"/> CSV出力
                        </button>
                        <button onClick={handlePasteClick} className="text-xs bg-white hover:bg-slate-50 text-indigo-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-indigo-200">
                            <Clipboard className="w-3.5 h-3.5"/> 貼付
                        </button>
                        <button onClick={handleImportClick} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-slate-300">
                            <FileUp className="w-3.5 h-3.5"/> CSV取込
                        </button>
                    </div>
                </div>
                <div className="overflow-auto h-[500px] border border-slate-200 rounded-lg flex-1">
                    <table className="w-full text-sm text-right border-collapse relative">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-16 text-center border-b border-slate-200">年数</th>
                                <th className="p-3 border-b border-slate-200">勤続P</th>
                                <th className="p-3 border-b border-slate-200">係員</th>
                                <th className="p-3 border-b border-slate-200">主任</th>
                                <th className="p-3 border-b border-slate-200">係長</th>
                                <th className="p-3 border-b border-slate-200">課長</th>
                                <th className="p-3 border-b border-slate-200">次長</th>
                                <th className="p-3 border-b border-slate-200">部長</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.map((row, i) => (
                                <tr key={row.y} className="hover:bg-slate-50">
                                    <td className="p-2 text-center font-bold text-slate-500 bg-slate-50">{row.y}</td>
                                    {renderCell(row, 'los1', i)}
                                    {renderCell(row, 'r1_1', i)}
                                    {renderCell(row, 'r2', i)}
                                    {renderCell(row, 'r3', i)}
                                    {renderCell(row, 'r4', i)}
                                    {renderCell(row, 'r5', i)}
                                    {renderCell(row, 'r6', i)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderCoefTable = (settings: CoefSettings, isFuture: boolean = false) => {
        const types = ['type1', 'type2', 'type3', 'type4'] as const;
        const years = settings.type1.map(r => r.years);
        
        const isCoefChanged = (val: number, defVal: number) => Math.abs(val - defVal) > 0.0001;

        const handleBlur = (type: keyof CoefSettings, index: number, valStr: string) => {
            const val = parseFloat(valStr);
            if (isNaN(val)) return;

            const newCoefs = { ...settings };
            const newArr = [...newCoefs[type]];
            newArr[index] = { ...newArr[index], coef: val };
            newCoefs[type] = newArr; 
            
            if (isFuture) {
                 setLocalConfig(prev => ({ ...prev, coefSettingsFuture: newCoefs }));
            } else {
                 setLocalConfig(prev => ({ ...prev, coefSettings: newCoefs }));
            }
        };

        const defaultSettings = isFuture ? defaultConfig.coefSettingsFuture : defaultConfig.coefSettings;

        return (
            <div className="flex flex-col h-full">
                 <div className="flex justify-between items-center mb-2 px-1">
                    <div className="text-xs text-slate-500 font-bold">
                        ※ 支給率係数は「絶対値」設定のため、累計/単年度モードの影響を受けません。
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleExportCsv} className="text-xs bg-white hover:bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-emerald-200">
                            <FileDown className="w-3.5 h-3.5"/> CSV出力
                        </button>
                        <button onClick={handlePasteClick} className="text-xs bg-white hover:bg-slate-50 text-indigo-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-indigo-200">
                            <Clipboard className="w-3.5 h-3.5"/> 貼付
                        </button>
                        <button onClick={handleImportClick} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded flex items-center gap-1.5 transition font-bold border border-slate-300">
                            <FileUp className="w-3.5 h-3.5"/> CSV取込
                        </button>
                    </div>
                </div>
                <div className="overflow-auto h-[500px] border border-slate-200 rounded-lg">
                    <table className="w-full text-sm text-right border-collapse relative">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-16 text-center border-b border-slate-200">年数</th>
                                <th className="p-3 border-b border-slate-200 text-orange-600">{isFuture ? '旧制度①(改定後)' : '現行旧制度①'}</th>
                                <th className="p-3 border-b border-slate-200 text-yellow-600">{isFuture ? '旧制度②(改定後)' : '現行旧制度②'}</th>
                                <th className="p-3 border-b border-slate-200 text-emerald-600">{isFuture ? '旧制度③(改定後)' : '現行旧制度③'}</th>
                                <th className="p-3 border-b border-slate-200 text-blue-600">{isFuture ? '新制度(改定後)' : '現行新制度'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {years.map((y, i) => (
                                <tr key={y} className="hover:bg-slate-50">
                                    <td className="p-2 text-center font-bold text-slate-500 bg-slate-50">{y}</td>
                                    {types.map(t => {
                                        const val = settings[t][i]?.coef || 0;
                                        const defVal = defaultSettings[t][i]?.coef || 0;
                                        const changed = isCoefChanged(val, defVal);
                                        return (
                                            <td key={t} className={`p-1 border border-slate-100 ${changed ? 'bg-red-50 border-red-300' : ''}`}>
                                                <input 
                                                    type="number" step="0.1"
                                                    key={val}
                                                    defaultValue={val}
                                                    onBlur={(e) => handleBlur(t, i, e.target.value)}
                                                    className={`w-full text-right p-1 rounded bg-transparent outline-none focus:ring-2 focus:ring-indigo-400 ${changed ? 'text-red-700 font-bold' : 'text-slate-700'}`}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    const renderFutureParamsEditor = () => {
        const { retirementAgesFuture, cutoffYearsFuture, defaultYearlyEvalFuture } = localConfig;
        
        // Helper to check against default
        const isChanged = (current: any, original: any) => {
            return current != original;
        };

        return (
            <div className="h-[500px] overflow-auto p-4 border border-slate-200 rounded-lg">
                <div className="space-y-8 max-w-2xl mx-auto">
                    
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <div className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                             <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                             標準考課ポイント (将来)
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-bold text-slate-500 w-32">年間付与Pt</label>
                            <input 
                                type="number" 
                                value={defaultYearlyEvalFuture} 
                                onChange={(e) => setLocalConfig(prev => ({...prev, defaultYearlyEvalFuture: Number(e.target.value)}))}
                                className={`border rounded p-2 text-right w-24 focus:ring-2 focus:ring-indigo-200 outline-none ${isChanged(defaultYearlyEvalFuture, defaultConfig.defaultYearlyEvalFuture) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-slate-300'}`}
                            />
                            <span className="text-xs text-slate-400">※ 制度移行後の標準ポイント</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <div className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                             <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                             定年年齢 (将来)
                        </div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                            {['type1','type2','type3','type4'].map((t) => (
                                <div key={t} className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-slate-500">
                                        {t === 'type1' ? '旧制度①' : t === 'type2' ? '旧制度②' : t === 'type3' ? '旧制度③' : '新制度'}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            value={(retirementAgesFuture as any)[t]} 
                                            onChange={(e) => setLocalConfig(prev => ({
                                                ...prev, 
                                                retirementAgesFuture: { ...prev.retirementAgesFuture, [t]: Number(e.target.value) }
                                            }))}
                                            className={`border rounded p-2 text-right w-20 focus:ring-2 focus:ring-indigo-200 outline-none ${isChanged((retirementAgesFuture as any)[t], (defaultConfig.retirementAgesFuture as any)[t]) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-slate-300'}`}
                                        />
                                        <span className="text-sm text-slate-400">歳</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <div className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                             <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                             職能ポイント上限年数 (将来)
                        </div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                            {['type1','type2','type3','type4'].map((t) => (
                                <div key={t} className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-slate-500">
                                        {t === 'type1' ? '旧制度①' : t === 'type2' ? '旧制度②' : t === 'type3' ? '旧制度③' : '新制度'}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" min={30} max={47}
                                            value={(cutoffYearsFuture as any)[t]} 
                                            onChange={(e) => setLocalConfig(prev => ({
                                                ...prev, 
                                                cutoffYearsFuture: { ...prev.cutoffYearsFuture, [t]: Number(e.target.value) }
                                            }))}
                                            className={`border rounded p-2 text-right w-20 focus:ring-2 focus:ring-indigo-200 outline-none ${isChanged((cutoffYearsFuture as any)[t], (defaultConfig.cutoffYearsFuture as any)[t]) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-slate-300'}`}
                                        />
                                        <span className="text-sm text-slate-400">年</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        );
    }
    
    // Future Tab Renderer: Switches between Point Table and Coef Table by Type
    const renderFutureTab = () => {
         return (
            <div className="flex flex-col h-full">
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-indigo-800 px-2">編集対象:</span>
                        <div className="flex bg-white rounded-lg border border-indigo-200 p-0.5">
                            <button 
                                onClick={() => setFutureDataType('table')}
                                className={`px-3 py-1 text-sm font-bold rounded-md transition ${futureDataType === 'table' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                ポイント表
                            </button>
                            <button 
                                onClick={() => setFutureDataType('coef')}
                                className={`px-3 py-1 text-sm font-bold rounded-md transition ${futureDataType === 'coef' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                支給率係数
                            </button>
                            <button 
                                onClick={() => setFutureDataType('params')}
                                className={`px-3 py-1 text-sm font-bold rounded-md transition ${futureDataType === 'params' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                パラメータ
                            </button>
                        </div>
                    </div>
                    
                    {futureDataType !== 'params' && (
                        <>
                        <div className="h-6 w-px bg-indigo-200 mx-2 hidden sm:block"></div>
                        <div className="flex items-center gap-2">
                             <span className="text-sm font-bold text-indigo-800 px-2">適用対象:</span>
                            {[
                                { k: 'type1', l: '① 旧制度1 (改定後)' },
                                { k: 'type2', l: '② 旧制度2 (改定後)' },
                                { k: 'type3', l: '③ 旧制度3 (改定後)' },
                                { k: 'type4', l: '新 新制度 (改定後)' },
                            ].map(t => (
                                <button
                                    key={t.k}
                                    onClick={() => setFutureSubTab(t.k as any)}
                                    className={`px-3 py-1.5 rounded text-sm font-bold transition ${futureSubTab === t.k ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-indigo-600 hover:bg-indigo-100'}`}
                                >
                                    {t.l}
                                </button>
                            ))}
                        </div>
                        </>
                    )}
                </div>
                
                {futureDataType === 'table' ? (
                     renderT2Table('masterDataFuture')
                ) : futureDataType === 'coef' ? (
                    renderCoefTable(localConfig.coefSettingsFuture, true)
                ) : (
                    renderFutureParamsEditor()
                )}
            </div>
         );
    }

    const TABS = [
        { key: 'future', label: '改定（案）' },
        { key: 'masterData1_1', label: '現行旧制度①' },
        { key: 'masterData1_2', label: '現行旧制度②' },
        { key: 'masterData1_3', label: '現行旧制度③' },
        { key: 'masterData2', label: '現行新制度' },
        { key: 'coefSettings', label: '現行支給率' },
    ];

    const showInputModeToggle = activeTab !== 'coefSettings' && !(activeTab === 'future' && (futureDataType === 'coef' || futureDataType === 'params'));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl h-full max-h-[95vh] rounded-xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="absolute w-0 h-0 opacity-0 pointer-events-none" 
                    accept=".csv,text/csv,application/vnd.ms-excel" 
                    onChange={handleFileChange} 
                />

                {notification && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className={`px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
                            notification.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 
                            notification.type === 'warning' ? 'bg-amber-500 border-amber-400 text-white' :
                            'bg-emerald-600 border-emerald-500 text-white'
                        }`}>
                            {notification.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            <span className="text-sm font-bold whitespace-pre-wrap">{notification.message}</span>
                            <button onClick={() => setNotification(null)} className="ml-2 hover:bg-white/20 p-1 rounded">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="bg-slate-800 text-white px-4 sm:px-8 py-3 sm:py-5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3 font-bold text-base sm:text-xl">
                        <TableIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-300" />
                        <span className="truncate">マスタ編集：{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                        {showInputModeToggle && (
                            <div className="bg-slate-700 rounded-lg p-0.5 flex items-center shadow-inner no-print">
                                <button
                                    onClick={() => setInputMode('incremental')}
                                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold flex items-center gap-1 transition ${inputMode === 'incremental' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
                                >
                                    <BarChart className="w-3 sm:w-3.5 h-3 sm:h-3.5"/> <span className="hidden xs:inline">単年度</span>
                                </button>
                                <button
                                    onClick={() => setInputMode('cumulative')}
                                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold flex items-center gap-1 transition ${inputMode === 'cumulative' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
                                >
                                    <Layers className="w-3 sm:w-3.5 h-3 sm:h-3.5"/> <span className="hidden xs:inline">累計</span>
                                </button>
                            </div>
                        )}
                        <button onClick={handleClose} className="hover:bg-slate-700 p-1.5 sm:p-2 rounded-full transition">
                            <X className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto shrink-0 touch-pan-y scrollbar-default">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabKey)}
                            className={`px-3 sm:px-5 py-3 sm:py-4 text-xs sm:text-base font-bold whitespace-nowrap transition border-r border-slate-200 ${activeTab === tab.key ? 'bg-white text-indigo-600 border-b-2 border-b-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                    <div className="flex-1"></div>
                     <button onClick={handleResetTab} className="px-3 sm:px-5 py-3 sm:py-4 text-[10px] sm:text-sm font-bold text-slate-400 hover:text-orange-600 flex items-center gap-1 sm:gap-2 transition whitespace-nowrap">
                        <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">リセット</span>
                    </button>
                </div>

                <div className="flex-1 p-3 sm:p-8 overflow-hidden bg-white flex flex-col">
                    <div className="flex-1 overflow-x-auto border border-slate-200 rounded-xl touch-pan-y">
                        {activeTab === 'coefSettings' ? renderCoefTable(localConfig.coefSettings, false) : 
                         activeTab === 'future' ? renderFutureTab() :
                         activeTab === 'masterData2' ? renderT2Table('masterData2') :
                         renderT1Table(activeTab as any)}
                    </div>
                     
                     <div className="mt-2 sm:mt-4 pt-2 text-[10px] sm:text-sm text-right text-slate-400">
                        * <span className="text-red-700 font-bold bg-red-100 px-1 rounded">赤字</span> は初期値から変更された箇所です
                     </div>
                </div>

                <div className="p-3 sm:p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 sm:gap-4 shrink-0">
                    <button onClick={handleClose} className="px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition text-sm sm:text-base">キャンセル</button>
                    <button onClick={handleSave} className="px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm text-sm sm:text-base">
                        <Save className="w-4 h-4 sm:w-5 sm:h-5"/> 変更を適用
                    </button>
                </div>
            </div>
            {/* Confirm Modal */}
            {confirmAction && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">{confirmAction.title}</h3>
                        <p className="text-slate-600 dark:text-slate-400 mb-6 whitespace-pre-wrap">{confirmAction.message}</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">キャンセル</button>
                            <button onClick={confirmAction.onConfirm} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">実行する</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};