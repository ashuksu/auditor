// ====== server.js ======
const express = require('express');
const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const {URL} = require('url');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR);

async function loadLighthouse() {
    const {default: lighthouse} = await import('lighthouse');
    return lighthouse;
}

const baseConfig = {
    extends: 'lighthouse:default',
    settings: {
        throttlingMethod: 'provided',
        disableStorageReset: true,
        onlyCategories: ['performance', 'seo', 'accessibility', 'best-practices']
    }
};

app.post('/audit', async (req, res) => {
    const urls = req.body.urls || [];
    const results = [];
    const lighthouse = await loadLighthouse();

    for (const rawUrl of urls) {
        for (const device of ['mobile', 'desktop']) {
            const url = rawUrl.trim();
            if (!url) continue;

            const scores = {performance: [], seo: [], accessibility: [], bestPractices: []};
            const metrics = {fcp: [], lcp: [], tbt: [], si: [], cls: []};
            const reportLinks = [];

            for (let i = 0; i < 5; i++) {
                try {
                    const chrome = await chromeLauncher.launch({
                        chromeFlags: [
                            '--headless=new',
                            '--no-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--disable-setuid-sandbox',
                            '--window-size=1920,1080'
                        ]
                    });

                    const options = {
                        port: chrome.port,
                        output: 'html',
                        logLevel: 'info'
                    };

                    const config = JSON.parse(JSON.stringify(baseConfig));
                    config.settings.emulatedFormFactor = device;
                    device === 'desktop' && (config.settings.screenEmulation = {disabled: true});

                    const runnerResult = await lighthouse(url, options, config);
                    const audit = runnerResult.lhr;

                    scores.performance.push(audit.categories.performance.score * 100);
                    scores.seo.push(audit.categories.seo.score * 100);
                    scores.accessibility.push(audit.categories.accessibility.score * 100);
                    scores.bestPractices.push(audit.categories['best-practices'].score * 100);

                    metrics.fcp.push(audit.audits['first-contentful-paint'].numericValue);
                    metrics.lcp.push(audit.audits['largest-contentful-paint'].numericValue);
                    metrics.tbt.push(audit.audits['total-blocking-time'].numericValue);
                    metrics.si.push(audit.audits['speed-index'].numericValue);
                    metrics.cls.push(audit.audits['cumulative-layout-shift'].numericValue);

                    const parsedUrl = new URL(url);
                    const safeName = parsedUrl.hostname.replace(/\./g, '_');
                    const fileName = `report_${safeName}_${device}_${Date.now()}_${i + 1}.html`;
                    const filePath = path.join(REPORTS_DIR, fileName);
                    fs.writeFileSync(filePath, runnerResult.report);

                    reportLinks.push(`/reports/${fileName}`);

                    await chrome.kill();
                } catch (err) {
                    console.error(`Audit error (${url} / ${device}):`, err.message);
                }
            }

            const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
            const stddev = arr => {
                const mean = avg(arr);
                const sqDiffs = arr.map(v => Math.pow(v - mean, 2));
                return arr.length ? Math.sqrt(avg(sqDiffs)) : 0;
            };

            results.push({
                url,
                device,
                averageScores: {
                    performance: avg(scores.performance),
                    seo: avg(scores.seo),
                    accessibility: avg(scores.accessibility),
                    bestPractices: avg(scores.bestPractices)
                },
                stdScores: {
                    performance: stddev(scores.performance),
                    seo: stddev(scores.seo),
                    accessibility: stddev(scores.accessibility),
                    bestPractices: stddev(scores.bestPractices)
                },
                averageMetrics: {
                    fcp: avg(metrics.fcp),
                    lcp: avg(metrics.lcp),
                    tbt: avg(metrics.tbt),
                    si: avg(metrics.si),
                    cls: avg(metrics.cls)
                },
                stdMetrics: {
                    fcp: stddev(metrics.fcp),
                    lcp: stddev(metrics.lcp),
                    tbt: stddev(metrics.tbt),
                    si: stddev(metrics.si),
                    cls: stddev(metrics.cls)
                },
                reports: reportLinks
            });
        }
    }

    res.json({results});
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
