import React from 'react';
import { User, X, Printer, ArrowRight, Info, Lock } from 'lucide-react';
import { CalculationResult, SimulationConfig } from '../types';
import { formatDateWithWareki } from '../utils';

interface ResultCardProps {
    resA: CalculationResult;
    resB: CalculationResult;
    configA: SimulationConfig;
    configB: SimulationConfig;
    onClose: () => void;
}

// 移行シミュレーションの説明コンポーネント
const TransitionExplainer = ({ config, colorClass, bgClass, borderClass }: { config: SimulationConfig, colorClass: string, bgClass: string, borderClass: string }) => {
    // Check for Adjustment Mode first
    if (config.adjustmentConfig?.enabled) {
        return (
            <div className={`mb-6 bg-amber-50 border-amber-100 border rounded-xl p-5 text-base shadow-sm animate-in fade-in slide-in-from-top-2`}>
                <div className={`font-bold flex items-center gap-2 mb-3 text-amber-700 text-lg border-b border-amber-100 pb-2`}>
                    <Lock className="w-6 h-6"/>
                    調整ポイントモード適用中：{config.label}
                </div>
                <div className="text-slate-700 text-sm leading-relaxed space-y-2">
                    <p>
                        <span className="font-bold bg-white px-2 py-0.5 rounded border border-amber-200">2026年3月31日</span> 時点の引当額を凍結し、
                        将来のポイント加算を停止します。
                    </p>
                    <p>
                        代わりに、定年時の退職金額が<span className="font-bold text-emerald-600">B案（現行制度）</span>と同額になるよう、
                        不足分を<span className="font-bold text-amber-600">「調整ポイント」</span>として毎月均等に付与します。
                    </p>
                </div>
            </div>
        );
    }

    if (!config.transitionConfig.enabled) return null;

    const dateStr = formatDateWithWareki(config.transitionConfig.date);

    return (
        <div className={`mb-6 ${bgClass} ${borderClass} border rounded-xl p-5 text-base shadow-sm animate-in fade-in slide-in-from-top-2`}>
            <div className={`font-bold flex items-center gap-2 mb-3 ${colorClass} text-lg border-b ${borderClass} pb-2`}>
                <Info className="w-6 h-6"/>
                制度移行シミュレーション詳細：{config.label}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 pl-1">
                {/* いつ */}
                <div className={`font-bold ${colorClass} whitespace-nowrap flex items-start mt-0.5`}>
                    <span className="w-6 h-6 rounded-full bg-white border border-current flex items-center justify-center text-xs mr-2 shrink-0">1</span>
                    いつ
                </div>
                <div className="text-slate-700">
                    <span className="font-bold bg-white px-2 py-0.5 rounded border border-slate-300 shadow-sm">{dateStr}</span> をもって現行（または移行前）の計算ルールを終了・凍結します。
                </div>

                {/* なにを */}
                <div className={`font-bold ${colorClass} whitespace-nowrap flex items-start mt-0.5`}>
                     <span className="w-6 h-6 rounded-full bg-white border border-current flex items-center justify-center text-xs mr-2 shrink-0">2</span>
                    なにを
                </div>
                <div className="text-slate-700">
                    翌日より、適用するポイント表を<span className="font-bold border-b-2 border-slate-300">「移行後・新ルール用マスタ」</span>へ切り替えます。
                </div>

                {/* どのように */}
                <div className={`font-bold ${colorClass} whitespace-nowrap flex items-start mt-0.5`}>
                     <span className="w-6 h-6 rounded-full bg-white border border-current flex items-center justify-center text-xs mr-2 shrink-0">3</span>
                    どのように
                </div>
                <div className="text-slate-700">
                    <div className="mb-2">基準日までの「既得ポイント」はそのまま維持し、基準日以降の期間については「新ルールに基づく増分」のみを加算します（カーブ乗り換え方式）。</div>
                    <div className="p-3 bg-white/80 rounded border border-slate-200 font-mono text-sm leading-relaxed text-slate-600 shadow-inner">
                        <div className="font-bold text-slate-800 mb-1 border-b border-slate-100 pb-1 flex justify-between">
                            <span>計算式イメージ</span>
                        </div>
                        <div className="py-1">
                            [退職金総Pt] = <span className="text-slate-500 font-bold">[基準日時点の現行Pt]</span> + (<span className={`${colorClass} font-bold`}>[退職時の新Pt]</span> - <span className={`${colorClass}`}>[基準日時点の新Pt]</span>)
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ResultCard: React.FC<ResultCardProps> = ({ resA, resB, configA, configB, onClose }) => {
    
    // Check if Adjustment mode was active and resulted in points
    const hasAdjustmentPoints = resA.yearlyDetails.some(d => d.adjustmentPtInc > 0);

    // 比較用ヘルパー (差分 = A - B)
    const renderComparisonRow = (label: string, valA: any, valB: any, unit: string = '', isCurrency: boolean = false) => {
        const numA = typeof valA === 'number' ? valA : 0;
        const numB = typeof valB === 'number' ? valB : 0;
        const diff = numA - numB; // A - B
        
        // A > B (Cost Increase) -> Red, A < B (Cost Decrease) -> Blue
        const diffColor = diff > 0 ? 'text-red-500' : (diff < 0 ? 'text-blue-600' : 'text-slate-400');
        const diffSign = diff > 0 ? '+' : '';
        
        const format = (v: any) => isCurrency ? v.toLocaleString() : v;

        return (
            <tr className="hover:bg-slate-50 transition">
                <td className="p-4 font-bold text-slate-600 text-base border-r border-slate-100">{label}</td>
                <td className="p-4 text-right font-mono text-slate-700 text-lg bg-indigo-50/10">{format(valA)}{unit}</td>
                <td className="p-4 text-right font-mono text-slate-700 text-lg bg-emerald-50/10 border-l border-slate-100">{format(valB)}{unit}</td>
                <td className={`p-4 text-right font-mono text-base font-bold ${diffColor} border-l border-slate-100`}>
                    {diff !== 0 && typeof valA === 'number' && typeof valB === 'number' ? `${diffSign}${format(isCurrency ? diff : parseFloat(diff.toFixed(2)))}${unit}` : (diff === 0 && typeof valA === 'number' ? '-' : '')}
                </td>
            </tr>
        );
    };

    const handlePrint = () => {
        // A3縦向き設定を注入
        const styleId = 'print-orientation-style';
        let style = document.getElementById(styleId);
        if (style) style.remove();

        style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `@media print { @page { size: A3 portrait; } }`;
        document.head.appendChild(style);

        setTimeout(() => window.print(), 100);
    };

    return (
        <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-2xl w-full max-w-5xl mx-auto my-6">
            {/* Header */}
            <div className="bg-slate-800 px-8 py-5 flex justify-between items-center text-white">
                <span className="font-bold flex items-center gap-3 text-xl">
                    <User className="w-6 h-6 text-indigo-300"/> 
                    シミュレーション比較結果
                </span>
                <div className="flex items-center gap-3 no-print">
                     <button onClick={handlePrint} className="hover:bg-slate-700 p-2.5 rounded-lg text-base flex items-center gap-2 font-bold">
                        <Printer className="w-5 h-5"/> A3縦で印刷
                    </button>
                    <button onClick={onClose} className="hover:bg-slate-700 p-2 rounded-full">
                        <X className="w-7 h-7"/>
                    </button>
                </div>
            </div>

            <div className="p-8">
                {/* Transition Explanations */}
                <TransitionExplainer config={configA} colorClass="text-indigo-700" bgClass="bg-indigo-50" borderClass="border-indigo-100" />
                <TransitionExplainer config={configB} colorClass="text-emerald-700" bgClass="bg-emerald-50" borderClass="border-emerald-100" />

                {/* Basic Info (Shared) */}
                <div className="flex flex-wrap gap-x-10 gap-y-4 mb-8 p-5 bg-slate-50 rounded-xl border border-slate-200 text-base">
                    <div><span className="text-slate-400 text-sm font-bold uppercase mr-2">社員番号</span><span className="font-mono font-bold text-xl">{resA.employeeId}</span></div>
                    <div><span className="text-slate-400 text-sm font-bold uppercase mr-2">氏名</span><span className="font-bold text-xl">{resA.name}</span></div>
                    <div><span className="text-slate-400 text-sm font-bold uppercase mr-2">等級</span><span className="font-bold text-lg">{resA.grade}</span></div>
                    <div><span className="text-slate-400 text-sm font-bold uppercase mr-2">制度</span><span className="font-bold text-lg">{resA.typeName}</span></div>
                    <div><span className="text-slate-400 text-sm font-bold uppercase mr-2">入社日</span><span className="font-mono text-lg">{formatDateWithWareki(resA.joinDate)}</span></div>
                </div>

                {/* Comparison Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-8">
                    <table className="w-full">
                        <thead className="bg-slate-100 text-sm font-bold text-slate-500 uppercase">
                            <tr>
                                <th className="p-4 text-left w-1/4">比較項目</th>
                                {/* 名称変更 */}
                                <th className="p-4 text-right w-1/4 text-indigo-600 bg-indigo-50/50">パターンA (変更案)</th>
                                <th className="p-4 text-right w-1/4 text-emerald-600 bg-emerald-50/50 border-l border-slate-200">パターンB (現行制度)</th>
                                <th className="p-4 text-right w-1/4 border-l border-slate-200">差分 (A - B)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {renderComparisonRow("定年年齢", configA.retirementAges.type4, configB.retirementAges.type4, "歳")}
                            {renderComparisonRow("定年退職日", formatDateWithWareki(resA.retirementDate), formatDateWithWareki(resB.retirementDate), "")}
                            {renderComparisonRow("勤続年数 (月数含)", `${resA.serviceDuration.years}年${resA.serviceDuration.months}ヶ月`, `${resB.serviceDuration.years}年${resB.serviceDuration.months}ヶ月`, "")}
                            
                            {/* Points */}
                            <tr className="bg-slate-50/50"><td colSpan={4} className="p-3 text-sm font-bold text-slate-400 uppercase pl-4">ポイント内訳 (退職時)</td></tr>
                            {renderComparisonRow("勤続ポイント", resA.initialLosPointsInput+resA.futureLosPoints, resB.initialLosPointsInput+resB.futureLosPoints, "pt")}
                            {renderComparisonRow("職能ポイント", resA.initialRankPointsInput+resA.futureRankPoints, resB.initialRankPointsInput+resB.futureRankPoints, "pt")}
                            {renderComparisonRow("考課ポイント", resA.initialEvalPointsInput+resA.futureEvalPoints, resB.initialEvalPointsInput+resB.futureEvalPoints, "pt")}
                            {hasAdjustmentPoints && (
                                <tr className="hover:bg-slate-50 transition bg-amber-50/50">
                                    <td className="p-4 font-bold text-amber-700 text-base border-r border-slate-100">調整ポイント</td>
                                    <td className="p-4 text-right font-mono text-amber-700 text-lg bg-amber-100/20">
                                        {(resA.totalPointsAtRetirement - (resA.initialLosPointsInput+resA.futureLosPoints + resA.initialRankPointsInput+resA.futureRankPoints + resA.initialEvalPointsInput+resA.futureEvalPoints)).toFixed(2)}pt
                                    </td>
                                    <td className="p-4 text-right font-mono text-slate-400 text-lg border-l border-slate-100">-</td>
                                    <td className="p-4 text-right font-mono text-base font-bold text-amber-600 border-l border-slate-100">
                                        (差額充当)
                                    </td>
                                </tr>
                            )}
                            
                            {/* Financials */}
                            <tr className="bg-slate-50/50"><td colSpan={4} className="p-3 text-sm font-bold text-slate-400 uppercase pl-4">金額試算</td></tr>
                            {renderComparisonRow("退職金総ポイント", resA.totalPointsAtRetirement, resB.totalPointsAtRetirement, "pt")}
                            {renderComparisonRow("ポイント単価", resA.unitPrice, resB.unitPrice, "円", true)}
                            <tr className="bg-slate-50 font-bold border-t border-b border-slate-200">
                                <td className="p-5 text-slate-800 text-lg">退職金支給額</td>
                                <td className="p-5 text-right text-indigo-700 bg-indigo-50/20 text-2xl">¥{resA.retirementAllowance.toLocaleString()}</td>
                                <td className="p-5 text-right text-emerald-700 bg-emerald-50/20 text-2xl border-l border-slate-200">¥{resB.retirementAllowance.toLocaleString()}</td>
                                <td className={`p-5 text-right text-xl border-l border-slate-200 ${(resA.retirementAllowance - resB.retirementAllowance) > 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                    {(resA.retirementAllowance - resB.retirementAllowance) > 0 ? '+' : ''}
                                    ¥{(resA.retirementAllowance - resB.retirementAllowance).toLocaleString()}
                                </td>
                            </tr>
                            {renderComparisonRow("2026/3末 引当残高", resA.reserve2026, resB.reserve2026, "円", true)}
                        </tbody>
                    </table>
                </div>

                {/* Projection of A vs B (Difference focused) */}
                <div>
                    <h4 className="font-bold text-slate-700 mb-3 text-base">年度別 引当金繰入額シミュレーション比較</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto scrollbar-thin">
                        <table className="w-full text-base text-center">
                            <thead className="bg-slate-100 text-sm font-bold text-slate-500 sticky top-0">
                                <tr>
                                    <th className="p-3">年度</th>
                                    <th className="p-3">年齢</th>
                                    <th className="p-3 bg-indigo-50 text-indigo-700">A案(変更) 繰入額</th>
                                    {hasAdjustmentPoints && <th className="p-3 bg-amber-50 text-amber-700 text-xs">内)調整Pt</th>}
                                    <th className="p-3 bg-emerald-50 text-emerald-700">B案(現行) 繰入額</th>
                                    <th className="p-3">差額 (A-B)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {resB.yearlyDetails.filter(d => d.year <= 2045).map((dB, i) => {
                                    const dA = resA.yearlyDetails.find(a => a.year === dB.year);
                                    const amtA = dA ? dA.amountInc : 0;
                                    const adjPt = dA ? dA.adjustmentPtInc : 0;
                                    const diff = amtA - dB.amountInc; // A - B
                                    return (
                                        <tr key={dB.year}>
                                            <td className="p-3 text-slate-600 font-medium">{dB.year}</td>
                                            <td className="p-3 text-slate-500">{dB.age}</td>
                                            <td className="p-3 font-mono text-indigo-700 bg-indigo-50/30">¥{amtA.toLocaleString()}</td>
                                            {hasAdjustmentPoints && (
                                                <td className="p-3 font-mono text-amber-700 bg-amber-50/30 text-sm">
                                                    {adjPt > 0 ? `+${adjPt}pt` : '-'}
                                                </td>
                                            )}
                                            <td className="p-3 font-mono font-bold text-emerald-700 bg-emerald-50/30">¥{dB.amountInc.toLocaleString()}</td>
                                            <td className={`p-3 font-mono text-sm font-bold ${diff > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                                {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
