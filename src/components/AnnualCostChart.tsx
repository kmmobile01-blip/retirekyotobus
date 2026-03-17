
import React, { useState, useMemo } from 'react';
import { BarChart3, Printer, Download, Copy, Check, Image as ImageIcon, Loader2, FileSpreadsheet, Users } from 'lucide-react';
import { AggregatedYearlyData } from '../types';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

interface AnnualCostChartProps {
    data: AggregatedYearlyData[];
}

export const AnnualCostChart: React.FC<AnnualCostChartProps> = ({ data }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [isCopying, setIsCopying] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isExcelExporting, setIsExcelExporting] = useState(false);

    // --- Pre-calculation for Financial Table ---
    const financialData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Sort data 2025-2080
        const sortedData = data.filter(d => d.year >= 2025 && d.year <= 2080).sort((a,b) => a.year - b.year);
        
        let previousEndReserveA = 0;
        let previousEndReserveB = 0;

        return sortedData.map((d, index) => {
            const isFirstYear = d.year === 2025;
            
            let endReserveA, beginReserveA;
            let endReserveB, beginReserveB;
            
            const provisionA = d.A.total;
            const payoutA = d.payoutA.total;
            const provisionB = d.B.total;
            const payoutB = d.payoutB.total;

            if (isFirstYear) {
                // 2025 specific logic
                const stockSumA = d.stockA.total;
                const stockSumB = d.stockB.total;

                beginReserveA = stockSumA - provisionA;
                endReserveA = stockSumA - payoutA;

                beginReserveB = stockSumB - provisionB;
                endReserveB = stockSumB - payoutB;
                
                previousEndReserveA = endReserveA;
                previousEndReserveB = endReserveB;
            } else {
                // 2026+ logic (Rolling calculation)
                beginReserveA = previousEndReserveA;
                beginReserveB = previousEndReserveB;
                
                endReserveA = beginReserveA + provisionA - payoutA;
                endReserveB = beginReserveB + provisionB - payoutB;
                
                previousEndReserveA = endReserveA;
                previousEndReserveB = endReserveB;
            }
            
            return {
                ...d,
                calc: {
                    A: {
                        beginReserve: beginReserveA,
                        provision: provisionA,
                        payout: payoutA,
                        endReserve: endReserveA,
                    },
                    B: {
                        beginReserve: beginReserveB,
                        provision: provisionB,
                        payout: payoutB,
                        endReserve: endReserveB,
                    }
                }
            };
        });
    }, [data]);

    if (!data || data.length === 0) return null;

    // Display Range (Graph & Table) - Show all
    const displayData = financialData;
    const maxVal = Math.max(...displayData.map(d => Math.max(d.A.total, d.B.total)), 0);
    const yAxisMax = maxVal > 0 ? maxVal * 1.15 : 5000000; 

    // Dimensions
    const height = 300;
    const barGroupWidth = 50; 
    const barWidth = 18;
    const gap = 24;
    const marginLeft = 60;
    const width = displayData.length * (barGroupWidth + gap) + marginLeft + 20;

    const getWareki = (year: number) => `R${year - 2018}`;

    // Colors
    const colors = {
        type1: '#f97316', // Orange
        type2: '#eab308', // Yellow
        type3: '#10b981', // Emerald
        type4: '#3b82f6', // Blue
    };

    const handlePrint = () => {
        const styleId = 'print-orientation-style';
        let style = document.getElementById(styleId);
        if (style) style.remove();
        style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `@media print { @page { size: A3 landscape; } }`;
        document.head.appendChild(style);
        setTimeout(() => window.print(), 100);
    };

    const captureChart = async (): Promise<HTMLCanvasElement | null> => {
        const element = document.getElementById('annual-cost-chart-container');
        if (!element) return null;
        const originalOverflow = element.style.overflow;
        element.style.overflow = 'visible';
        try {
            const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: element.scrollWidth + 50 });
            element.style.overflow = originalOverflow;
            return canvas;
        } catch (e) {
            console.error(e);
            element.style.overflow = originalOverflow;
            return null;
        }
    };

    const handleDownloadImage = async () => {
        setIsDownloading(true);
        const canvas = await captureChart();
        if (canvas) {
            const link = document.createElement('a');
            link.download = `引当金繰入額推移_${new Date().toISOString().slice(0,10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } else { alert('画像の生成に失敗しました。'); }
        setIsDownloading(false);
    };

    const handleCopyImage = async () => {
        setIsCopying(true);
        try {
            const canvas = await captureChart();
            if (canvas) {
                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    try {
                        const item = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([item]);
                        setTimeout(() => setIsCopying(false), 2000);
                    } catch (err) { alert('クリップボードへのコピーに失敗しました。'); setIsCopying(false); }
                });
            } else { setIsCopying(false); }
        } catch (e) { setIsCopying(false); }
    };

    const handleDownloadExcel = () => {
        setIsExcelExporting(true);
        try {
            // Excel includes full range (up to 2080)
            const exportData = financialData;
            
            const yearHeaders = exportData.map(d => d.year === 2025 ? `${d.year}年度(半期)` : `${d.year}年度`);
            const headerRow = ["項目", ...yearHeaders];

            const metrics = [
                // Employee Counts
                { label: "【基本】在籍人数(合計)", getValue: (d: any) => d.counts.total },
                { label: "　L 旧制度①", getValue: (d: any) => d.counts.type1 },
                { label: "　L 旧制度②", getValue: (d: any) => d.counts.type2 },
                { label: "　L 旧制度③", getValue: (d: any) => d.counts.type3 },
                { label: "　L 新制度", getValue: (d: any) => d.counts.type4 },

                // Plan A
                { label: "【A案】期首引当残高", getValue: (d: any) => d.calc.A.beginReserve },
                { label: "【A案】(+)当年度繰入額(合計)", getValue: (d: any) => d.calc.A.provision },
                { label: "　L 繰入(旧①)", getValue: (d: any) => d.A.type1 },
                { label: "　L 繰入(旧②)", getValue: (d: any) => d.A.type2 },
                { label: "　L 繰入(旧③)", getValue: (d: any) => d.A.type3 },
                { label: "　L 繰入(新)", getValue: (d: any) => d.A.type4 },
                { label: "【A案】(-)当年度支給額", getValue: (d: any) => d.calc.A.payout },
                { label: "【A案】(=)期末引当残高", getValue: (d: any) => d.calc.A.endReserve },
                
                // Plan B
                { label: "【B案】期首引当残高", getValue: (d: any) => d.calc.B.beginReserve },
                { label: "【B案】(+)当年度繰入額(合計)", getValue: (d: any) => d.calc.B.provision },
                { label: "　L 繰入(旧①)", getValue: (d: any) => d.B.type1 },
                { label: "　L 繰入(旧②)", getValue: (d: any) => d.B.type2 },
                { label: "　L 繰入(旧③)", getValue: (d: any) => d.B.type3 },
                { label: "　L 繰入(新)", getValue: (d: any) => d.B.type4 },
                { label: "【B案】(-)当年度支給額", getValue: (d: any) => d.calc.B.payout },
                { label: "【B案】(=)期末引当残高", getValue: (d: any) => d.calc.B.endReserve },
            ];

            const dataRows = metrics.map(metric => [metric.label, ...exportData.map(d => metric.getValue(d))]);
            const wsData = [headerRow, ...dataRows];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const colWidths = [{ wch: 30 }];
            for(let i=0; i<yearHeaders.length; i++) colWidths.push({ wch: 14 });
            ws['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, "財務推移詳細");
            XLSX.writeFile(wb, `退職金財務シミュレーション_${new Date().toISOString().slice(0,10)}.xlsx`);
        } catch (e: any) { alert("Excel生成失敗: " + e.message); } 
        finally { setIsExcelExporting(false); }
    };

    const renderCell = (val: number, type: 'currency'|'number', colorClass: string, key: string | number, prefix: string = '') => (
        <td key={key} className={`p-4 text-right font-mono text-sm border-r border-slate-100 ${colorClass}`}>
            {prefix}{val.toLocaleString()}
        </td>
    );

    // Helper for rendering count breakdown row
    const renderCountRow = (label: string, key: 'total'|'type1'|'type2'|'type3'|'type4', colorClass: string) => (
        <tr>
            <th className="p-2 pl-4 text-left font-normal text-xs text-slate-500 sticky left-0 bg-white border-r border-slate-200">{label}</th>
            {displayData.map(d => <td key={d.year} className={`p-2 text-right text-xs font-mono border-r border-slate-100 ${colorClass}`}>{d.counts[key]}名</td>)}
        </tr>
    );

    // Helper for rendering breakdown row (indented)
    const renderBreakdownRow = (dataKey: 'A'|'B', typeKey: 'type1'|'type2'|'type3'|'type4', colorDot: string) => (
        <tr className="bg-slate-50/30">
            <th className="p-2 pl-8 text-left font-normal text-xs text-slate-400 sticky left-0 bg-white border-r border-slate-200">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colorDot}`}></span>
                {typeKey === 'type1' ? '旧①' : typeKey === 'type2' ? '旧②' : typeKey === 'type3' ? '旧③' : '新'}
            </th>
            {displayData.map(d => (
                <td key={d.year} className="p-2 text-right font-mono text-xs text-slate-500 border-r border-slate-100">
                    {d[dataKey][typeKey].toLocaleString()}
                </td>
            ))}
        </tr>
    );

    return (
        <div id="annual-cost-chart-container" className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8 print-break-inside-avoid">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 rounded-lg">
                        <BarChart3 className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-700 text-lg">パターン比較: 引当金繰入額 (単年度費用)</h4>
                        <p className="text-sm text-slate-500">制度区分別の積み上げグラフ</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 no-print">
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold mr-2">
                        <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm bg-orange-500"></span>旧制度①</div>
                        <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm bg-yellow-500"></span>旧制度②</div>
                        <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm bg-emerald-500"></span>旧制度③</div>
                        <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm bg-blue-500"></span>新制度</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadExcel} disabled={isExcelExporting} className="bg-white hover:bg-green-50 border border-slate-200 hover:border-green-300 text-green-700 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                            {isExcelExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileSpreadsheet className="w-4 h-4"/>} Excel
                        </button>
                        <button onClick={handleCopyImage} disabled={isCopying} className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition border ${isCopying ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'}`}>
                            {isCopying ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>} {isCopying ? 'コピー完了' : '画像コピー'}
                        </button>
                        <button onClick={handleDownloadImage} disabled={isDownloading} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin"/> : <ImageIcon className="w-4 h-4"/>} 保存
                        </button>
                        <button onClick={handlePrint} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                            <Printer className="w-4 h-4"/> 印刷
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Graph */}
            <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200">
                <svg width={Math.max(width, 600)} height={height + 60} className="mx-auto">
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                        const y = height - (height * ratio);
                        const value = yAxisMax * ratio;
                        return (
                            <g key={i}>
                                <line x1={marginLeft} y1={y} x2={width} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                                <text x={marginLeft - 8} y={y + 4} textAnchor="end" className="text-xs fill-slate-400 font-mono">
                                    {(value / 1000000).toFixed(1)}M
                                </text>
                            </g>
                        );
                    })}
                    {displayData.map((d, i) => {
                        const x = marginLeft + i * (barGroupWidth + gap);
                        const isHovered = hoveredIndex === i;
                        const getStacks = (vals: {type1:number, type2:number, type3:number, type4:number, total:number}) => {
                            const scale = (v: number) => (v / yAxisMax) * height;
                            return { h1: scale(vals.type1), h2: scale(vals.type2), h3: scale(vals.type3), h4: scale(vals.type4) };
                        };
                        const sA = getStacks(d.A);
                        const sB = getStacks(d.B);
                        return (
                            <g key={d.year} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)}>
                                <rect x={x - 4} y={0} width={barGroupWidth + 8} height={height} fill={isHovered ? "#f1f5f9" : "transparent"} rx={4} />
                                {/* Stack A */}
                                <rect x={x} y={height - sA.h1} width={barWidth} height={sA.h1} fill={colors.type1} />
                                <rect x={x} y={height - sA.h1 - sA.h2} width={barWidth} height={sA.h2} fill={colors.type2} />
                                <rect x={x} y={height - sA.h1 - sA.h2 - sA.h3} width={barWidth} height={sA.h3} fill={colors.type3} />
                                <rect x={x} y={height - sA.h1 - sA.h2 - sA.h3 - sA.h4} width={barWidth} height={sA.h4} fill={colors.type4} />
                                {/* Stack B */}
                                <rect x={x + barWidth + 4} y={height - sB.h1} width={barWidth} height={sB.h1} fill={colors.type1} />
                                <rect x={x + barWidth + 4} y={height - sB.h1 - sB.h2} width={barWidth} height={sB.h2} fill={colors.type2} />
                                <rect x={x + barWidth + 4} y={height - sB.h1 - sB.h2 - sB.h3} width={barWidth} height={sB.h3} fill={colors.type3} />
                                <rect x={x + barWidth + 4} y={height - sB.h1 - sB.h2 - sB.h3 - sB.h4} width={barWidth} height={sB.h4} fill={colors.type4} />
                                
                                <text textAnchor="middle" x={x + barGroupWidth / 2} y={height + 20} className={`text-xs font-bold ${isHovered ? 'fill-indigo-700' : 'fill-slate-500'}`}>{d.year}</text>
                                <text textAnchor="middle" x={x + barGroupWidth / 2} y={height + 35} className="text-[10px] fill-slate-400">{getWareki(d.year)}</text>
                                <text textAnchor="middle" x={x + barWidth/2} y={height + 5} className="text-[10px] font-bold fill-indigo-600">A</text>
                                <text textAnchor="middle" x={x + barWidth + 4 + barWidth/2} y={height + 5} className="text-[10px] font-bold fill-emerald-600">B</text>
                            </g>
                        );
                    })}
                    <line x1={marginLeft} y1={height} x2={width} y2={height} stroke="#cbd5e1" strokeWidth="1" />
                </svg>
            </div>

            {/* Detailed Table */}
            <div className="mt-10 overflow-x-auto">
                <table className="w-full text-right text-base border-collapse min-w-max">
                    <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                            <th className="p-4 text-left sticky left-0 bg-slate-100 z-10 w-56 font-bold border-r border-slate-200 shadow-[1px_0_3px_-1px_rgba(0,0,0,0.1)]">年度</th>
                            {displayData.map(d => (
                                <th key={d.year} className="p-4 text-center min-w-[130px] font-bold border-r border-slate-200 last:border-0 align-top">
                                    <div>{d.year}</div>
                                    <div className={`text-xs font-normal mt-1 ${d.year === 2025 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                                        {d.year === 2025 ? '(参考・半期)' : `(${getWareki(d.year)})`}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* Basic Info (Counts) */}
                        <tr className="bg-slate-700 text-white"><td colSpan={displayData.length + 1} className="p-2 pl-4 text-xs font-bold uppercase flex items-center gap-2"><Users className="w-4 h-4"/> 基本情報 (在籍人数)</td></tr>
                        <tr>
                            <th className="p-2 pl-4 text-left font-bold text-sm text-slate-600 sticky left-0 bg-white border-r border-slate-200">総人数</th>
                            {displayData.map(d => <td key={d.year} className="p-2 text-right text-sm font-bold text-slate-700 border-r border-slate-100">{d.counts.total}名</td>)}
                        </tr>
                        {renderCountRow(" ↳ 旧制度①", "type1", "text-orange-600")}
                        {renderCountRow(" ↳ 旧制度②", "type2", "text-yellow-600")}
                        {renderCountRow(" ↳ 旧制度③", "type3", "text-emerald-600")}
                        {renderCountRow(" ↳ 新制度", "type4", "text-blue-600")}

                        {/* A Section */}
                        <tr className="bg-indigo-600 text-white"><td colSpan={displayData.length + 1} className="p-2 pl-4 text-xs font-bold uppercase mt-4">【A案】変更シミュレーション (単位:円)</td></tr>
                        
                        <tr className="bg-indigo-50/10">
                            <th className="p-4 text-left font-bold text-slate-600 sticky left-0 bg-white border-r border-slate-200 shadow-sm">期首引当残高</th>
                            {displayData.map(d => renderCell(d.calc.A.beginReserve, 'currency', 'text-slate-500', d.year))}
                        </tr>
                        <tr className="bg-indigo-50/40">
                            <th className="p-4 text-left font-bold text-indigo-700 sticky left-0 bg-indigo-50 border-r border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1"><span className="text-xs border border-indigo-300 rounded px-1 text-indigo-500">+</span> 当年度繰入額 (合計)</div>
                            </th>
                            {displayData.map(d => renderCell(d.calc.A.provision, 'currency', 'text-indigo-700 font-bold', d.year))}
                        </tr>
                        {/* Breakdown for A */}
                        {renderBreakdownRow('A', 'type1', 'bg-orange-500')}
                        {renderBreakdownRow('A', 'type2', 'bg-yellow-500')}
                        {renderBreakdownRow('A', 'type3', 'bg-emerald-500')}
                        {renderBreakdownRow('A', 'type4', 'bg-blue-500')}

                        <tr className="bg-indigo-50/10">
                            <th className="p-4 text-left font-bold text-slate-600 sticky left-0 bg-white border-r border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1"><span className="text-xs border border-slate-300 rounded px-1.5 text-slate-400">-</span> 当年度支給額</div>
                            </th>
                            {displayData.map(d => renderCell(d.calc.A.payout, 'currency', 'text-slate-600', d.year))}
                        </tr>
                        <tr className="bg-indigo-50/20 border-b-2 border-indigo-100">
                            <th className="p-4 text-left font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1"><span className="text-xs border border-slate-400 bg-slate-100 rounded px-1 text-slate-600">=</span> 期末引当残高</div>
                            </th>
                            {displayData.map(d => renderCell(d.calc.A.endReserve, 'currency', 'text-slate-800 font-bold', d.year))}
                        </tr>

                        {/* B Section */}
                        <tr className="bg-emerald-600 text-white"><td colSpan={displayData.length + 1} className="p-2 pl-4 text-xs font-bold uppercase mt-4">【B案】現行シミュレーション (単位:円)</td></tr>
                        
                        <tr className="bg-emerald-50/10">
                            <th className="p-4 text-left font-bold text-slate-600 sticky left-0 bg-white border-r border-slate-200 shadow-sm">期首引当残高</th>
                            {displayData.map(d => renderCell(d.calc.B.beginReserve, 'currency', 'text-slate-500', d.year))}
                        </tr>
                        <tr className="bg-emerald-50/40">
                            <th className="p-4 text-left font-bold text-emerald-700 sticky left-0 bg-emerald-50 border-r border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1"><span className="text-xs border border-emerald-300 rounded px-1 text-emerald-500">+</span> 当年度繰入額 (合計)</div>
                            </th>
                            {displayData.map(d => renderCell(d.calc.B.provision, 'currency', 'text-emerald-700 font-bold', d.year))}
                        </tr>
                        {/* Breakdown for B */}
                        {renderBreakdownRow('B', 'type1', 'bg-orange-500')}
                        {renderBreakdownRow('B', 'type2', 'bg-yellow-500')}
                        {renderBreakdownRow('B', 'type3', 'bg-emerald-500')}
                        {renderBreakdownRow('B', 'type4', 'bg-blue-500')}

                        <tr className="bg-emerald-50/10">
                            <th className="p-4 text-left font-bold text-slate-600 sticky left-0 bg-white border-r border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1"><span className="text-xs border border-slate-300 rounded px-1.5 text-slate-400">-</span> 当年度支給額</div>
                            </th>
                            {displayData.map(d => renderCell(d.calc.B.payout, 'currency', 'text-slate-600', d.year))}
                        </tr>
                        <tr className="bg-emerald-50/20 border-b-2 border-emerald-100">
                            <th className="p-4 text-left font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1"><span className="text-xs border border-slate-400 bg-slate-100 rounded px-1 text-slate-600">=</span> 期末引当残高</div>
                            </th>
                            {displayData.map(d => renderCell(d.calc.B.endReserve, 'currency', 'text-slate-800 font-bold', d.year))}
                        </tr>

                        {/* Diff Section */}
                        <tr className="bg-slate-200"><td colSpan={displayData.length + 1} className="p-2 pl-4 text-xs font-bold uppercase text-slate-600">差額 (A案 - B案)</td></tr>
                        <tr>
                            <th className="p-4 text-left font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 shadow-sm">繰入額 差額</th>
                            {displayData.map(d => {
                                const diff = d.A.total - d.B.total;
                                return <td key={d.year} className={`p-4 text-right font-mono font-bold border-r border-slate-100 ${diff > 0 ? 'text-red-500' : 'text-blue-600'}`}>{diff > 0 ? '+' : ''}{diff.toLocaleString()}</td>
                            })}
                        </tr>
                        <tr>
                            <th className="p-4 text-left font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 shadow-sm">期末残高 差額</th>
                            {displayData.map(d => {
                                const diff = d.calc.A.endReserve - d.calc.B.endReserve;
                                return <td key={d.year} className={`p-4 text-right font-mono font-bold border-r border-slate-100 ${diff > 0 ? 'text-red-500' : 'text-blue-600'}`}>{diff > 0 ? '+' : ''}{diff.toLocaleString()}</td>
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};
