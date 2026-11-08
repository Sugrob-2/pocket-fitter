import { useEffect, useRef, useState } from 'react';

export interface ReviewPayload {
  locale: 'fi' | 'en';
  profile: { heightM: number | null; wristToFloorM: number | null; speedMps: number | null; carryM: number | null; tempo: string; priorities: string[] };
  recommendation: { head: string; shaft: string | null; flex: string | null; lengthAdjustmentM: number | null; lieDeg: number | null; grip: string | null; purchase: string | null; reasons: string[] };
  quality: { missing: string[]; warnings: string[] };
}
interface ReviewResponse { summary: string; concerns: string[]; nextSteps: string[]; provider: string; model: string }
export default function ReviewPanel({ payload }: { payload: ReviewPayload }) {
  const fi = payload.locale === 'fi', label = (f: string,e: string) => fi ? f : e;
  const [configured, setConfigured] = useState(false), [checked, setChecked] = useState(false);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<ReviewResponse | null>(null), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const identity = JSON.stringify(payload);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/review/status', { signal: abort.signal }).then(async r => {
      if (!r.ok) throw new Error('unavailable');
      const status = await r.json(); setConfigured(status.configured === true); setChecked(true);
    }).catch(() => { if (!abort.signal.aborted) { setConfigured(false); setChecked(true); } });
    return () => abort.abort();
  }, []);
  useEffect(() => { controller.current?.abort(); setResponse(null); setError(''); setBusy(false); setConsent(false); return () => controller.current?.abort(); }, [identity]);
  async function requestReview() {
    if (!consent || !configured || busy) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setResponse(null);
    const timer = window.setTimeout(() => abort.abort('timeout'), 50000);
    try {
      const result = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: identity, signal: abort.signal });
      const data: unknown = await result.json();
      if (!result.ok || !data || typeof data !== 'object') throw new Error('review_failed');
      const review = data as Partial<ReviewResponse>;
      if (typeof review.summary !== 'string' || !Array.isArray(review.concerns) || !review.concerns.every(item => typeof item === 'string') || !Array.isArray(review.nextSteps) || !review.nextSteps.every(item => typeof item === 'string')) throw new Error('invalid_response');
      if (!abort.signal.aborted) setResponse(review as ReviewResponse);
    } catch {
      if (!abort.signal.aborted || abort.signal.reason === 'timeout') setError(label('Arviointipalvelu ei vastannut kelvollisesti. Paikallinen suositus on edelleen käytettävissä.', 'The review service did not return a valid response. Your local recommendation remains available.'));
    } finally { window.clearTimeout(timer); if (controller.current === abort) setBusy(false); }
  }
  return <section className="data-card review-panel">
    <div className="eyebrow">{label('TOINEN NÄKÖKULMA', 'A SECOND PERSPECTIVE')}</div>
    <h3>{label('Pyydä tekoälyltä perustelujen tarkistus', 'Ask AI to review the reasoning')}</h3>
    <p>{label('Arvioija etsii ristiriitoja, puuttuvia tietoja ja hyödyllisiä jatkokysymyksiä. Se ei mittaa sovituksen todellista tarkkuutta eikä muuta kokoonpanoa automaattisesti.', 'The reviewer looks for inconsistencies, missing evidence and useful follow-up questions. It does not measure real fitting accuracy or automatically change your build.')}</p>
    {!checked ? <p role="status">{label('Tarkistetaan arviointipalvelua…', 'Checking review service…')}</p> : !configured ? <p className="intro-note" role="status">{label('Ulkoinen arvioija ei ole vielä käytössä. Palveluyhteys on määritettävä ennen käyttöä; sovitus ja paikalliset tarkistukset toimivat ilman sitä.', 'The external reviewer is not configured yet. A service connection is needed first; fitting and local checks work without it.')}</p> : <>
      <label className="review-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{label('Sallin mittayhteenvedon, toiveiden ja valitun kokoonpanon lähettämisen ulkoiselle arvioijalle tätä tarkistusta varten. Videota tai kuvia ei lähetetä.', 'Allow my measurement summary, preferences and selected build to be sent to the external reviewer for this check. No video or images are sent.')}</span></label>
      <button className="button primary" disabled={!consent || busy} onClick={() => void requestReview()}>{busy ? label('Arvioidaan…','Reviewing…') : label('Tarkista perustelut','Review reasoning')}</button>
    </>}
    {error && <p role="alert" className="validation-message">{error}</p>}
    {response && <div className="review-response" role="status"><p>{response.summary}</p>{response.concerns.length > 0 && <><h4>{label('Huomioitavaa','Considerations')}</h4><ul>{response.concerns.map((item,i) => <li key={i}>{item}</li>)}</ul></>}{response.nextSteps.length > 0 && <><h4>{label('Seuraavaksi','Next steps')}</h4><ul>{response.nextSteps.map((item,i) => <li key={i}>{item}</li>)}</ul></>}<p className="subtle">{label('Kielimallin arvio, ei validoitu sovitustulos.','Language-model review, not a validated fitting result.')} {response.model}</p></div>}
  </section>;
}
