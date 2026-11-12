// Credits Desk Dashboard — renders window.DASHBOARD_DATA into the tab panels
(function () {
  const D = window.DASHBOARD_DATA;
  const fmt$ = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

  document.getElementById("generated-at").textContent = D.generated_at;

  // Point "Update data now" at this repo's GitHub Actions page. Works when
  // hosted on GitHub Pages (<user>.github.io/<repo>/...) AND on a custom
  // domain pointed at that same Pages site — the repo is fixed either way,
  // so we fall back to the known repo instead of hiding the button.
  (function wireManualUpdateLink() {
    const link = document.getElementById("manual-update-link");
    const host = window.location.hostname;
    const KNOWN_REPO_ACTIONS_URL = "https://github.com/Olilev4/credits-desk-dashboard/actions/workflows/update-data.yml";

    if (host === "localhost" || host === "127.0.0.1" || window.location.protocol === "file:") {
      // Opened as a local file or local dev server — no GitHub-hosted copy to
      // point at, so hide the button instead of linking somewhere wrong.
      link.style.display = "none";
      document.getElementById("manual-update-hint").style.display = "none";
      return;
    }

    const match = host.match(/^([^.]+)\.github\.io$/);
    if (match) {
      const user = match[1];
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      const repo = pathParts[0] || "";
      if (repo) {
        link.href = `https://github.com/${user}/${repo}/actions/workflows/update-data.yml`;
        return;
      }
    }
    // Any other real web host (e.g. a custom domain pointed at GitHub Pages)
    // — fall back to the known repo.
    link.href = KNOWN_REPO_ACTIONS_URL;
  })();

  // "Update data" button on the Overview tab: opens the Actions run page,
  // then polls GitHub's public REST API (no auth needed for a public repo)
  // until a new run of update-data.yml finishes, and reloads the page so the
  // freshly-committed data.js gets picked up.
  (function wireOverviewUpdateButton() {
    const btn = document.getElementById("overview-update-btn");
    const status = document.getElementById("overview-update-status");
    if (!btn) return;
    const REPO = "Olilev4/credits-desk-dashboard";
    const RUNS_URL = `https://api.github.com/repos/${REPO}/actions/workflows/update-data.yml/runs?per_page=1`;
    const ACTIONS_PAGE = `https://github.com/${REPO}/actions/workflows/update-data.yml`;
    let polling = false;

    async function latestRunId() {
      const resp = await fetch(RUNS_URL, { headers: { Accept: "application/vnd.github+json" } });
      if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
      const data = await resp.json();
      return data.workflow_runs && data.workflow_runs[0] ? data.workflow_runs[0] : null;
    }

    async function startPolling(baselineId) {
      polling = true;
      const deadline = Date.now() + 5 * 60 * 1000; // give up after 5 minutes
      status.textContent = "Waiting for you to click \"Run workflow\" on the GitHub tab that just opened\u2026 checking automatically every few seconds.";
      while (polling && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        let run;
        try {
          run = await latestRunId();
        } catch (e) {
          status.textContent = "Couldn't reach GitHub to check progress \u2014 run it manually on the Actions tab, then refresh this page.";
          polling = false;
          return;
        }
        if (!run || run.id === baselineId) continue; // still the old run
        if (run.status !== "completed") {
          status.textContent = "Running\u2026 pulling the latest sheet data now.";
          continue;
        }
        polling = false;
        if (run.conclusion === "success") {
          status.textContent = "\u2705 Updated! Reloading\u2026";
          setTimeout(() => {
            const sep = window.location.href.includes("?") ? "&" : "?";
            window.location.href = window.location.href.split("#")[0] + sep + "_refresh=" + Date.now();
          }, 600);
        } else {
          status.textContent = `\u26a0\ufe0f The update run finished with "${run.conclusion}". Check the Actions tab for details.`;
        }
        return;
      }
      if (polling) {
        polling = false;
        status.textContent = "Still waiting after 5 minutes \u2014 check the Actions tab, or refresh this page once it's done.";
      }
    }

    btn.addEventListener("click", async () => {
      if (polling) return;
      btn.disabled = true;
      status.textContent = "Opening GitHub\u2026";
      window.open(ACTIONS_PAGE, "_blank", "noopener");
      let baseline = null;
      try {
        baseline = await latestRunId();
      } catch (e) {
        // Fine — we'll just treat any completed run we see next as the new one.
      }
      btn.disabled = false;
      startPolling(baseline ? baseline.id : null);
    });
  })();

  // Tabs
  const tabButtons = {
    overview: document.getElementById("tab-btn-overview"),
    provider: document.getElementById("tab-btn-provider"),
    website: document.getElementById("tab-btn-website"),
    compare: document.getElementById("tab-btn-compare"),
    programs: document.getElementById("tab-btn-programs"),
    applications: document.getElementById("tab-btn-applications"),
  };
  const tabPanels = {
    overview: document.getElementById("tab-overview"),
    provider: document.getElementById("tab-provider"),
    website: document.getElementById("tab-website"),
    compare: document.getElementById("tab-compare"),
    programs: document.getElementById("tab-programs"),
    applications: document.getElementById("tab-applications"),
  };
  function showTab(name) {
    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].classList.toggle("hidden", key !== name);
      tabButtons[key].classList.toggle("border-slate-900", key === name);
      tabButtons[key].classList.toggle("text-slate-900", key === name);
      tabButtons[key].classList.toggle("bg-slate-50", key === name);
      tabButtons[key].classList.toggle("border-transparent", key !== name);
      tabButtons[key].classList.toggle("text-slate-500", key !== name);
    });
  }
  tabButtons.overview.addEventListener("click", () => showTab("overview"));
  tabButtons.provider.addEventListener("click", () => showTab("provider"));
  tabButtons.website.addEventListener("click", () => showTab("website"));
  tabButtons.compare.addEventListener("click", () => showTab("compare"));
  tabButtons.programs.addEventListener("click", () => showTab("programs"));
  tabButtons.applications.addEventListener("click", () => showTab("applications"));

  const OPEN_STATUSES = new Set(["Applied", "Pending", "Action required", "Planned", "Blocked", "Blocked / unable to apply", "(blank)"]);
  const monthKey = (d) => (d ? d.slice(0, 7) : null); // "YYYY-MM-DD" -> "YYYY-MM"
  const monthLabel = (key) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  };

  // Build a continuous list of months: from the earliest month seen in the data
  // through at least "this month" (so the current/upcoming month is always
  // selectable, even before any applications/receipts land in it — new months
  // keep appearing automatically as real time, or new data, moves forward).
  const monthSet = new Set();
  D.applications.forEach((a) => {
    const m1 = monthKey(a.date_applied);
    const m2 = monthKey(a.date_received);
    if (m1 && m1 >= "2021") monthSet.add(m1); // guards against the odd 2020 typo date in the sheet
    if (m2 && m2 >= "2021") monthSet.add(m2);
  });
  const seenMonths = [...monthSet].sort();
  const todayKey = monthKey(new Date().toISOString().slice(0, 10));
  const rangeStart = seenMonths[0] || todayKey;
  const rangeEnd = seenMonths.length && seenMonths[seenMonths.length - 1] > todayKey ? seenMonths[seenMonths.length - 1] : todayKey;
  const months = [];
  {
    let [y, m] = rangeStart.split("-").map(Number);
    const [endY, endM] = rangeEnd.split("-").map(Number);
    while (y < endY || (y === endY && m <= endM)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  const monthSelect = document.getElementById("period-month");
  months.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = monthLabel(m);
    monthSelect.appendChild(opt);
  });

  // Constrain the range pickers to the real data range (ignores the stray 2020 typo date)
  const allDates = [];
  D.applications.forEach((a) => {
    if (a.date_applied && a.date_applied >= "2021-01-01") allDates.push(a.date_applied);
    if (a.date_received && a.date_received >= "2021-01-01") allDates.push(a.date_received);
  });
  const startInput = document.getElementById("period-start");
  const endInput = document.getElementById("period-end");
  let dataMin = null,
    dataMax = null;
  if (allDates.length) {
    allDates.sort();
    dataMin = allDates[0];
    dataMax = allDates[allDates.length - 1];
    startInput.min = dataMin;
    startInput.max = dataMax;
    endInput.min = dataMin;
    endInput.max = dataMax;
  }

  function computeKPIs(period) {
    // period: { type: "all" } | { type: "month", value: "YYYY-MM" } | { type: "range", start, end }
    const inPeriod = (dateStr) => {
      if (!dateStr) return false;
      if (period.type === "all") return true;
      if (period.type === "month") return dateStr.slice(0, 7) === period.value;
      if (period.type === "range") return dateStr >= period.start && dateStr <= period.end;
      return false;
    };

    let total = 0,
      received = 0,
      receivedCount = 0,
      pipeline = 0,
      open = 0;

    D.applications.forEach((a) => {
      const submittedInPeriod = inPeriod(a.date_applied);
      const receivedInPeriod = inPeriod(a.date_received);
      if (submittedInPeriod) {
        total += 1;
        if (OPEN_STATUSES.has(a.status)) {
          open += 1;
          pipeline += a.requested_usd || 0;
        }
      }
      if (receivedInPeriod && a.status === "Received") {
        received += a.approved_usd || 0;
        receivedCount += 1;
      }
    });

    return { total, received, receivedCount, pipeline, open };
  }

  function currentPeriod() {
    const startVal = startInput.value;
    const endVal = endInput.value;
    if (startVal || endVal) {
      return { type: "range", start: startVal || dataMin, end: endVal || dataMax };
    }
    const monthVal = monthSelect.value;
    if (monthVal) return { type: "month", value: monthVal };
    return { type: "all" };
  }

  function periodLabelText(period) {
    if (period.type === "range") return `${period.start} to ${period.end}`;
    if (period.type === "month") return monthLabel(period.value);
    return "All time";
  }

  function refreshKPIs() {
    const period = currentPeriod();
    const k = computeKPIs(period);
    document.getElementById("kpi-period-label").textContent = periodLabelText(period);
    document.getElementById("kpi-total").textContent = k.total.toLocaleString();
    document.getElementById("kpi-received").textContent = fmt$(k.received);
    document.getElementById("kpi-received-count").textContent = k.receivedCount.toLocaleString();
    document.getElementById("kpi-pipeline").textContent = fmt$(k.pipeline);
    document.getElementById("kpi-open").textContent = k.open.toLocaleString();
    if (window.__updateTrendChart) window.__updateTrendChart(period);
  }

  monthSelect.addEventListener("change", () => {
    if (monthSelect.value) {
      startInput.value = "";
      endInput.value = "";
    }
    refreshKPIs();
  });
  [startInput, endInput].forEach((input) => {
    input.addEventListener("change", () => {
      if (input.value) monthSelect.value = "";
      refreshKPIs();
    });
  });
  document.getElementById("period-clear").addEventListener("click", () => {
    monthSelect.value = "";
    startInput.value = "";
    endInput.value = "";
    refreshKPIs();
  });

  refreshKPIs();
  initTrendChart();
  initProviderTab();
  initCompareTab();
  initWebsiteTab();

  function section(title, note, bodyHtml) {
    return `
    <section class="mb-12">
      <h2 class="text-lg font-semibold mb-1">${title}</h2>
      ${note ? `<p class="text-sm text-slate-600 mb-4 max-w-2xl">${note}</p>` : ""}
      ${bodyHtml}
    </section>`;
  }

  document.getElementById("programs-root").innerHTML = buildPrograms();
  document.getElementById("applications-root").innerHTML = buildApplications();

  function buildPrograms() {
    const rows = D.programs
      .slice()
      .sort((a, b) => (b.credit_amount.match(/[\d,]+/)?.[0].replace(/,/g, "") || 0) - (a.credit_amount.match(/[\d,]+/)?.[0].replace(/,/g, "") || 0))
      .map(
        (p) => `
        <tr class="border-t border-slate-200">
          <td class="py-2 pr-4 font-medium">${p.program}</td>
          <td class="py-2 pr-4">${p.provider}</td>
          <td class="py-2 pr-4">${p.credit_amount || "&ndash;"}</td>
          <td class="py-2 pr-4">${p.tier || "&ndash;"}</td>
          <td class="py-2 pr-4 text-slate-600">${p.notes || "&ndash;"}</td>
        </tr>`
      )
      .join("");
    return section(
      "Program catalog",
      `${D.programs.length} known token/GPU/cloud-AI credit programs worth applying to.`,
      `<div class="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-white">
            <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-300">
              <th class="py-2 px-4">Program</th><th class="py-2 px-4">Provider</th>
              <th class="py-2 px-4">Credit amount</th><th class="py-2 px-4">Tier</th><th class="py-2 px-4">Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    );
  }

  function buildApplications() {
    const statuses = [...new Set(D.applications.map((a) => a.status).filter(Boolean))].sort();
    const options = statuses.map((s) => `<option value="${s}">${s}</option>`).join("");
    return section(
      "Applications log",
      `${D.applications.length} rows. Filter by status or search company / program.`,
      `<div class="flex flex-wrap gap-3 mb-3 no-print">
        <input id="app-search" type="text" placeholder="Search company or program&hellip;"
          class="border border-slate-300 px-3 py-1.5 text-sm w-64" />
        <select id="app-status" class="border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">All statuses</option>${options}
        </select>
      </div>
      <div class="overflow-x-auto max-h-[32rem] overflow-y-auto border border-slate-200">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-white">
            <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-300">
              <th class="py-2 px-4">Company</th><th class="py-2 px-4">Program</th>
              <th class="py-2 px-4">Consultant</th><th class="py-2 px-4">Status</th>
              <th class="py-2 px-4 text-right">Requested $</th><th class="py-2 px-4 text-right">Approved $</th>
              <th class="py-2 px-4">Applied</th>
            </tr>
          </thead>
          <tbody id="app-rows"></tbody>
        </table>
      </div>`
    );
  }

  function renderAppRows() {
    const q = (document.getElementById("app-search").value || "").toLowerCase();
    const st = document.getElementById("app-status").value;
    const tbody = document.getElementById("app-rows");
    const filtered = D.applications.filter((a) => {
      if (st && a.status !== st) return false;
      if (q && !(a.company.toLowerCase().includes(q) || a.program.toLowerCase().includes(q))) return false;
      return true;
    });
    tbody.innerHTML = filtered
      .slice(0, 300)
      .map(
        (a) => `
      <tr class="border-t border-slate-200">
        <td class="py-1.5 px-4">${a.company || "&ndash;"}</td>
        <td class="py-1.5 px-4">${a.program}</td>
        <td class="py-1.5 px-4">${a.consultant || "&ndash;"}</td>
        <td class="py-1.5 px-4">${a.status}</td>
        <td class="py-1.5 px-4 text-right">${a.requested_usd ? fmt$(a.requested_usd) : "&ndash;"}</td>
        <td class="py-1.5 px-4 text-right">${a.approved_usd ? fmt$(a.approved_usd) : "&ndash;"}</td>
        <td class="py-1.5 px-4">${a.date_applied || "&ndash;"}</td>
      </tr>`
      )
      .join("");
  }

  document.getElementById("app-search").addEventListener("input", renderAppRows);
  document.getElementById("app-status").addEventListener("change", renderAppRows);
  renderAppRows();

  function initTrendChart() {
    const ts = D.timeseries;
    if (!ts) return;
    const first = ts.applied[0]?.[0];
    const last = ts.applied[ts.applied.length - 1]?.[0];
    const fullRangeText = first && last ? `${first} to ${last}` : "";

    let metric = "applied";
    let groupBy = "day";
    let chartType = "bar";
    let period = { type: "all" };
    let chart;

    function scopeSeries(series, p) {
      if (p.type === "month") return series.filter(([d]) => d.slice(0, 7) === p.value);
      if (p.type === "range") return series.filter(([d]) => d >= p.start && d <= p.end);
      return series;
    }

    function groupSeries(series, by) {
      if (by === "day") return series;
      const buckets = {};
      for (const [dateStr, val] of series) {
        const d = new Date(dateStr);
        let key;
        if (by === "week") {
          const onejan = new Date(d.getFullYear(), 0, 1);
          const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
          key = d.getFullYear() + "-W" + week;
        } else {
          key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        }
        buckets[key] = (buckets[key] || 0) + val;
      }
      return Object.entries(buckets);
    }

    function updateGroupControls() {
      const wrap = document.querySelectorAll(".chart-group-btn");
      const singleDay = period.type === "range" && period.start === period.end;
      wrap.forEach((btn) => {
        btn.disabled = singleDay;
        btn.classList.toggle("opacity-40", singleDay);
        btn.classList.toggle("pointer-events-none", singleDay);
      });
      if (singleDay && groupBy !== "day") {
        groupBy = "day";
        wrap.forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
        document.querySelector('.chart-group-btn[data-g="day"]').classList.add("bg-slate-900", "text-white");
      }
    }

    function render() {
      updateGroupControls();
      const rawSeries = metric === "applied" ? ts.applied : ts.received;
      const scoped = scopeSeries(rawSeries, period);
      const grouped = groupSeries(scoped, groupBy);
      const labels = grouped.map((r) => r[0]);
      const values = grouped.map((r) => r[1]);
      const ctx = document.getElementById("trend-chart");
      const rangeEl = document.getElementById("chart-range");
      if (period.type === "all") rangeEl.textContent = fullRangeText;
      else if (period.type === "month") rangeEl.textContent = `Showing ${monthLabel(period.value)} only`;
      else rangeEl.textContent = `Showing ${period.start} to ${period.end}`;

      if (chart) chart.destroy();
      chart = new Chart(ctx, {
        type: chartType,
        data: {
          labels: labels.length ? labels : ["No data"],
          datasets: [
            {
              label: metric === "applied" ? "Applications submitted" : "Credits received $",
              data: values.length ? values : [0],
              borderColor: "#2563eb",
              backgroundColor: chartType === "line" ? "rgba(37,99,235,0.08)" : "#2563eb",
              pointRadius: chartType === "line" ? 3 : 0,
              pointBackgroundColor: "#2563eb",
              tension: 0.3,
              borderWidth: 2,
              fill: chartType === "line",
              maxBarThickness: 40,
            },
          ],
        },
        options: {
          plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10 } } },
          scales: {
            y: { beginAtZero: true, grid: { color: "#f1f1f1" } },
            x: { grid: { display: false } },
          },
        },
      });
    }

    document.getElementById("chart-metric").addEventListener("change", (e) => {
      metric = e.target.value;
      render();
    });
    document.querySelectorAll(".chart-group-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        document.querySelectorAll(".chart-group-btn").forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
        btn.classList.add("bg-slate-900", "text-white");
        groupBy = btn.dataset.g;
        render();
      });
    });
    document.querySelectorAll(".chart-type-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-type-btn").forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
        btn.classList.add("bg-slate-900", "text-white");
        chartType = btn.dataset.type;
        render();
      });
    });

    window.__updateTrendChart = (newPeriod) => {
      period = newPeriod;
      render();
    };

    render();
  }

  function computeProviderMetrics(provider, range) {
    const inR = (dateStr) => {
      if (!range) return true;
      if (!dateStr) return false;
      return dateStr >= range.start && dateStr <= range.end;
    };
    const touching = D.applications.filter(
      (a) => a.provider === provider && (inR(a.date_applied) || inR(a.date_received))
    );
    const total = touching.filter((a) => (range ? inR(a.date_applied) : true)).length;
    const received = touching.filter((a) => a.status === "Received" && (range ? inR(a.date_received) : true));
    const rejected = touching.filter((a) => a.status === "Rejected");
    const open = touching.filter((a) => OPEN_STATUSES.has(a.status) && (range ? inR(a.date_applied) : true));
    const receivedUsd = received.reduce((s, a) => s + (a.approved_usd || 0), 0);
    const pipelineUsd = open.reduce((s, a) => s + (a.requested_usd || 0), 0);
    const decided = received.length + rejected.length;
    const winRate = decided ? Math.round((received.length / decided) * 1000) / 10 : null;
    return { apps: touching, total, receivedCount: received.length, receivedUsd, pipelineUsd, winRate };
  }

  function initProviderTab() {
    const select = document.getElementById("provider-select");
    const startInput = document.getElementById("provider-start");
    const endInput = document.getElementById("provider-end");
    const statusFilter = document.getElementById("provider-status-filter");
    const programFilter = document.getElementById("provider-program-filter");
    const out = document.getElementById("provider-root");
    let providerChart;
    let providerMetric = "applied";
    let providerGroupBy = "day";
    let providerChartType = "bar";

    function groupProviderSeries(series, by) {
      if (by === "day") return series;
      const buckets = {};
      for (const [dateStr, val] of series) {
        const d = new Date(dateStr);
        let key;
        if (by === "week") {
          const onejan = new Date(d.getFullYear(), 0, 1);
          const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
          key = d.getFullYear() + "-W" + week;
        } else {
          key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        }
        buckets[key] = (buckets[key] || 0) + val;
      }
      return Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]));
    }

    function drawProviderChart(apps) {
      const appliedByDay = {};
      const receivedByDay = {};
      apps.forEach((a) => {
        if (a.date_applied) appliedByDay[a.date_applied] = (appliedByDay[a.date_applied] || 0) + 1;
        if (a.date_received && a.status === "Received") {
          receivedByDay[a.date_received] = (receivedByDay[a.date_received] || 0) + (a.approved_usd || 0);
        }
      });
      const appliedSeries = Object.entries(appliedByDay).sort((a, b) => a[0].localeCompare(b[0]));
      const receivedSeries = Object.entries(receivedByDay).sort((a, b) => a[0].localeCompare(b[0]));

      const rawSeries = providerMetric === "applied" ? appliedSeries : receivedSeries;
      const grouped = groupProviderSeries(rawSeries, providerGroupBy);
      const labels = grouped.map((r) => r[0]);
      const values = grouped.map((r) => r[1]);
      const ctx = document.getElementById("provider-chart");
      if (!ctx) return;
      if (providerChart) providerChart.destroy();
      providerChart = new Chart(ctx, {
        type: providerChartType,
        data: {
          labels: labels.length ? labels : ["No data"],
          datasets: [
            {
              label: providerMetric === "applied" ? "Applications submitted" : "Credits received $",
              data: values.length ? values : [0],
              borderColor: "#2563eb",
              backgroundColor: providerChartType === "line" ? "rgba(37,99,235,0.08)" : "#2563eb",
              pointRadius: providerChartType === "line" ? 3 : 0,
              pointBackgroundColor: "#2563eb",
              tension: 0.3,
              borderWidth: 2,
              fill: providerChartType === "line",
              maxBarThickness: 40,
            },
          ],
        },
        options: {
          plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10 } } },
          scales: {
            y: { beginAtZero: true, grid: { color: "#f1f1f1" } },
            x: { grid: { display: false } },
          },
        },
      });

      document.getElementById("provider-chart-metric").addEventListener("change", (e) => {
        providerMetric = e.target.value;
        drawProviderChart(apps);
      });
      document.querySelectorAll(".provider-chart-group-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".provider-chart-group-btn").forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
          btn.classList.add("bg-slate-900", "text-white");
          providerGroupBy = btn.dataset.g;
          drawProviderChart(apps);
        });
      });
      document.querySelectorAll(".provider-chart-type-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".provider-chart-type-btn").forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
          btn.classList.add("bg-slate-900", "text-white");
          providerChartType = btn.dataset.type;
          drawProviderChart(apps);
        });
      });
    }

    if (dataMin && dataMax) {
      startInput.min = dataMin;
      startInput.max = dataMax;
      endInput.min = dataMin;
      endInput.max = dataMax;
    }

    // Union of providers from both the applications log and the program catalog
    const providerSet = new Set();
    D.applications.forEach((a) => a.provider && providerSet.add(a.provider));
    D.programs.forEach((p) => p.provider && providerSet.add(p.provider));
    const providers = [...providerSet].sort((a, b) => a.localeCompare(b));

    providers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });

    // Status options: every status that actually appears in the data
    const statuses = [...new Set(D.applications.map((a) => a.status).filter(Boolean))].sort();
    statuses.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      statusFilter.appendChild(opt);
    });

    function populateProgramFilter(provider) {
      programFilter.innerHTML = "";
      const programNames = [...new Set(D.applications.filter((a) => a.provider === provider).map((a) => a.program).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b)
      );
      programNames.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        programFilter.appendChild(opt);
      });
    }

    function selectedValues(selectEl) {
      return [...selectEl.selectedOptions].map((o) => o.value);
    }

    function currentRange() {
      const s = startInput.value;
      const e = endInput.value;
      if (!s && !e) return null;
      return { start: s || dataMin, end: e || dataMax };
    }

    select.addEventListener("change", () => {
      populateProgramFilter(select.value);
      render(select.value);
    });
    [startInput, endInput].forEach((input) => input.addEventListener("change", () => render(select.value)));
    document.getElementById("provider-date-clear").addEventListener("click", () => {
      startInput.value = "";
      endInput.value = "";
      render(select.value);
    });
    statusFilter.addEventListener("change", () => render(select.value));
    programFilter.addEventListener("change", () => render(select.value));
    document.getElementById("provider-filter-clear").addEventListener("click", () => {
      [...statusFilter.options].forEach((o) => (o.selected = false));
      [...programFilter.options].forEach((o) => (o.selected = false));
      render(select.value);
    });

    function render(provider) {
      if (!provider) {
        out.innerHTML = `<p class="text-sm text-slate-500">Pick a provider above to see its programs, applications, and totals.</p>`;
        return;
      }

      const range = currentRange();
      const { apps: allApps } = computeProviderMetrics(provider, range);
      const activeStatuses = selectedValues(statusFilter);
      const activePrograms = selectedValues(programFilter);
      const apps = allApps
        .filter((a) => !activeStatuses.length || activeStatuses.includes(a.status))
        .filter((a) => !activePrograms.length || activePrograms.includes(a.program));

      const receivedApps = apps.filter((a) => a.status === "Received");
      const rejectedApps = apps.filter((a) => a.status === "Rejected");
      const openApps = apps.filter((a) => OPEN_STATUSES.has(a.status));
      const total = apps.length;
      const receivedCount = receivedApps.length;
      const receivedUsd = receivedApps.reduce((s, a) => s + (a.approved_usd || 0), 0);
      const pipelineUsd = openApps.reduce((s, a) => s + (a.requested_usd || 0), 0);
      const decided = receivedApps.length + rejectedApps.length;
      const winRate = decided ? Math.round((receivedApps.length / decided) * 1000) / 10 : null;

      const filterNote =
        activeStatuses.length || activePrograms.length
          ? ` (filtered${activeStatuses.length ? ` by status: ${activeStatuses.join(", ")}` : ""}${
              activePrograms.length ? `${activeStatuses.length ? ";" : ""} program: ${activePrograms.join(", ")}` : ""
            })`
          : "";

      const programs = D.programs.filter((p) => p.provider === provider && (!activePrograms.length || activePrograms.includes(p.program)));

      const programRows = programs
        .map(
          (p) => `
        <tr class="border-t border-slate-200">
          <td class="py-2 pr-4 font-medium">${p.program}</td>
          <td class="py-2 pr-4">${p.credit_amount || "&ndash;"}</td>
          <td class="py-2 pr-4">${p.tier || "&ndash;"}</td>
          <td class="py-2 pr-4 text-slate-600">${p.notes || "&ndash;"}</td>
        </tr>`
        )
        .join("");

      const appRows = apps
        .slice()
        .sort((a, b) => (b.date_applied || "").localeCompare(a.date_applied || ""))
        .map(
          (a) => `
        <tr class="border-t border-slate-200">
          <td class="py-1.5 px-4">${a.company || "&ndash;"}</td>
          <td class="py-1.5 px-4">${a.program}</td>
          <td class="py-1.5 px-4">${a.consultant || "&ndash;"}</td>
          <td class="py-1.5 px-4">${a.status}</td>
          <td class="py-1.5 px-4 text-right">${a.requested_usd ? fmt$(a.requested_usd) : "&ndash;"}</td>
          <td class="py-1.5 px-4 text-right">${a.approved_usd ? fmt$(a.approved_usd) : "&ndash;"}</td>
          <td class="py-1.5 px-4">${a.date_applied || "&ndash;"}</td>
        </tr>`
        )
        .join("");

      out.innerHTML = `
        <section class="mb-10">
          <h2 class="text-lg font-semibold mb-4">${provider}</h2>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-px bg-slate-200 border border-slate-200">
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Applications</p>
              <p class="text-xl font-semibold mt-1">${total}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Applications received</p>
              <p class="text-xl font-semibold mt-1">${receivedCount}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Received $</p>
              <p class="text-xl font-semibold mt-1">${fmt$(receivedUsd)}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Open pipeline $</p>
              <p class="text-xl font-semibold mt-1">${fmt$(pipelineUsd)}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Win rate</p>
              <p class="text-xl font-semibold mt-1">${winRate === null ? "&ndash;" : winRate + "%"}</p>
            </div>
          </div>
        </section>

        <section class="mb-10">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h3 class="text-base font-semibold">Applications &amp; credits over time &mdash; ${provider}</h3>
            <div class="flex items-center gap-3 no-print">
              <select id="provider-chart-metric" class="border border-slate-300 px-2 py-1.5 text-sm">
                <option value="applied" ${providerMetric === "applied" ? "selected" : ""}>Applications submitted</option>
                <option value="received" ${providerMetric === "received" ? "selected" : ""}>Credits received $</option>
              </select>
              <div class="flex border border-slate-300 overflow-hidden text-sm">
                <button class="provider-chart-group-btn px-3 py-1.5 ${providerGroupBy === "day" ? "bg-slate-900 text-white" : ""}" data-g="day">Day</button>
                <button class="provider-chart-group-btn px-3 py-1.5 ${providerGroupBy === "week" ? "bg-slate-900 text-white" : ""}" data-g="week">Week</button>
                <button class="provider-chart-group-btn px-3 py-1.5 ${providerGroupBy === "month" ? "bg-slate-900 text-white" : ""}" data-g="month">Month</button>
              </div>
              <div class="flex border border-slate-300 overflow-hidden text-sm">
                <button class="provider-chart-type-btn px-3 py-1.5 ${providerChartType === "line" ? "bg-slate-900 text-white" : ""}" data-type="line">Line</button>
                <button class="provider-chart-type-btn px-3 py-1.5 ${providerChartType === "bar" ? "bg-slate-900 text-white" : ""}" data-type="bar">Bar</button>
              </div>
            </div>
          </div>
          <canvas id="provider-chart" height="90"></canvas>
        </section>

        ${
          programs.length
            ? `<section class="mb-10">
          <h3 class="text-base font-semibold mb-1">Programs from ${provider}</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-300">
                  <th class="py-2 pr-4">Program</th><th class="py-2 pr-4">Credit amount</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Notes</th>
                </tr>
              </thead>
              <tbody>${programRows}</tbody>
            </table>
          </div>
        </section>`
            : ""
        }

        <section>
          <h3 class="text-base font-semibold mb-1">Applications to ${provider}</h3>
          <p class="text-sm text-slate-600 mb-3">${apps.length} row${apps.length === 1 ? "" : "s"}${range ? ` touching ${range.start} to ${range.end}` : ""}${filterNote}.</p>
          <div class="overflow-x-auto max-h-[28rem] overflow-y-auto border border-slate-200">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-white">
                <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-300">
                  <th class="py-2 px-4">Company</th><th class="py-2 px-4">Program</th>
                  <th class="py-2 px-4">Consultant</th><th class="py-2 px-4">Status</th>
                  <th class="py-2 px-4 text-right">Requested $</th><th class="py-2 px-4 text-right">Approved $</th>
                  <th class="py-2 px-4">Applied</th>
                </tr>
              </thead>
              <tbody>${appRows}</tbody>
            </table>
          </div>
        </section>`;

      drawProviderChart(apps);
    }

    render("");
  }

  function initCompareTab() {
    const providerSelect = document.getElementById("compare-providers");
    const aMonth = document.getElementById("compare-a-month");
    const aStart = document.getElementById("compare-a-start");
    const aEnd = document.getElementById("compare-a-end");
    const bMonth = document.getElementById("compare-b-month");
    const bStart = document.getElementById("compare-b-start");
    const bEnd = document.getElementById("compare-b-end");
    let chartMetric = "applied";
    let chartGroupBy = "day";
    let compareChartType = "bar";
    let compareChart;

    // Providers that actually have at least one logged application (comparison is about real activity)
    const providerCounts = new Map();
    D.applications.forEach((a) => {
      if (!a.provider) return;
      providerCounts.set(a.provider, (providerCounts.get(a.provider) || 0) + 1);
    });
    const activeProviders = [...providerCounts.keys()].sort((a, b) => a.localeCompare(b));
    activeProviders.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = `${p} (${providerCounts.get(p)})`;
      providerSelect.appendChild(opt);
    });

    [aMonth, bMonth].forEach((sel) => {
      months.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = monthLabel(m);
        sel.appendChild(opt);
      });
    });
    [aStart, aEnd, bStart, bEnd].forEach((input) => {
      if (dataMin && dataMax) {
        input.min = dataMin;
        input.max = dataMax;
      }
    });

    function periodFor(monthSel, startInput, endInput) {
      const s = startInput.value;
      const e = endInput.value;
      if (s || e) return { start: s || dataMin, end: e || dataMax };
      const m = monthSel.value;
      if (m) return { start: `${m}-01`, end: `${m}-31` };
      return null;
    }

    function periodLabelFor(monthSel, startInput, endInput, emptyLabel) {
      const s = startInput.value;
      const e = endInput.value;
      if (s || e) return `${s || dataMin} to ${e || dataMax}`;
      const m = monthSel.value;
      if (m) return monthLabel(m);
      return emptyLabel;
    }

    function selectedProviders() {
      const picked = [...providerSelect.selectedOptions].map((o) => o.value);
      return picked.length ? picked : activeProviders;
    }

    const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

    function render() {
      const rangeA = periodFor(aMonth, aStart, aEnd);
      const rangeB = periodFor(bMonth, bStart, bEnd);
      const hasB = Boolean(bMonth.value || bStart.value || bEnd.value);
      const providers = selectedProviders();

      const labelA = periodLabelFor(aMonth, aStart, aEnd, "All time");
      const labelB = hasB ? periodLabelFor(bMonth, bStart, bEnd, "All time") : null;
      document.getElementById("compare-period-label").textContent = hasB
        ? `Period A: ${labelA}  vs  Period B: ${labelB}  \u00b7  ${providers.length} provider${providers.length === 1 ? "" : "s"}`
        : `${labelA} \u00b7 ${providers.length} provider${providers.length === 1 ? "" : "s"}`;

      drawCompareChart(providers, rangeA, rangeB, hasB, labelA, labelB);
    }

    function offsetSeriesFor(range, providers, metric, groupBy) {
      const start = new Date((range && range.start) || dataMin);
      const end = new Date((range && range.end) || dataMax);
      const providerSet = new Set(providers);
      const byOffset = {};
      let maxOffset = 0;
      D.applications.forEach((a) => {
        if (!providerSet.has(a.provider)) return;
        let dateStr, val;
        if (metric === "applied") {
          dateStr = a.date_applied;
          val = 1;
        } else {
          if (a.status !== "Received") return;
          dateStr = a.date_received;
          val = a.approved_usd || 0;
        }
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (d < start || d > end) return;
        const days = Math.round((d - start) / 86400000);
        let offset;
        if (groupBy === "day") offset = days;
        else if (groupBy === "week") offset = Math.floor(days / 7);
        else offset = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
        byOffset[offset] = (byOffset[offset] || 0) + val;
        if (offset > maxOffset) maxOffset = offset;
      });
      const totalSpanDays = Math.max(0, Math.round((end - start) / 86400000));
      const spanInUnits =
        groupBy === "day"
          ? totalSpanDays
          : groupBy === "week"
          ? Math.floor(totalSpanDays / 7)
          : (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      const lastOffset = Math.max(maxOffset, spanInUnits, 0);
      const points = [];
      for (let i = 0; i <= lastOffset; i++) points.push({ x: i, y: byOffset[i] || 0 });
      return points;
    }

    function drawCompareChart(providers, rangeA, rangeB, hasB, labelA, labelB) {
      const unitLabel = chartGroupBy === "day" ? "Day" : chartGroupBy === "week" ? "Week" : "Month";
      const seriesA = offsetSeriesFor(rangeA, providers, chartMetric, chartGroupBy);
      const seriesB = hasB ? offsetSeriesFor(rangeB, providers, chartMetric, chartGroupBy) : [];
      const maxLen = Math.max(seriesA.length, seriesB.length);
      const labels = Array.from({ length: maxLen }, (_, i) => `${unitLabel} ${i + 1}`);

      const datasets = [
        {
          label: `Period A (${labelA})`,
          data: seriesA.map((p) => p.y),
          borderColor: PALETTE[0],
          backgroundColor: compareChartType === "line" ? "transparent" : PALETTE[0],
          pointRadius: compareChartType === "line" ? 2.5 : 0,
          tension: 0.3,
          borderWidth: 2,
          maxBarThickness: 28,
        },
      ];
      if (hasB) {
        datasets.push({
          label: `Period B (${labelB})`,
          data: seriesB.map((p) => p.y),
          borderColor: PALETTE[1],
          backgroundColor: compareChartType === "line" ? "transparent" : PALETTE[1],
          pointRadius: compareChartType === "line" ? 2.5 : 0,
          tension: 0.3,
          borderWidth: 2,
          maxBarThickness: 28,
        });
      }

      const ctx = document.getElementById("compare-chart");
      if (compareChart) compareChart.destroy();
      document.getElementById("compare-chart-caption").textContent =
        compareChartType === "line"
          ? "Lines are aligned by day/week/month since each period's own start date, so Period A and Period B line up even when their calendar dates differ — e.g. Day 1 of September vs Day 1 of October."
          : "Bars are aligned by day/week/month since each period's own start date, so Period A and Period B line up even when their calendar dates differ — e.g. Day 1 of September vs Day 1 of October.";
      compareChart = new Chart(ctx, {
        type: compareChartType,
        data: { labels, datasets },
        options: {
          plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10 } } },
          scales: {
            x: {
              grid: { display: false },
              title: { display: true, text: `${unitLabel}s since period start` },
            },
            y: { beginAtZero: true, grid: { color: "#f1f1f1" } },
          },
        },
      });
    }

    providerSelect.addEventListener("change", render);
    aMonth.addEventListener("change", () => {
      if (aMonth.value) {
        aStart.value = "";
        aEnd.value = "";
      }
      render();
    });
    [aStart, aEnd].forEach((input) =>
      input.addEventListener("change", () => {
        if (input.value) aMonth.value = "";
        render();
      })
    );
    document.getElementById("compare-a-clear").addEventListener("click", () => {
      aMonth.value = "";
      aStart.value = "";
      aEnd.value = "";
      render();
    });
    bMonth.addEventListener("change", () => {
      if (bMonth.value) {
        bStart.value = "";
        bEnd.value = "";
      }
      render();
    });
    [bStart, bEnd].forEach((input) =>
      input.addEventListener("change", () => {
        if (input.value) bMonth.value = "";
        render();
      })
    );
    document.getElementById("compare-b-clear").addEventListener("click", () => {
      bMonth.value = "";
      bStart.value = "";
      bEnd.value = "";
      render();
    });
    document.getElementById("compare-chart-metric").addEventListener("change", (e) => {
      chartMetric = e.target.value;
      render();
    });
    document.querySelectorAll(".compare-chart-group-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".compare-chart-group-btn").forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
        btn.classList.add("bg-slate-900", "text-white");
        chartGroupBy = btn.dataset.g;
        render();
      });
    });
    document.querySelectorAll(".compare-chart-type-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".compare-chart-type-btn").forEach((b) => b.classList.remove("bg-slate-900", "text-white"));
        btn.classList.add("bg-slate-900", "text-white");
        compareChartType = btn.dataset.type;
        render();
      });
    });

    render();
  }

  function initWebsiteTab() {
    const select = document.getElementById("website-select");
    const out = document.getElementById("website-root");

    const websiteCounts = new Map();
    D.applications.forEach((a) => {
      if (!a.company) return;
      websiteCounts.set(a.company, (websiteCounts.get(a.company) || 0) + 1);
    });
    const websites = [...websiteCounts.keys()].sort((a, b) => a.localeCompare(b));
    websites.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = `${w} (${websiteCounts.get(w)})`;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => render(select.value));

    function render(website) {
      if (!website) {
        out.innerHTML = `<p class="text-sm text-slate-500">Pick a website/company above to see every provider it applied to, when, and its current status.</p>`;
        return;
      }

      const apps = D.applications
        .filter((a) => a.company === website)
        .slice()
        .sort((a, b) => (b.date_applied || "").localeCompare(a.date_applied || ""));

      const total = apps.length;
      const receivedApps = apps.filter((a) => a.status === "Received");
      const receivedUsd = receivedApps.reduce((s, a) => s + (a.approved_usd || 0), 0);
      const open = apps.filter((a) => OPEN_STATUSES.has(a.status));

      const STATUS_STYLES = {
        Received: "bg-green-50 text-green-700",
        Rejected: "bg-red-50 text-red-700",
        "Blocked / unable to apply": "bg-amber-50 text-amber-700",
        Blocked: "bg-amber-50 text-amber-700",
        "Action required": "bg-amber-50 text-amber-700",
      };

      const rows = apps
        .map((a) => {
          const badge = STATUS_STYLES[a.status] || "bg-slate-100 text-slate-600";
          return `
        <tr class="border-t border-slate-200">
          <td class="py-2 pr-4 font-medium">${a.provider || "&ndash;"}</td>
          <td class="py-2 pr-4">${a.program}</td>
          <td class="py-2 pr-4"><span class="inline-block px-2 py-0.5 rounded text-xs ${badge}">${a.status || "&ndash;"}</span></td>
          <td class="py-2 pr-4">${a.date_applied || "&ndash;"}</td>
          <td class="py-2 pr-4">${a.date_received || "&ndash;"}</td>
          <td class="py-2 pr-4 text-right">${a.requested_usd ? fmt$(a.requested_usd) : "&ndash;"}</td>
          <td class="py-2 pr-4 text-right">${a.approved_usd ? fmt$(a.approved_usd) : "&ndash;"}</td>
          <td class="py-2 pr-4">${a.next_action || "&ndash;"}</td>
        </tr>`;
        })
        .join("");

      out.innerHTML = `
        <section class="mb-8">
          <h2 class="text-lg font-semibold mb-4">${website}</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Applications</p>
              <p class="text-xl font-semibold mt-1">${total}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Applications received</p>
              <p class="text-xl font-semibold mt-1">${receivedApps.length}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Received $</p>
              <p class="text-xl font-semibold mt-1">${fmt$(receivedUsd)}</p>
            </div>
            <div class="bg-white p-4">
              <p class="text-xs text-slate-500">Open applications</p>
              <p class="text-xl font-semibold mt-1">${open.length}</p>
            </div>
          </div>
        </section>

        <section>
          <h3 class="text-base font-semibold mb-1">Providers applied to</h3>
          <p class="text-sm text-slate-600 mb-3">${total} row${total === 1 ? "" : "s"}, newest first.</p>
          <div class="overflow-x-auto max-h-[32rem] overflow-y-auto border border-slate-200">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-white">
                <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-300">
                  <th class="py-2 px-4">Provider</th><th class="py-2 px-4">Program</th>
                  <th class="py-2 px-4">Status</th><th class="py-2 px-4">Applied</th><th class="py-2 px-4">Received</th>
                  <th class="py-2 px-4 text-right">Requested $</th><th class="py-2 px-4 text-right">Approved $</th>
                  <th class="py-2 px-4">Next action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>`;
    }

    render("");
  }
})();
