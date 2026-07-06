# TFST — The Famous Soccer Tournament for American's

World Cup 2026 news, translated into American. Live at https://ryanlhance.github.io/tfst/

Static site: `index.html` + `styles.css` + `app.js` (rendering, live scores, live play-by-play) and `articles.js` (all story content — the only file the scheduled refresh should normally touch).

## Scheduled refresh workflow (for the refresh agent)

Runs at 8:30 AM, 2:30 PM, 7:45 PM, 12:15 AM ET through July 20, 2026.

1. Pull latest ESPN World Cup headlines: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=50`
2. Compare Story/HeadlineNews headlines against articles already in `articles.js`. If nothing new AND no game finished since `refreshedAt`, just update `refreshedAt` and push.
3. For each game finished since the last refresh: get its event ID from the scoreboard API, fetch the ESPN live-blog/gamecast page, and translate the human-written full-time wrap plus key moments into a recap story.
4. Fetch full bodies of the top new stories (cap ~5 per run) via their ESPN URLs and translate.
5. Translation rules — non-negotiable:
   - Keep the original author's tone and structure. Quotes stay EXACTLY verbatim.
   - American English: past tense, singular team verbs, no coach-name-as-team constructions ("Murat Yakin's side" → "Switzerland").
   - Explain jargon inline with decoder spans: `<span class="t" data-d="plain-English explanation">term</span>` — don't dumb the text down, decode it.
   - Only include an `original` paragraph array when the text is verbatim from ESPN; otherwise omit (no soccer-speak toggle for that story).
   - Every story keeps `link` to the ESPN original.
6. Order: catch-up/recaps first, then newest stories. Keep ~8 stories max; drop the oldest. Update `updated` (display date) and `refreshedAt` (ISO, ET offset).
7. Commit and push to `main` — GitHub Pages deploys automatically.

Scores and play-by-play are fetched live client-side; the refresh only maintains `articles.js`.
