export type Units = 'metric' | 'imperial';
export const INCH_M = .0254;
export const YARD_M = .9144;
export const MPH_MPS = .44704;
export const mphToMps = (mph: number) => mph * MPH_MPS;
export const yardsToM = (yards: number) => yards * YARD_M;
export const inchesToM = (inches: number) => inches * INCH_M;
export const displayDistance = (m: number, units: Units, digits = 1) => `${(units === 'metric' ? m : m / YARD_M).toFixed(digits)} ${units === 'metric' ? 'm' : 'yd'}`;
export const displayAdjustment = (m: number, units: Units) => `${m > 0 ? '+' : ''}${Number((units === 'metric' ? m * 1000 : m / INCH_M).toFixed(2))} ${units === 'metric' ? 'mm' : 'in'}`;
