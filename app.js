/*
=========================================================
 BTTS SCANNER PRO
 Motor estatístico - versão 0.4
=========================================================

IMPORTANTE:

Esta versão NÃO inventa jogos nem resultados.

O motor foi preparado para receber dados reais através
de uma API/backend.

Sem histórico suficiente:
=> SEM SINAL

"Sem sinal" não significa apostar contra BTTS.

=========================================================
*/

const STORAGE_KEY = "btts_scanner_pro_v04";

const DEFAULT_STATE = {
  bankroll: 1000,
  stakePct: 1,
  pnl: 0,
  filter: "all",
  matches: []
};


/* ======================================================
   ESTADO
====================================================== */

let state;

try {
  state = JSON.parse(
    localStorage.getItem(STORAGE_KEY)
  );

  if (!state || typeof state !== "object") {
    state = { ...DEFAULT_STATE };
  }

} catch (error) {

  state = { ...DEFAULT_STATE };

}


/* ======================================================
   ELEMENTOS
====================================================== */

const $ = (id) => document.getElementById(id);


/* ======================================================
   FORMATAÇÃO
====================================================== */

function formatBRL(value) {

  const number = Number(value) || 0;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(number);

}


function formatPercent(value) {

  const number = Number(value) || 0;

  return number
    .toFixed(1)
    .replace(".", ",") + "%";

}


/* ======================================================
   SALVAR
====================================================== */

function saveState() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );

}


/* ======================================================
   STAKE
====================================================== */

function calculateStake() {

  const bankroll =
    Number(state.bankroll) || 0;

  const percentage =
    Number(state.stakePct) || 0;

  return bankroll * percentage / 100;

}


/* ======================================================
   FUNÇÕES ESTATÍSTICAS
====================================================== */

function percentage(part, total) {

  if (!total || total <= 0) {
    return null;
  }

  return (part / total) * 100;

}


function clamp(value, min, max) {

  return Math.min(
    max,
    Math.max(min, value)
  );

}


/* ======================================================
   ESTATÍSTICAS DE UMA EQUIPE
======================================================

Formato esperado para cada partida:

{
  date: "2026-09-21",
  home: "Equipe A",
  away: "Equipe B",
  homeGoals: 2,
  awayGoals: 1
}

====================================================== */

function calculateTeamStats(matches, team, venue = "all") {

  if (!Array.isArray(matches)) {
    return null;
  }

  const filtered = matches.filter(match => {

    const isHome =
      match.home === team;

    const isAway =
      match.away === team;

    if (!isHome && !isAway) {
      return false;
    }

    if (venue === "home" && !isHome) {
      return false;
    }

    if (venue === "away" && !isAway) {
      return false;
    }

    return (
      Number.isFinite(Number(match.homeGoals)) &&
      Number.isFinite(Number(match.awayGoals))
    );

  });

  if (!filtered.length) {
    return null;
  }


  let btts = 0;
  let scored = 0;
  let conceded = 0;

  let goalsFor = 0;
  let goalsAgainst = 0;

  let over15 = 0;
  let over25 = 0;

  let cleanSheets = 0;


  filtered.forEach(match => {

    const isHome =
      match.home === team;

    const gf = isHome
      ? Number(match.homeGoals)
      : Number(match.awayGoals);

    const ga = isHome
      ? Number(match.awayGoals)
      : Number(match.homeGoals);

    const totalGoals =
      gf + ga;


    goalsFor += gf;

    goalsAgainst += ga;


    if (gf > 0) {
      scored++;
    }


    if (ga > 0) {
      conceded++;
    }


    if (gf > 0 && ga > 0) {
      btts++;
    }


    if (ga === 0) {
      cleanSheets++;
    }


    if (totalGoals > 1) {
      over15++;
    }


    if (totalGoals > 2) {
      over25++;
    }

  });


  return {

    games: filtered.length,

    btts:
      percentage(
        btts,
        filtered.length
      ),

    scoring:
      percentage(
        scored,
        filtered.length
      ),

    conceding:
      percentage(
        conceded,
        filtered.length
      ),

    goalsFor:
      goalsFor / filtered.length,

    goalsAgainst:
      goalsAgainst / filtered.length,

    over15:
      percentage(
        over15,
        filtered.length
      ),

    over25:
      percentage(
        over25,
        filtered.length
      ),

    cleanSheets:
      percentage(
        cleanSheets,
        filtered.length
      )

  };

}


/* ======================================================
   ÚLTIMOS N JOGOS
====================================================== */

function lastMatches(
  matches,
  team,
  count
) {

  if (!Array.isArray(matches)) {
    return [];
  }

  return matches
    .filter(match =>
      match.home === team ||
      match.away === team
    )
    .sort((a, b) =>
      new Date(b.date) -
      new Date(a.date)
    )
    .slice(0, count);

}


/* ======================================================
   MOTOR BTTS
======================================================

Score NÃO É PROBABILIDADE.

Pesos experimentais.

Eles deverão ser recalibrados depois de backtest.

====================================================== */

function calculateBTTSScore(
  homeTeam,
  awayTeam,
  historicalMatches
) {

  const homeLast10 =
    lastMatches(
      historicalMatches,
      homeTeam,
      10
    );

  const awayLast10 =
    lastMatches(
      historicalMatches,
      awayTeam,
      10
    );


  const homeStats =
    calculateTeamStats(
      homeLast10,
      homeTeam,
      "all"
    );

  const awayStats =
    calculateTeamStats(
      awayLast10,
      awayTeam,
      "all"
    );


  if (!homeStats || !awayStats) {

    return {

      score: null,

      confidence: 0,

      signal: "none",

      reason:
        "Histórico insuficiente"

    };

  }


  /*
  -------------------------------------------------------
  COMPONENTES
  -------------------------------------------------------
  */

  const bttsRecent =
    (
      homeStats.btts +
      awayStats.btts
    ) / 2;


  const scoring =
    (
      homeStats.scoring +
      awayStats.scoring
    ) / 2;


  const conceding =
    (
      homeStats.conceding +
      awayStats.conceding
    ) / 2;


  const over15 =
    (
      homeStats.over15 +
      awayStats.over15
    ) / 2;


  const over25 =
    (
      homeStats.over25 +
      awayStats.over25
    ) / 2;


  /*
  -------------------------------------------------------
  SCORE

  BTTS recente      25%
  Marcar            20%
  Sofrer            20%
  Over 1.5          15%
  Over 2.5          10%
  Equilíbrio        10%
  -------------------------------------------------------
  */

  const balance =
    (
      scoring +
      conceding
    ) / 2;


  let score =

      bttsRecent * 0.25 +

      scoring * 0.20 +

      conceding * 0.20 +

      over15 * 0.15 +

      over25 * 0.10 +

      balance * 0.10;


  score = clamp(
    score,
    0,
    100
  );


  /*
  -------------------------------------------------------
  CONFIANÇA DOS DADOS
  -------------------------------------------------------
  */

  const minimumGames =
    Math.min(
      homeStats.games,
      awayStats.games
    );


  let confidence =
    (minimumGames / 10) * 100;


  confidence = clamp(
    confidence,
    0,
    100
  );


  /*
  -------------------------------------------------------
  REGRA DE SEGURANÇA

  Não existe entrada com amostra pequena.
  -------------------------------------------------------
  */

  if (minimumGames < 5) {

    return {

      score: Math.round(score),

      confidence:
        Math.round(confidence),

      signal: "none",

      reason:
        "Amostra histórica insuficiente"

    };

  }


  /*
  -------------------------------------------------------
  SINAL

  IMPORTANTE:

  Score baixo NÃO significa apostar contra BTTS.

  Apenas significa que não encontramos condições
  suficientes para entrada.
  -------------------------------------------------------
  */

  let signal = "none";

  let reason =
    "Sem vantagem estatística suficiente";


  if (
    score >= 70 &&
    confidence >= 70
  ) {

    signal = "entry";

    reason =
      "Indicadores estatísticos favoráveis";

  }

  else if (
    score >= 55 &&
    confidence >= 60
  ) {

    signal = "watch";

    reason =
      "Condições intermediárias";

  }


  return {

    score:
      Math.round(score),

    confidence:
      Math.round(confidence),

    signal,

    reason,

    homeStats,

    awayStats

  };

}


/* ======================================================
   CLASSIFICAÇÃO
====================================================== */

function signalLabel(signal) {

  switch (signal) {

    case "entry":
      return "🟢 ENTRADA";

    case "watch":
      return "🟡 OBSERVAR";

    case "none":
    default:
      return "⚪ SEM SINAL";

  }

}


/* ======================================================
   RENDER DO JOGO
====================================================== */

function renderMatch(match) {

  const score =
    match.score !== null &&
    match.score !== undefined
      ? match.score
      : "—";


  const confidence =
    match.confidence !== null &&
    match.confidence !== undefined
      ? match.confidence
      : "—";


  return `

    <article class="match-card">

      <div class="match-header">

        <span>
          ${signalLabel(match.signal)}
        </span>

        <strong>
          ${score}
        </strong>

      </div>


      <div class="match-league">

        ${match.league || "Competição"}

      </div>


      <h3>

        ${match.home || "Casa"}

        <span>×</span>

        ${match.away || "Fora"}

      </h3>


      <div class="match-info">

        <span>
          ⏰ ${match.kickoff || "--:--"}
        </span>

        <span>
          Confiança: ${confidence}
        </span>

      </div>


      <div class="match-reason">

        ${
          match.reason ||
          "Sem informação adicional"
        }

      </div>

    </article>

  `;

}


/* ======================================================
   RENDER PRINCIPAL
====================================================== */

function render() {

  /*
  BANCA
  */

  if ($("bankroll")) {
    $("bankroll").value =
      state.bankroll;
  }


  if ($("stakePct")) {
    $("stakePct").value =
      state.stakePct;
  }


  if ($("stake")) {

    $("stake").textContent =
      formatBRL(
        calculateStake()
      );

  }


  /*
  DADOS
  */

  const matches =
    Array.isArray(state.matches)
      ? state.matches
      : [];


  const realMatches =
    matches.filter(
      match =>
        match &&
        match.hasRealHistoricalData === true
    );


  const entries =
    realMatches.filter(
      match =>
        match.signal === "entry"
    );


  const greens =
    realMatches.filter(
      match =>
        match.result === "green"
    );


  const reds =
    realMatches.filter(
      match =>
        match.result === "red"
    );


  /*
  MÉDIA SCORE
  */

  const scores =
    realMatches
      .map(match =>
        Number(match.score)
      )
      .filter(Number.isFinite);


  if ($("avgScore")) {

    $("avgScore").textContent =
      scores.length
        ? Math.round(
            scores.reduce(
              (a, b) => a + b,
              0
            ) / scores.length
          )
        : "—";

  }


  /*
  MÉTRICAS
  */

  if ($("signals")) {
    $("signals").textContent =
      entries.length;
  }


  if ($("greens")) {
    $("greens").textContent =
      greens.length;
  }


  if ($("reds")) {
    $("reds").textContent =
      reds.length;
  }


  /*
  ROI
  */

  const totalStaked =
    entries.length *
    calculateStake();


  const pnl =
    Number(state.pnl) || 0;


  if ($("roi")) {

    $("roi").textContent =
      totalStaked > 0
        ? formatPercent(
            (pnl / totalStaked) * 100
          )
        : "0,0%";

  }


  /*
  PERFORMANCE
  */

  if ($("perfGames")) {
    $("perfGames").textContent =
      realMatches.length;
  }


  if ($("perfEntries")) {
    $("perfEntries").textContent =
      entries.length;
  }


  if ($("perfGreens")) {
    $("perfGreens").textContent =
      greens.length;
  }


  if ($("perfReds")) {
    $("perfReds").textContent =
      reds.length;
  }


  /*
  LISTA
  */

  let visibleMatches =
    matches;


  if (state.filter !== "all") {

    visibleMatches =
      matches.filter(
        match =>
          match.signal ===
          state.filter
      );

  }


  const container =
    $("matches");


  if (!container) {
    return;
  }


  if (!visibleMatches.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          ⚽
        </div>

        <h3>
          Scanner aguardando dados reais
        </h3>

        <p>
          Nenhuma partida com histórico
          estatístico real está conectada.
        </p>

        <p class="important-message">

          O sistema não apresenta
          candidatos fictícios.

        </p>

      </div>

    `;

  }

  else {

    container.innerHTML =
      visibleMatches
        .map(renderMatch)
        .join("");

  }


  /*
  STATUS
  */

  if ($("dataStatus")) {

    $("dataStatus").textContent =
      realMatches.length
        ? `${realMatches.length} jogos com dados`
        : "Aguardando API";

  }


  if ($("systemStatus")) {

    $("systemStatus").textContent =
      realMatches.length
        ? "Motor BTTS ativo"
        : "Motor aguardando dados reais";

  }

}


/* ======================================================
   EVENTOS DA BANCA
====================================================== */

if ($("bankroll")) {

  $("bankroll")
    .addEventListener(
      "input",
      event => {

        state.bankroll =
          Math.max(
            0,
            Number(event.target.value) || 0
          );

        saveState();
        render();

      }
    );

}


if ($("stakePct")) {

  $("stakePct")
    .addEventListener(
      "input",
      event => {

        state.stakePct =
          clamp(
            Number(event.target.value) || 0,
            0,
            100
          );

        saveState();
        render();

      }
    );

}


/* ======================================================
   FILTROS
====================================================== */

document
  .querySelectorAll(
    ".filter-button"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(
            ".filter-button"
          )
          .forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );


        button.classList.add(
          "active"
        );


        state.filter =
          button.dataset.filter;


        saveState();

        render();

      }
    );

  });


/* ======================================================
   INTERFACE PÚBLICA DO MOTOR
======================================================

Quando conectarmos a API/backend,
poderemos alimentar o aplicativo com:

window.BTTSScanner.setMatches(...)

====================================================== */

window.BTTSScanner = {

  setMatches(matches) {

    if (!Array.isArray(matches)) {
      console.warn(
        "BTTS Scanner: dados inválidos."
      );

      return;
    }


    state.matches =
      matches;


    saveState();

    render();

  },


  calculateScore(
    homeTeam,
    awayTeam,
    historicalMatches
  ) {

    return calculateBTTSScore(
      homeTeam,
      awayTeam,
      historicalMatches
    );

  },


  getState() {

    return {
      ...state
    };

  },


  clearMatches() {

    state.matches = [];

    saveState();

    render();

  }

};


/* ======================================================
   INICIALIZAÇÃO
====================================================== */

render();


console.log(
  "BTTS Scanner PRO v0.4 iniciado."
);

console.log(
  "Modo atual: aguardando API/backend."
);
