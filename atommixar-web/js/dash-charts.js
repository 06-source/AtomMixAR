/**
 * AtomMixAR — shared chart helpers (needs Chart.js loaded first).
 * Colors follow the page's own text color, so it works on light or dark themes.
 */
const DashCharts = (function () {
  const COLORS = ["#5969ff", "#ff407b", "#25d5f2", "#ffc750", "#2ec551", "#a78bfa"];
  const charts = {};

  const css = document.createElement("style");
  css.textContent = `
    .chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-bottom:28px}
    .chart-card{padding:18px 20px}
    .chart-card h3{margin:0 0 12px;font-size:1rem}
    .chart-box{position:relative;height:260px}
    .chart-empty{position:absolute;inset:0;display:none;align-items:center;justify-content:center;opacity:.6;font-size:.88rem}`;
  document.head.appendChild(css);

  const textColor = () => getComputedStyle(document.body).color;
  const gridColor = "rgba(128,128,128,.2)";

  function draw(id, type, labels, data, o) {
    o = o || {};
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) charts[id].destroy();
    const empty = !data.length || data.every(v => !v);
    const note = el.parentNode.querySelector(".chart-empty");
    if (note) note.style.display = empty ? "flex" : "none";
    el.style.visibility = empty ? "hidden" : "visible";
    if (empty) return;

    const round = type === "doughnut";
    const ds = {
      data,
      backgroundColor: round ? (o.colors || COLORS) : (o.color || COLORS[0]),
      borderColor: type === "line" ? (o.color || COLORS[0]) : undefined,
      borderRadius: type === "bar" ? 4 : 0,
      fill: type === "line",
      tension: .3
    };
    if (type === "line") ds.backgroundColor = (o.color || COLORS[0]) + "33";

    const tc = textColor();
    const scales = round ? {} : {
      x: { ticks: { color: tc, precision: 0 }, grid: { color: gridColor }, beginAtZero: true,
           max: o.pct && o.horizontal ? 100 : undefined },
      y: { ticks: { color: tc, precision: 0 }, grid: { color: gridColor }, beginAtZero: true,
           max: o.pct && !o.horizontal ? 100 : undefined }
    };

    charts[id] = new Chart(el, {
      type: type,
      data: { labels, datasets: [ds] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: o.horizontal ? "y" : "x",
        cutout: round ? "62%" : undefined,
        plugins: {
          legend: { display: round, position: "bottom", labels: { color: tc } },
          tooltip: { callbacks: o.pct ? { label: c => " " + c.parsed[o.horizontal ? "x" : "y"] + "%" } : {} }
        },
        scales
      }
    });
  }

  // Count rows per day for the last n days
  function lastDays(rows, n) {
    const labels = [], counts = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(start); d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      labels.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      counts.push(rows.filter(r => r.date >= d.getTime() && r.date < next).length);
    }
    return { labels, counts };
  }

  // Average % per quiz title
  function avgByKey(rows, keyFn) {
    const m = {};
    rows.filter(r => r.total).forEach(r => {
      const k = keyFn(r) || "—";
      (m[k] = m[k] || []).push(r.score / r.total * 100);
    });
    const keys = Object.keys(m).sort();
    return { labels: keys, values: keys.map(k => Math.round(m[k].reduce((a, b) => a + b, 0) / m[k].length)) };
  }

  const card = (title, id) => `<div class="card chart-card"><h3>${title}</h3>
    <div class="chart-box"><canvas id="${id}"></canvas><div class="chart-empty">No data yet</div></div></div>`;

  return { draw, lastDays, avgByKey, card, COLORS };
})();