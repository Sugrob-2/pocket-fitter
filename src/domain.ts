import { z } from 'zod';

export type EvidenceSource = 'self-reported' | 'measured' | 'calculated' | 'unknown';
export interface PlayerProfile {
  handedness: 'right' | 'left' | 'unknown';
  experience: string; handicap: string; typicalCarry: string; carryClub: string;
  miss: string; consistency: string; trajectory: string; priority: string;
  budget: string; feel: string; height: string; wristToFloor: string;
}
export interface Shot {
  shotId: string; club: string; carryM: number | null; totalM: number | null;
  clubSpeedMph: number | null; ballSpeedMph: number | null; smash: number | null;
  heightM: number | null; spinRpm: number | null; launchDeg: number | null;
  landingDeg: number | null; attackDeg: number | null; lateralM: number | null;
  source: string; provenance: EvidenceSource;
}
export interface Session { schemaVersion: '1.0'; createdAt: string; profile: PlayerProfile; shots: Shot[]; }
export interface CatalogEntry {
  brand: string; model: string; generation: string; category: 'iron'; positioning: string;
  sevenIronLoft: number | null; setSnapshot: string; availability: 'unknown';
  sourceUrl: string | null; checkedDate: string; demo: true;
}
export interface Evidence { label: string; status: 'known' | 'partial' | 'unknown'; reason: string; }
export interface Recommendation {
  candidate: CatalogEntry; rationale: string; tradeoff: string; nextTest: string;
  ruleIds: string[]; evidence: Evidence[];
}

export const ShotRowSchema = z.object({
  shot_id: z.string().optional(), club: z.string().optional(),
  club_speed_mph: z.number().nullable().optional(), ball_speed_mph: z.number().nullable().optional(),
  smash_factor: z.number().nullable().optional(), carry_m: z.number().nullable().optional(),
  total_m: z.number().nullable().optional(), height_m: z.number().nullable().optional(),
  spin_rpm: z.number().nullable().optional(), launch_deg: z.number().nullable().optional(),
  landing_deg: z.number().nullable().optional(), attack_deg: z.number().nullable().optional(),
  lateral_m: z.number().nullable().optional()
});

export const catalog: CatalogEntry[] = [
  {brand:'Takomo',model:'101 MKII',generation:'MKII',category:'iron',positioning:'Game improvement',sevenIronLoft:29,setSnapshot:'5–GW',availability:'unknown',sourceUrl:null,checkedDate:'2026-11-07',demo:true},
  {brand:'Takomo',model:'201 MKII',generation:'MKII',category:'iron',positioning:'Players distance',sevenIronLoft:31,setSnapshot:'4–PW',availability:'unknown',sourceUrl:null,checkedDate:'2026-11-07',demo:true},
  {brand:'Takomo',model:'201T MKII',generation:'MKII',category:'iron',positioning:'Modern players',sevenIronLoft:33,setSnapshot:'4–PW',availability:'unknown',sourceUrl:null,checkedDate:'2026-11-07',demo:true}
];

const defaults: PlayerProfile = {handedness:'unknown',experience:'',handicap:'',typicalCarry:'',carryClub:'',miss:'',consistency:'',trajectory:'',priority:'',budget:'',feel:'',height:'',wristToFloor:''};
export function emptyProfile(): PlayerProfile { return {...defaults}; }
export function stats(values: number[]) {
  const a=[...values].sort((x,y)=>x-y), n=a.length;
  if (!n) return null;
  const mean=a.reduce((s,x)=>s+x,0)/n, median=n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;
  const variance=a.reduce((s,x)=>s+(x-mean)**2,0)/n;
  return {count:n,mean,median,min:a[0],max:a[n-1],range:a[n-1]-a[0],populationSd:Math.sqrt(variance),sampleSd:n>1?Math.sqrt(variance*n/(n-1)):null};
}
export function parseCSV(text: string): Shot[] {
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines.length<2) throw new Error('CSV needs a header row and at least one shot.');
  const delimiter=lines[0].includes(';')?';':',';
  const headers=lines[0].split(delimiter).map(s=>s.trim().toLowerCase());
  const numeric=['club_speed_mph','ball_speed_mph','smash_factor','carry_m','total_m','height_m','spin_rpm','launch_deg','landing_deg','attack_deg','lateral_m'];
  const mapped=numeric.filter(h=>headers.includes(h));
  if(!mapped.some(h=>['carry_m'].includes(h))) throw new Error('Could not find carry_m. Use the sample CSV header names shown in the app.');
  return lines.slice(1).filter(l=>l.trim()).map((line,i)=>{
    const cells=line.split(delimiter).map(s=>s.trim()), row:Record<string,string>={}; headers.forEach((h,j)=>row[h]=cells[j]??'');
    const num=(key:string):number|null=>{const s=row[key]; if(!s)return null; const normalized=delimiter===';'?s.replace(',','.'):s; const v=Number(normalized); if(!Number.isFinite(v)) throw new Error(`Row ${i+2}: “${key}” is not a valid number (“${s}”).`); return v;};
    const carry=num('carry_m'); if(carry===null) throw new Error(`Row ${i+2}: carry_m is required.`);
    return {shotId:row.shot_id||String(i+1),club:row.club||'6i',carryM:carry,totalM:num('total_m'),clubSpeedMph:num('club_speed_mph'),ballSpeedMph:num('ball_speed_mph'),smash:num('smash_factor'),heightM:num('height_m'),spinRpm:num('spin_rpm'),launchDeg:num('launch_deg'),landingDeg:num('landing_deg'),attackDeg:num('attack_deg'),lateralM:num('lateral_m'),source:'CSV import',provenance:'measured'};
  });
}
export function recommend(profile: PlayerProfile, shots: Shot[]): Recommendation[] {
  const p=profile.priority.toLowerCase(), consistency=profile.consistency.toLowerCase();
  const order=p.includes('forgiv')||p.includes('consisten')||consistency.includes('inconsistent')?[0,1,2]:p.includes('control')||p.includes('feel')?[2,1,0]:[1,0,2];
  return order.map((idx)=>({candidate:catalog[idx],rationale:`${catalog[idx].positioning} is a sensible comparison point${shots.length?` alongside ${shots.length} imported shot${shots.length===1?'':'s'}`:''}. This is a provisional category-level heuristic, not a fitted result.`,tradeoff:'The model positioning is manufacturer context, not proof of better distance, dispersion, or suitability.',nextTest:'Hit this model and one alternative with the same ball and conditions; compare carry consistency, start line, peak height and stopping.',ruleIds:['CATALOG_POSITIONING_V1','USER_PRIORITY_V1'],evidence:[{label:'Head category',status:'partial',reason:'Demo catalog positioning only; personal performance is not validated.'},{label:'Shaft',status:'unknown',reason:'No shaft recommendation: speed or handicap alone is insufficient.'},{label:'Length / lie',status:'unknown',reason:'Static measurements are not a dynamic fitting.'},{label:'Grip',status:'unknown',reason:'No comfort/hand-fit evidence supplied.'}]}));
}
export function toSession(profile:PlayerProfile,shots:Shot[]):Session{return {schemaVersion:'1.0',createdAt:new Date().toISOString(),profile,shots};}
export function sampleShots(): Shot[] {
  const rows=[[158.5,171.0],[165.4,188.0],[159.7,167.4],[162.9,176.8],[159.4,168.8],[153.3,162.8],[166.4,180.8],[139.9,166.7],[173.4,184.3]];
  return rows.map((r,i)=>({shotId:String(i+1),club:'6i',carryM:r[0],totalM:r[1],clubSpeedMph:null,ballSpeedMph:null,smash:null,heightM:null,spinRpm:null,launchDeg:null,landingDeg:null,attackDeg:null,lateralM:null,source:'Appendix A reference fixture',provenance:'measured'}));
}
