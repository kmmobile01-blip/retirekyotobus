
export interface TableRowT1 { 
    y: number; 
    los1: number; 
    r1_1: number; 
    r2: number; 
    r3: number; 
    r4: number; 
    r5: number; 
    r6: number; 
}

export interface TableRowT2 { 
    y: number; 
    los: number; 
    r1: number; 
    r2: number; 
    r3: number; 
    r4: number; 
    r5: number; 
    r6: number; 
}

export interface CoefRow { 
    years: number; 
    coef: number; 
}

export interface CoefSettings { 
    type1: CoefRow[]; 
    type2: CoefRow[]; 
    type3: CoefRow[]; 
    type4: CoefRow[]; 
}

export interface YearlyDetail { 
    year: number; 
    age: number; 
    losPtInc: number; 
    rankPtInc: number; 
    evalPtInc: number; 
    adjustmentPtInc: number; // Adjustment points
    amountInc: number; 
    totalPt: number;
    coef: number;
}

export interface CalculationResult {
    employeeId: string; 
    name: string; 
    joinDate: Date; 
    calcStartDate?: Date; 
    birthDate: Date; 
    retirementDate: Date;
    retirementFiscalYear: number; // Added: 計算上の退職年度
    grade: string; 
    typeName: string; 
    typeKey: 'type1' | 'type2' | 'type3' | 'type4'; 
    yearsOfService: number;
    serviceDuration: { years: number, months: number }; 
    initialLosPointsInput: number; 
    futureLosPoints: number;
    initialRankPointsInput: number; 
    futureRankPoints: number;
    initialEvalPointsInput: number; 
    futureEvalPoints: number;
    totalPointsAtRetirement: number; 
    retirementAllowance: number; 
    reserve2026: number;
    yearlyDetails: YearlyDetail[]; 
    unitPrice: number;
}

export interface EmployeeInputRow { 
    [key: string]: string | number | undefined; 
}

export interface CutoffYears { 
    type1: number; 
    type2: number; 
    type3: number; 
    type4?: number; 
}

export interface RetirementAgeSettings {
    type1: number;
    type2: number;
    type3: number;
    type4: number;
}

export interface FractionConfig { 
    los: string; 
    rank: string; 
    eval: string; 
    losDateMode: string; 
    rankDateMode: string; 
    evalDateMode: string; 
}

export interface TransitionConfig {
    enabled: boolean;
    date: Date;
}

export interface AdjustmentConfig {
    enabled: boolean;
    retirementAges?: RetirementAgeSettings;
    targetTypes?: { // 各制度区分への適用可否
        type1: boolean;
        type2: boolean;
        type3: boolean;
        type4: boolean;
    };
}

// 新制度に統一モードの設定
export interface UnifyNewSystemConfig {
    enabled: boolean;
    retirementAges?: RetirementAgeSettings;
    targetTypes?: { // 各制度区分への適用可否
        type1: boolean;
        type2: boolean;
        type3: boolean;
        type4: boolean;
    };
}

// 比較シミュレーション用の設定セット (マスタデータ含む)
export interface SimulationConfig {
    label: string;
    unitPrice: number;
    
    // 現行パラメータ (Transition前)
    defaultYearlyEval: number;
    retirementAges: RetirementAgeSettings;
    cutoffYears: CutoffYears;

    // 将来パラメータ (Transition後)
    defaultYearlyEvalFuture: number;
    retirementAgesFuture: RetirementAgeSettings;
    cutoffYearsFuture: CutoffYears;

    // 制度移行設定
    transitionConfig: TransitionConfig;
    
    // 調整ポイント設定 (Pattern A only)
    adjustmentConfig?: AdjustmentConfig;

    // 新制度に統一モード (Pattern A only)
    unifyNewSystemConfig?: UnifyNewSystemConfig;

    // マスタデータ
    masterData1_1: TableRowT1[];
    masterData1_2: TableRowT1[];
    masterData1_3: TableRowT1[];
    masterData2: TableRowT2[]; // 現行新制度（または移行前）
    masterDataFuture: {        // 移行後用新マスタ（制度区分別）
        type1: TableRowT2[];
        type2: TableRowT2[];
        type3: TableRowT2[];
        type4: TableRowT2[];
    }; 
    coefSettings: CoefSettings; // 現行支給率
    coefSettingsFuture: CoefSettings; // 移行後支給率
}

// グラフ用集計データ
export interface AggregatedYearlyData {
    year: number;
    A: { type1: number; type2: number; type3: number; type4: number; total: number };
    B: { type1: number; type2: number; type3: number; type4: number; total: number };
    // 残高 (Stock) - 特に2025年度データに2026/3末残高を格納するために使用
    stockA: { type1: number; type2: number; type3: number; type4: number; total: number };
    stockB: { type1: number; type2: number; type3: number; type4: number; total: number };
    // 退職金支給額（キャッシュアウト）の集計
    payoutA: { type1: number; type2: number; type3: number; type4: number; total: number };
    payoutB: { type1: number; type2: number; type3: number; type4: number; total: number };
    counts: { type1: number; type2: number; type3: number; type4: number; total: number };
}
