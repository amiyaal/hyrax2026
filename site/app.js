const records = window.HYRAX_RECORDS || [];

const filters = [
  { key: "site", label: "Site" },
  { key: "groupName", label: "Group" },
  { key: "sex", label: "Sex" },
  { key: "ageClass", label: "Age" }
];

const filterState = Object.fromEntries(filters.map(({ key }) => [key, "All"]));

const elements = {
  summaryGrid: document.querySelector("#summary-grid"),
  filters: document.querySelector("#filters"),
  sexChart: document.querySelector("#sex-chart"),
  ageChart: document.querySelector("#age-chart"),
  siteChart: document.querySelector("#site-chart"),
  cumulativeChart: document.querySelector("#cumulative-chart"),
  weightChart: document.querySelector("#weight-chart"),
  weightBySexChart: document.querySelector("#weight-by-sex-chart"),
  lengthByAgeChart: document.querySelector("#length-by-age-chart"),
  recordsTable: document.querySelector("#records-table"),
  tableCount: document.querySelector("#table-count")
};

function uniqueValues(key) {
  return ["All", ...new Set(records.map((record) => record[key] || "Unknown"))];
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value, digits = 1) {
  return value == null ? "n/a" : value.toFixed(digits);
}

function safeMax(values) {
  return values.length ? Math.max(...values) : 1;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const bucket = item[key] || "Unknown";
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
}

function averageBy(items, key, numericKey) {
  const groups = {};
  for (const item of items) {
    const bucket = item[key] || "Unknown";
    const value = numberOrNull(item[numericKey]);
    if (value == null) continue;
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(value);
  }
  return Object.fromEntries(
    Object.entries(groups).map(([bucket, values]) => [bucket, mean(values)])
  );
}

function filteredRecords() {
  return records.filter((record) =>
    filters.every(({ key }) => {
      const chosen = filterState[key];
      return chosen === "All" ? true : (record[key] || "Unknown") === chosen;
    })
  );
}

function renderFilters() {
  elements.filters.innerHTML = "";
  filters.forEach(({ key, label }) => {
    const wrapper = document.createElement("div");
    wrapper.className = "filter";

    const prompt = document.createElement("label");
    prompt.textContent = label;

    const select = document.createElement("select");
    uniqueValues(key).forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (value === filterState[key]) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener("change", (event) => {
      filterState[key] = event.target.value;
      render();
    });

    wrapper.append(prompt, select);
    elements.filters.appendChild(wrapper);
  });
}

function renderSummary(items) {
  const weights = items.map((item) => numberOrNull(item.weightKg)).filter(Boolean);
  const lengths = items
    .map((item) => numberOrNull(item.bodyLengthCm))
    .filter(Boolean);
  const knownSex = items.filter((item) => item.sex !== "Unknown");
  const females = knownSex.filter((item) => item.sex === "F").length;
  const males = knownSex.filter((item) => item.sex === "M").length;
  const juvenileShare =
    items.filter((item) => item.ageClass === "J").length / (items.length || 1);

  const cards = [
    {
      label: "Filtered records",
      value: String(items.length),
      meta: `${records.length} total scanned sheets in the cleaned table`
    },
    {
      label: "Average weight",
      value: `${formatNumber(mean(weights), 2)} kg`,
      meta: `${weights.length} records with readable weights`
    },
    {
      label: "Known sex split",
      value: `${females}F / ${males}M`,
      meta: `${knownSex.length} records with legible sex annotation`
    },
    {
      label: "Juvenile share",
      value: `${Math.round(juvenileShare * 100)}%`,
      meta: `Average body length ${formatNumber(mean(lengths), 1)} cm`
    }
  ];

  elements.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="panel summary-card">
          <div>
            <p class="section-label">${card.label}</p>
            <div class="value">${card.value}</div>
          </div>
          <p class="meta">${card.meta}</p>
        </article>
      `
    )
    .join("");
}

function renderBarChart(container, entries, maxValue, formatter = (value) => value) {
  container.innerHTML = entries
    .map(
      ([label, value]) => `
        <div class="metric-row">
          <div class="label">${label}</div>
          <div class="track"><div class="fill" style="width: ${
            maxValue ? (value / maxValue) * 100 : 0
          }%"></div></div>
          <div class="value-tag">${formatter(value)}</div>
        </div>
      `
    )
    .join("");
}

function renderWeightHistogram(items) {
  const weights = items
    .map((item) => numberOrNull(item.weightKg))
    .filter((value) => value != null);
  const bins = [
    [1.25, 1.75],
    [1.75, 2.25],
    [2.25, 2.75],
    [2.75, 3.25],
    [3.25, 3.75]
  ];

  const counts = bins.map(([min, max], index) => {
    const count = weights.filter((weight) =>
      index === bins.length - 1
        ? weight >= min && weight <= max
        : weight >= min && weight < max
    ).length;
    return { label: `${min.toFixed(2)}-${max.toFixed(2)}`, count };
  });

  const maxCount = Math.max(...counts.map((item) => item.count), 1);

  elements.weightChart.innerHTML = counts
    .map(
      ({ label, count }) => `
        <div class="hist-bar">
          <div class="count">${count}</div>
          <div class="bar" style="height: ${(count / maxCount) * 150 + 6}px"></div>
          <div class="label">${label}</div>
        </div>
      `
    )
    .join("");
}

function renderCumulativeChart(items) {
  const counts = countBy(items, "captureDate");
  const series = Object.entries(counts)
    .filter(([date]) => date && date !== "Unknown")
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count], index, array) => ({
      date,
      dailyCount: count,
      cumulative:
        count + array.slice(0, index).reduce((sum, [, previous]) => sum + previous, 0)
    }));

  if (!series.length) {
    elements.cumulativeChart.innerHTML =
      '<p class="line-chart-caption">No dated records are available for the current filter.</p>';
    return;
  }

  const width = 900;
  const height = 280;
  const margin = { top: 20, right: 70, bottom: 44, left: 52 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxY = safeMax(series.map((point) => point.cumulative));
  const xStep = series.length === 1 ? 0 : innerWidth / (series.length - 1);

  const points = series.map((point, index) => {
    const x = margin.left + index * xStep;
    const y =
      margin.top + innerHeight - ((point.cumulative / maxY) * innerHeight || 0);
    const labelAnchor =
      series.length === 1
        ? "middle"
        : index === 0
          ? "start"
          : index === series.length - 1
            ? "end"
            : "middle";
    return { ...point, x, y, labelAnchor };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const yTicks = Array.from({ length: Math.min(maxY, 5) + 1 }, (_, index) => {
    const value = Math.round((index / Math.min(maxY, 5 || 1)) * maxY);
    return value;
  }).filter((value, index, array) => array.indexOf(value) === index);

  elements.cumulativeChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative trapped hyraxes by date">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
      ${yTicks
        .map((tick) => {
          const y = margin.top + innerHeight - ((tick / maxY) * innerHeight || 0);
          return `
            <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="rgba(77, 60, 42, 0.12)" stroke-width="1"></line>
            <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="var(--muted)" font-size="12">${tick}</text>
          `;
        })
        .join("")}
      <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="rgba(77, 60, 42, 0.25)" stroke-width="1.5"></line>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" stroke="rgba(77, 60, 42, 0.25)" stroke-width="1.5"></line>
      <path d="${path}" fill="none" stroke="var(--accent-deep)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${points
        .map(
          (point) => `
            <circle cx="${point.x}" cy="${point.y}" r="5" fill="var(--sage)"></circle>
            <text x="${point.x}" y="${height - 16}" text-anchor="${point.labelAnchor}" fill="var(--muted)" font-size="12">${point.date}</text>
            <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" fill="var(--ink)" font-size="12">${point.cumulative}</text>
          `
        )
        .join("")}
    </svg>
    <p class="line-chart-caption">Cumulative count uses the inferred capture date field from the cleaned table.</p>
  `;
}

function renderTable(items) {
  elements.tableCount.textContent = `${items.length} record${
    items.length === 1 ? "" : "s"
  } shown`;

  if (!items.length) {
    elements.recordsTable.innerHTML = `
      <tr>
        <td colspan="11">No records match the current filters.</td>
      </tr>
    `;
    return;
  }

  elements.recordsTable.innerHTML = items
    .map(
      (record) => `
        <tr>
          <td>
            ${record.recordId}
          </td>
          <td>
            <a class="record-link" href="${record.imageFile}">open</a>
          </td>
          <td>${record.site}</td>
          <td>${record.groupName}</td>
          <td>${record.chip || '<span class="missing">not read</span>'}</td>
          <td>${record.collar || '<span class="missing">blank / unreadable</span>'}</td>
          <td>${record.sex}</td>
          <td>${record.ageClass}</td>
          <td>${formatNumber(record.weightKg, 2)}</td>
          <td><span class="pill ${record.quality}">${record.quality}</span></td>
          <td class="notes-cell">${record.notes}</td>
        </tr>
      `
    )
    .join("");
}

function render() {
  const items = filteredRecords();

  renderSummary(items);

  const sexCounts = Object.entries(countBy(items, "sex"));
  const ageCounts = Object.entries(countBy(items, "ageClass"));
  const siteCounts = Object.entries(countBy(items, "site")).sort((a, b) => b[1] - a[1]);
  const avgWeightBySex = Object.entries(averageBy(items, "sex", "weightKg"));
  const avgLengthByAge = Object.entries(averageBy(items, "ageClass", "bodyLengthCm"));

  renderBarChart(
    elements.sexChart,
    sexCounts,
    safeMax(sexCounts.map((entry) => entry[1]))
  );
  renderBarChart(
    elements.ageChart,
    ageCounts,
    safeMax(ageCounts.map((entry) => entry[1]))
  );
  renderBarChart(
    elements.siteChart,
    siteCounts,
    safeMax(siteCounts.map((entry) => entry[1]))
  );
  renderCumulativeChart(items);
  renderBarChart(
    elements.weightBySexChart,
    avgWeightBySex,
    safeMax(avgWeightBySex.map((entry) => entry[1])),
    (value) => `${formatNumber(value, 2)} kg`
  );
  renderBarChart(
    elements.lengthByAgeChart,
    avgLengthByAge,
    safeMax(avgLengthByAge.map((entry) => entry[1])),
    (value) => `${formatNumber(value, 1)} cm`
  );

  renderWeightHistogram(items);
  renderTable(items);
}

renderFilters();
render();
