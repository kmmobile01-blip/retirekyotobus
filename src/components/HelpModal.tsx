import React, { useState } from 'react';
import { X, BookOpen, HelpCircle, FileText, CheckCircle, Sliders, BarChart3, ArrowRight, MousePointerClick, RefreshCw, Lock, Sparkles, Database, Printer, FileDown, Calculator, Target, Users } from 'lucide-react';

interface HelpModalProps {
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'usage' | 'features' | 'ai' | 'manual' | 'faq'>('usage');

    const tabs = [
        { id: 'usage', label: '基本的な使い方', icon: MousePointerClick },
        { id: 'features', label: '詳細機能・設定', icon: Sliders },
        { id: 'ai', label: 'AI分析レポート', icon: Sparkles },
        { id: 'manual', label: '計算ロジック', icon: Calculator },
        { id: 'faq', label: 'よくある質問', icon: HelpCircle },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-white">
                        <div className="p-2 bg-indigo-500 rounded-lg">
                            <BookOpen className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold">システム使用マニュアル (Ver 2.0)</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 sm:px-6 hide-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 sm:px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'text-indigo-600' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white">
                    {activeTab === 'usage' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                            <section>
                                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-200 pb-3">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    シミュレーションの基本フロー
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative overflow-hidden">
                                        <div className="absolute -right-4 -top-4 text-slate-100">
                                            <Users className="w-24 h-24" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold mb-4 text-lg">1</div>
                                            <h4 className="font-bold text-lg mb-2 text-slate-800">社員データの準備・読込</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                「社員データの読込」からCSV形式で社員データをアップロードします。社員番号、氏名、生年月日、入社年月日、現在の等級、現在の保有ポイントなどの情報が必要です。まずは「サンプルデータ」で動作を確認することをお勧めします。
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative overflow-hidden">
                                        <div className="absolute -right-4 -top-4 text-slate-100">
                                            <Sliders className="w-24 h-24" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold mb-4 text-lg">2</div>
                                            <h4 className="font-bold text-lg mb-2 text-slate-800">シミュレーション条件の設定</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                現行制度（A案）と改定案（B案）の条件を設定します。定年年齢、ポイント付与の上限年数、毎年の標準評価（昇給ペース）などを設定し、両案の前提条件を定義します。
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative overflow-hidden">
                                        <div className="absolute -right-4 -top-4 text-slate-100">
                                            <Database className="w-24 h-24" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold mb-4 text-lg">3</div>
                                            <h4 className="font-bold text-lg mb-2 text-slate-800">マスタデータの設定</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                「マスタ設定」タブから、職能ポイント表、勤続ポイント表、支給率係数表を設定します。CSVでの一括ダウンロード・アップロードに対応しており、Excel等で編集したものを簡単に取り込めます。
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative overflow-hidden">
                                        <div className="absolute -right-4 -top-4 text-slate-100">
                                            <BarChart3 className="w-24 h-24" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold mb-4 text-lg">4</div>
                                            <h4 className="font-bold text-lg mb-2 text-slate-800">実行と結果の分析</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                「シミュレーション実行」をクリックすると、各社員の将来の退職金推移が計算されます。グラフや一覧表でA案・B案のコスト差を比較し、必要に応じて「AI分析レポート」で改善案を作成します。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'features' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                            <section>
                                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-200 pb-3">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    高度なシミュレーション設定
                                </h3>
                                <div className="space-y-6">
                                    <div className="flex gap-4 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl h-fit">
                                            <Lock className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-800 mb-2">移行措置（既得権保護）</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-2">
                                                制度改定日時点での旧制度（A案）での退職金算出額を最低保障する機能です。改定による不利益変更を防ぐための一般的な手法です。
                                            </p>
                                            <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 border border-slate-100">
                                                <strong>動作:</strong> 実際の退職時のB案算出額と、移行日時点のA案算出額を比較し、高い方を支給額とします。
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl h-fit">
                                            <CheckCircle className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-800 mb-2">調整措置（B案保障）</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-2">
                                                定年延長時などに、旧定年年齢（例: 60歳）時点でのB案の退職金額を、最終的な退職時（例: 65歳）まで保障する機能です。再雇用期間中の自己都合退職による減額を防ぎます。
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                                        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl h-fit">
                                            <RefreshCw className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-800 mb-2">新制度への完全移行（洗い替え）</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-2">
                                                過去のポイント蓄積も含めて、すべて新制度（B案）の計算ロジックで再計算する機能です。過去の既得権をリセットして完全な新制度へ移行する場合のシミュレーションに使用します。
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl h-fit">
                                            <ArrowRight className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-800 mb-2">将来マスタ（Future）の適用</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-2">
                                                特定のタイミングから適用される新しいポイント表や係数表を設定できます。段階的な制度移行や、数年後に予定されているベースアップなどをシミュレーションに組み込むことが可能です。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'ai' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                            <section className="bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-3xl border border-indigo-100">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md">
                                        <Sparkles className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-indigo-900">AI分析レポート機能</h3>
                                </div>
                                <p className="text-indigo-800 leading-relaxed mb-8 text-lg">
                                    Google Gemini APIを活用し、シミュレーション結果の財務インパクト評価や、目標コストに合わせた制度設計の改善案を自動生成する強力な機能です。
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-50">
                                        <Target className="w-8 h-8 text-indigo-500 mb-4" />
                                        <h4 className="font-bold text-slate-800 mb-2">コスト削減目標の逆算</h4>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            「現行の引当増加額に対して10%〜20%削減したい」といった目標を設定すると、AIがその目標に収まるような新しいポイント表や係数表の数値を逆算して提案します。
                                        </p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-50">
                                        <Sliders className="w-8 h-8 text-indigo-500 mb-4" />
                                        <h4 className="font-bold text-slate-800 mb-2">柔軟な制約条件</h4>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            「定年年齢は65歳に固定」「支給率係数は変更しない」「若年層のポイントは手厚くする」など、AIが改善案を作成する際のルール（制約）を自然言語やチェックボックスで細かく指定できます。
                                        </p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-50">
                                        <MousePointerClick className="w-8 h-8 text-indigo-500 mb-4" />
                                        <h4 className="font-bold text-slate-800 mb-2">提案のワンクリック適用</h4>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            AIが提案した新しいマスタデータ（ポイント表など）は、「提案をB案に適用する」ボタンを押すだけで即座にシミュレーションに反映され、再計算が行われます。
                                        </p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-50">
                                        <FileText className="w-8 h-8 text-indigo-500 mb-4" />
                                        <h4 className="font-bold text-slate-800 mb-2">プロフェッショナルなレポート</h4>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            生成された分析結果と改善案は、そのまま経営陣への報告書として使えるレベルのフォーマットで出力されます。PDFでの保存にも対応しています。
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'manual' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                            <section>
                                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-200 pb-3">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    退職金計算ロジック
                                </h3>
                                
                                <div className="bg-slate-800 text-white p-6 rounded-2xl mb-8 shadow-lg">
                                    <h4 className="text-slate-400 text-sm font-bold mb-2 uppercase tracking-wider">基本算定式</h4>
                                    <div className="text-xl md:text-2xl font-mono bg-slate-900 p-4 rounded-xl border border-slate-700">
                                        (職能Pt累計 + 勤続Pt累計) × Pt単価 × 退職事由係数
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="border border-slate-200 rounded-2xl p-6">
                                        <h4 className="font-bold text-lg text-slate-800 mb-3 flex items-center gap-2">
                                            <Database className="w-5 h-5 text-indigo-500" />
                                            ポイントの蓄積メカニズム
                                        </h4>
                                        <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                            毎年の「標準評価」に基づき、マスタデータで定義されたポイントが毎年加算されます。シミュレーションでは、設定された「毎年の標準評価（昇給ペース）」を用いて将来のポイント蓄積を予測計算します。
                                        </p>
                                        <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 border border-slate-100">
                                            <strong>上限年数（Cutoff Years）:</strong> 勤続年数や等級滞留年数が設定した上限に達した場合、それ以降のポイント加算を自動的にストップします。
                                        </div>
                                    </div>

                                    <div className="border border-slate-200 rounded-2xl p-6">
                                        <h4 className="font-bold text-lg text-slate-800 mb-3 flex items-center gap-2">
                                            <RefreshCw className="w-5 h-5 text-indigo-500" />
                                            端数処理の厳密性
                                        </h4>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            ポイントの計算過程、および最終的な支給金額の計算における端数（切り上げ、切り捨て、四捨五入）は、システム内部で厳密に処理されます。これにより、実際の給与計算システムと同等の精度でシミュレーションが可能です。
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'faq' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            {[
                                { 
                                    q: 'CSVのフォーマットが分かりません', 
                                    a: '「マスタ設定」や「社員データ」の画面から現在の設定をCSVとしてダウンロードできます。そのヘッダー形式に合わせてデータを作成し、アップロードしてください。' 
                                },
                                { 
                                    q: '定年延長のコストを正確に把握したい', 
                                    a: 'B案で定年年齢を65歳に設定し、60歳以降のポイント付与を停止（上限年数で調整）したり、再雇用時の支給率係数を調整することで、総人件費と退職金のバランスをシミュレーション可能です。' 
                                },
                                { 
                                    q: 'AI分析でエラーが出ます', 
                                    a: 'AI分析にはGemini APIを使用しています。APIの利用制限（クオータ）に達した場合や、一時的なネットワークエラーの場合は、少し時間をおいてから再度お試しください。' 
                                },
                                { 
                                    q: '計算結果を保存・共有したい', 
                                    a: '画面上部の「PDF出力」または「Excel出力」機能をご利用ください。グラフや設定条件も含めた状態でレポートとして保存可能です。' 
                                },
                                { 
                                    q: '特定の社員だけのシミュレーション結果を見たい', 
                                    a: '画面上部の検索バーに社員番号や氏名を入力することで、特定の社員の推移グラフと詳細データを絞り込んで確認することができます。' 
                                }
                            ].map((item, i) => (
                                <div key={i} className="border border-slate-200 rounded-2xl p-6 hover:bg-slate-50 transition-colors shadow-sm">
                                    <div className="font-bold text-slate-800 mb-3 flex items-start gap-3 text-lg">
                                        <span className="text-indigo-500 text-xl">Q.</span>
                                        {item.q}
                                    </div>
                                    <div className="text-slate-600 pl-8 leading-relaxed">
                                        {item.a}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-6 sm:px-8 py-4 border-t border-slate-200 flex justify-between items-center">
                    <p className="text-xs text-slate-400 font-bold tracking-wider">
                        RETIREMENT SIMULATION SYSTEM v2.0
                    </p>
                    <button 
                        onClick={onClose}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-xl active:scale-95"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};

