export interface DemoCategory {
    label: string;
    labelBn: string;
    subjects: Record<string, string[]>;
}
export declare const demoTaxonomy: Record<string, DemoCategory>;
/** Strip anything but letters (incl. Bangla), digits, spaces and basic punctuation; cap length. */
export declare function sanitizeFreeText(input: string, maxLen: number): string;
export declare function resolveCategory(categoryKey: string): DemoCategory | null;
//# sourceMappingURL=demoTaxonomy.d.ts.map