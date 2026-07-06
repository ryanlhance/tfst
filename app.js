/* TFST — renders translated stories and pulls live scores from ESPN's public feed. */

(function () {
  const D = window.SITE_DATA;

  /* ---------- Stories ---------- */

  const storiesEl = document.getElementById("stories");

  D.articles.forEach((a) => {
    const card = document.createElement("article");
    card.className = "story";
    card.innerHTML = `
      <div class="kicker">${a.kicker}</div>
      <h3>${a.headline}</h3>
      <div class="byline">${a.byline} · ${D.updated}</div>
      <div class="original-note">You're reading ESPN's original soccer-speak, lightly trimmed. Good luck.</div>
      <div class="body"></div>
      <div class="story-actions">
        ${a.original ? `<button class="btn toggle-orig">Read it in soccer-speak 🇬🇧</button>` : ""}
        <a class="btn" href="${a.link}" target="_blank" rel="noopener">Original on ESPN ↗</a>
      </div>`;

    const bodyEl = card.querySelector(".body");
    const renderBody = (paras) => {
      bodyEl.innerHTML = paras
        .map((p) => (p.trimStart().startsWith("<ul") ? p : `<p>${p}</p>`))
        .join("");
    };
    renderBody(a.body);

    const toggle = card.querySelector(".toggle-orig");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const showingOriginal = card.classList.toggle("original-mode");
        renderBody(showingOriginal ? a.original : a.body);
        toggle.textContent = showingOriginal ? "Back to American 🇺🇸" : "Read it in soccer-speak 🇬🇧";
      });
    }

    storiesEl.appendChild(card);
  });

  // Tap a dotted term to expand its definition inline.
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".t");
    if (!t || t.classList.contains("demo")) return;
    const next = t.nextElementSibling;
    if (next && next.classList.contains("tdef")) {
      next.remove();
      return;
    }
    const def = document.createElement("span");
    def.className = "tdef";
    def.innerHTML = `<b>Decoder:</b> ${t.dataset.d}`;
    t.after(def);
  });

  /* ---------- Decoder / glossary ---------- */

  const gl = document.getElementById("glossary");
  gl.innerHTML = D.glossary
    .map(([term, def]) => `<dt>${term}</dt><dd>${def}</dd>`)
    .join("");

  document.getElementById("foot-updated").textContent = D.updated;

  /* ---------- Refresh stamp ---------- */

  // Story refreshes run at these ET times via a scheduled agent.
  const REFRESH_SLOTS = [[8, 30], [14, 30], [19, 45], [0, 15]];

  (function stamp() {
    const el = document.getElementById("refresh-stamp");
    const fmtET = (d) =>
      d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short", hour: "numeric", minute: "2-digit"
      });
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false
    }).formatToParts(new Date());
    const h = +parts.find((p) => p.type === "hour").value % 24;
    const m = +parts.find((p) => p.type === "minute").value;
    const now = h * 60 + m;
    const next = REFRESH_SLOTS.map(([sh, sm]) => sh * 60 + sm)
      .sort((a, b) => a - b)
      .find((t) => t > now);
    const nextLabel = (() => {
      const t = next ?? REFRESH_SLOTS.map(([sh, sm]) => sh * 60 + sm).sort((a, b) => a - b)[0];
      const hh = Math.floor(t / 60), mm = t % 60;
      const h12 = ((hh + 11) % 12) + 1;
      return `${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
    })();
    el.innerHTML = `Stories last refreshed <b>${fmtET(new Date(D.refreshedAt))} ET</b> · next auto-refresh ~<b>${nextLabel} ET</b> · scores &amp; play-by-play update live`;
  })();

  /* ---------- Live scores ---------- */

  const FLAGS = {
    USA: "🇺🇸", BEL: "🇧🇪", ESP: "🇪🇸", POR: "🇵🇹", ARG: "🇦🇷", EGY: "🇪🇬",
    SUI: "🇨🇭", COL: "🇨🇴", FRA: "🇫🇷", MAR: "🇲🇦", NOR: "🇳🇴", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    MEX: "🇲🇽", CAN: "🇨🇦", BRA: "🇧🇷", PAR: "🇵🇾", GER: "🇩🇪", ITA: "🇮🇹",
    NED: "🇳🇱", CRO: "🇭🇷", JPN: "🇯🇵", KOR: "🇰🇷", SEN: "🇸🇳", URU: "🇺🇾",
    DEN: "🇩🇰", AUS: "🇦🇺", ECU: "🇪🇨", TUR: "🇹🇷"
  };

  // Games are played June 11 – July 19, 2026; fetch today through the final.
  const API =
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260706-20260719";

  const strip = document.getElementById("score-strip");
  const banner = document.getElementById("usa-banner");
  const updatedEl = document.getElementById("scores-updated");

  function roundLabel(dateUTC) {
    const d = dateUTC.slice(0, 10);
    if (d <= "2026-07-08") return "Round of 16";
    if (d <= "2026-07-12") return "Quarterfinal";
    if (d <= "2026-07-16") return "Semifinal";
    if (d === "2026-07-18") return "Third-place game";
    return "THE FINAL";
  }

  function teamName(c) {
    const n = c.team.displayName;
    if (/^(Round of 16|Quarterfinal|Semifinal) \d+ (Winner|Loser)$/.test(n)) return "TBD";
    return c.team.shortDisplayName || n;
  }

  function fmtWhen(iso) {
    const d = new Date(iso);
    const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    return `${day} · ${time}`;
  }

  function statusText(ev, comp) {
    const st = comp.status;
    const state = st.type.state; // pre | in | post
    if (state === "in") {
      const clock = st.displayClock || "";
      return { text: `LIVE · ${clock}`.trim(), cls: "live", note: "The number is the game minute — soccer counts up, not down." };
    }
    if (state === "post") {
      const detail = (st.type.detail || "").toUpperCase();
      if (detail.includes("PEN")) return { text: "FINAL — decided on penalty kicks", cls: "", note: "" };
      if (detail.includes("AET")) return { text: "FINAL (after overtime)", cls: "", note: "" };
      return { text: "FINAL", cls: "", note: "" };
    }
    return { text: fmtWhen(ev.date), cls: "", note: "" };
  }

  function render(events) {
    strip.innerHTML = "";
    let usaEvent = null;

    events.forEach((ev) => {
      const comp = ev.competitions[0];
      const [c1, c2] = comp.competitors;
      const isUSA = comp.competitors.some((c) => c.team.abbreviation === "USA");
      if (isUSA && !usaEvent) usaEvent = ev;

      const st = statusText(ev, comp);
      const done = comp.status.type.state === "post";
      const w = done && Number(c1.score) !== Number(c2.score)
        ? (Number(c1.score) > Number(c2.score) ? c1 : c2)
        : null;

      const teamRow = (c) => `
        <div class="team ${w ? (c === w ? "winner" : "loser") : ""}">
          <span class="flag">${FLAGS[c.team.abbreviation] || "⚽"}</span>
          <span class="name">${teamName(c)}</span>
          <span class="score">${comp.status.type.state === "pre" ? "" : c.score ?? ""}</span>
        </div>`;

      const card = document.createElement("div");
      card.className = "game" + (isUSA ? " usa" : "");
      card.innerHTML = `
        <div class="round">${roundLabel(ev.date)}</div>
        ${teamRow(c2)}${teamRow(c1)}
        <div class="status ${st.cls}">${st.text}${st.note ? `<span class="note">${st.note}</span>` : ""}</div>`;
      const state = comp.status.type.state;
      if (state !== "pre") {
        card.classList.add("tappable");
        if (pbpGame && pbpGame.id === ev.id) card.classList.add("selected");
        card.addEventListener("click", () => {
          document.querySelectorAll(".game.selected").forEach((g) => g.classList.remove("selected"));
          card.classList.add("selected");
          openPBP(ev.id, `${teamName(c2)} vs. ${teamName(c1)}`, state === "in");
        });
      }
      strip.appendChild(card);
    });

    // USA banner
    if (usaEvent) {
      const comp = usaEvent.competitions[0];
      const state = comp.status.type.state;
      const opp = comp.competitors.find((c) => c.team.abbreviation !== "USA");
      const us = comp.competitors.find((c) => c.team.abbreviation === "USA");
      banner.hidden = false;
      if (state === "pre") {
        banner.innerHTML = `🇺🇸 <b>${roundLabel(usaEvent.date).toUpperCase()}:</b> USA vs. ${teamName(opp)} — ${fmtWhen(usaEvent.date)}`;
      } else if (state === "in") {
        banner.innerHTML = `<span class="pulse"></span><b>USA ${us.score} — ${teamName(opp)} ${opp.score}</b> · LIVE, ${comp.status.displayClock || ""}`;
      } else {
        const won = Number(us.score) > Number(opp.score);
        banner.innerHTML = won
          ? `🇺🇸 <b>FINAL: USA ${us.score}, ${teamName(opp)} ${opp.score}.</b> We're still in this thing.`
          : `🇺🇸 <b>FINAL: ${teamName(opp)} ${opp.score}, USA ${us.score}.</b> It was a hell of a run.`;
      }
    }

    updatedEl.textContent =
      "updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  async function loadScores() {
    try {
      const res = await fetch(API);
      const data = await res.json();
      const events = (data.events || [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      if (events.length) render(events);
      else strip.innerHTML = `<div class="score-error">No games on the schedule. The tournament may be over — see you in 2030.</div>`;
    } catch (err) {
      if (!strip.querySelector(".game")) {
        strip.innerHTML = `<div class="score-error">Couldn't reach the scoreboard feed. Check your connection and refresh.</div>`;
      }
    }
  }

  loadScores();
  setInterval(loadScores, 60000);

  /* ---------- Play-by-play (translated live from ESPN's Opta feed) ---------- */

  const pbpEl = document.getElementById("pbp");
  let pbpGame = null;      // {id, title, live}
  let pbpTimer = null;

  // Opta writes formulaic British English — translate it with rules, no AI needed.
  function americanize(txt) {
    let s = txt;
    s = s.replace(/\bcentre\b/g, "center");
    s = s.replace(/(left|right) footed/g, "$1-footed");
    s = s.replace(/^Goal!\s+(.+?) (\d+), (.+?) (\d+)\./, "⚽ GOAL! It's now $1 $2, $3 $4.");
    s = s.replace(/^Own Goal by (.+?)[,.]/, "⚽ OWN GOAL — $1 scored on his own team.");
    s = s.replace(/^Attempt missed\./, "Miss —");
    s = s.replace(/^Attempt saved\./, "Shot saved —");
    s = s.replace(/^Attempt blocked\./, "Shot blocked —");
    s = s.replace(/misses to the left/, "goes wide left");
    s = s.replace(/misses to the right/, "goes wide right");
    s = s.replace(/is too high/, "sails over the goal");
    s = s.replace(/^(.+?) \((.+?)\) is shown the yellow card(.*)\.$/, "🟨 Yellow card (a warning) — $1 ($2)$3.");
    s = s.replace(/^(.+?) \((.+?)\) is shown the red card(.*)\.$/, "🟥 RED CARD — $1 ($2)$3. He's ejected, and $2 plays a man short the rest of the way.");
    s = s.replace(/^Substitution, (.+?)\. (.+?) replaces (.+?)\.$/, "🔁 Sub ($1): $2 in, $3 out.");
    s = s.replace(/^First Half begins\.?/, "▶️ Kickoff.");
    s = s.replace(/^Second Half begins\s*/, "▶️ Second half underway. ");
    s = s.replace(/^First Half ends, (.+)\.$/, "⏸ HALFTIME: $1.");
    s = s.replace(/^Second Half ends, (.+)\.$/, "⏱ The 90 minutes are up: $1.");
    s = s.replace(/^Match ends, (.+)\.$/, "🏁 FINAL: $1.");
    s = s.replace(/^First Half Extra Time begins\s*/, "▶️ Overtime begins (they call it extra time — two full 15-minute periods, no sudden death). ");
    s = s.replace(/^Second Half Extra Time begins\s*/, "▶️ Second overtime period underway. ");
    s = s.replace(/^(First|Second) Half Extra Time ends, (.+)\.$/, "⏸ End of the overtime period: $2.");
    s = s.replace(/^Penalty Shootout begins\s*/, "🎯 PENALTY SHOOTOUT — best of five from 12 yards, sudden death after that. ");
    s = s.replace(/^Penalty saved!/, "🧤 PENALTY SAVED!");
    s = s.replace(/^Penalty missed!/, "❌ PENALTY MISSED!");
    s = s.replace(/^Penalty conceded by (.+?) \((.+?)\)(.*)\.$/, "⚠️ Penalty! $1 ($2) fouled someone in the box$3 — free shot from 12 yards coming up.");
    s = s.replace(/^VAR Decision:/, "📺 Replay review (VAR):");
    s = s.replace(/^Delay in match for a drinks break.*/, "⏸ Hydration break (it's July).");
    s = s.replace(/^Delay in match\b/, "⏸ Play stopped");
    s = s.replace(/^Delay over\..*/, "▶️ Back underway.");
    s = s.replace(/through ball/g, "through pass");
    s = s.replace(/following a fast break/, "on the fast break");
    s = s.replace(/from a set piece situation/, "off a dead-ball play");
    return s;
  }

  const KEEP = /^(Goal!|Own Goal|Attempt|Penalty|Substitution|Match ends|First Half|Second Half|VAR|Delay)|shown the (yellow|red) card/;
  const BIG = /^(⚽|🟥|🧤|❌|🏁|⏸ HALFTIME|🎯)/;

  async function loadPBP() {
    if (!pbpGame) return;
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${pbpGame.id}`
      );
      const data = await res.json();
      const items = (data.commentary || [])
        .filter((c) => c.text && KEEP.test(c.text))
        .map((c) => ({ min: (c.time && c.time.displayValue) || "", txt: americanize(c.text), seq: +c.sequence || 0 }))
        .sort((a, b) => b.seq - a.seq)
        .slice(0, 80);
      const list = pbpEl.querySelector(".pbp-list");
      if (!items.length) {
        list.innerHTML = `<li class="pbp-empty">Nothing yet — the feed usually starts at kickoff.</li>`;
        return;
      }
      list.innerHTML = items
        .map((i) => `<li class="${BIG.test(i.txt) ? "big" : ""}"><span class="min">${i.min}</span><span class="txt">${i.txt}</span></li>`)
        .join("");
    } catch (e) {
      pbpEl.querySelector(".pbp-list").innerHTML =
        `<li class="pbp-empty">Couldn't load the play-by-play feed. It'll retry shortly.</li>`;
    }
  }

  function openPBP(id, title, live) {
    pbpGame = { id, title, live };
    pbpEl.hidden = false;
    pbpEl.innerHTML = `
      <div class="pbp-head">
        <div class="pbp-title">${live ? '<span class="live-dot"></span>' : ""}Play-by-play · ${title}</div>
        <button class="pbp-close" aria-label="Close">✕</button>
      </div>
      <div class="pbp-note">Key moments only, newest first, translated to American. Times count up — “45'+2'” means 2 minutes into first-half stoppage time.${live ? " Updates every 45 seconds." : ""}</div>
      <ul class="pbp-list"><li class="pbp-loading">Loading the feed…</li></ul>`;
    pbpEl.querySelector(".pbp-close").addEventListener("click", closePBP);
    loadPBP();
    if (pbpTimer) clearInterval(pbpTimer);
    if (live) pbpTimer = setInterval(loadPBP, 45000);
    pbpEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closePBP() {
    pbpGame = null;
    pbpEl.hidden = true;
    pbpEl.innerHTML = "";
    if (pbpTimer) { clearInterval(pbpTimer); pbpTimer = null; }
    document.querySelectorAll(".game.selected").forEach((g) => g.classList.remove("selected"));
  }
})();
