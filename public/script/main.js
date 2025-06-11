function formatMs(ms) {
    if (ms === null || isNaN(ms)) return '—';
    return ms > 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
}

function formatCls(value) {
    if (value == null || isNaN(value)) return '—';
    return value.toFixed(3);
}

document.getElementById('audit-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const textarea = e.target.elements.urls;
    const urls = textarea.value
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
            let url = line.trim();
            if (!/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
            }
            return url;
        });

    const loader = document.getElementById('loader');
    const results = document.getElementById('results');

    if (!urls.length) {
        alert('Please enter at least one URL.');
        return;
    }

    loader.style.display = 'block';
    results.innerHTML = '';

    try {
        const response = await fetch('/audit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({urls})
        });

        const data = await response.json();
        loader.style.display = 'none';

        if (!data.results || data.results.length === 0) {
            results.innerHTML = '<p>No audit results available.</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
        <caption>Average Lighthouse Audit Results (3 passes)</caption>
        <thead>
          <tr>
            <th>URL</th>
            <th>Device</th>
            <th>Perf. (± 3)</th>
            <th>SEO (± 3)</th>
            <th>Access. (± 3)</th>
            <th>Best Practices (± 3)</th>
            <th>FCP</th>
            <th>LCP</th>
            <th>TBT</th>
            <th>SI</th>
            <th>CLS</th>
            <th>Reports</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

        const tbody = table.querySelector('tbody');

        const fmtScore = (mean, std) => `${mean.toFixed(1)}% ± ${std.toFixed(1)}`;

        data.results.forEach(item => {
            console.log(item)

            const tr = document.createElement('tr');

            const reportsLinks = item.reports
                .map((r, i) => `<a class="report-link" href="${r}" target="_blank">Rapport ${i + 1}</a>`)
                .join('<br>');

            tr.innerHTML = `
          <td>${item.url}</td>
          <td>${item.device}</td>
          <td>${fmtScore(item.averageScores.performance, item.stdScores.performance)}</td>
          <td>${fmtScore(item.averageScores.seo, item.stdScores.seo)}</td>
          <td>${fmtScore(item.averageScores.accessibility, item.stdScores.accessibility)}</td>
          <td>${fmtScore(item.averageScores.bestPractices, item.stdScores.bestPractices)}</td>
          <td>${formatMs(item.averageMetrics.fcp)} ± ${formatMs(item.stdMetrics.fcp)}</td>
          <td>${formatMs(item.averageMetrics.lcp)} ± ${formatMs(item.stdMetrics.lcp)}</td>
          <td>${formatMs(item.averageMetrics.tbt)} ± ${formatMs(item.stdMetrics.tbt)}</td>
          <td>${formatMs(item.averageMetrics.si)} ± ${formatMs(item.stdMetrics.si)}</td>
          <td>${formatCls(item.averageMetrics.cls)} ± ${formatCls(item.stdMetrics.cls)}</td>
          <td>${reportsLinks}</td>
        `;

            tbody.appendChild(tr);
        });

        results.appendChild(table);
    } catch (error) {
        loader.style.display = 'none';
        console.error('Error:', error);
        alert("Error during audit. Check the console.");
    }
});