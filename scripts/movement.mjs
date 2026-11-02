// Shared "has this bill moved beyond introduction?" test, used by the data
// scripts. The app has the same logic in app.js (movement()).
const MOVED_RE = /third reading|floor|conference|concur|enrolled|passed|final passage|adopted|calendar|second reading|placed on|ordered engrossed|eligible|reported|do pass|recommend|favorabl|amend|substitute|voted out|committee (report|substitute)/i;
const DEAD_RE = /died|lost|failed|withdrawn|tabled indefinitely|postponed indefinitely/i;
export const moved = (b) => b.status >= 2 && b.status <= 4 || (b.calendar?.length > 0) || (!DEAD_RE.test(b.last_action) && MOVED_RE.test(b.last_action));
// What gets full text, AI analysis and sponsor research: every moved sports-betting
// bill, and AI bills that have passed at least one chamber (the AI set is ~3x larger).
export const inScope = (b) => moved(b) && (b.topics.includes("sports") || (b.status >= 2 && b.status <= 4));
