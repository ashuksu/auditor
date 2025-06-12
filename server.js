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
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR);
}

async function loadLighthouse() {
    const {default: lighthouse} = await import('lighthouse');
    return lighthouse;
}

const baseConfig = {
    extends: 'lighthouse:default',
    settings: {
        throttlingMethod: 'provided',
        disableStorageReset: true,
        onlyCategories: ['performance', 'seo', 'accessibility', 'best-practices'],
    },
};

async function runAudit(lighthouse, url, device, chromePort) {
    const config = JSON.parse(JSON.stringify(baseConfig));
    config.settings.emulatedFormFactor = device;
    if (device === 'desktop') {
        config.settings.screenEmulation = {disabled: true};
    }

    const options = {
        port: chromePort,
        output: 'html',
        logLevel: 'info',
    };

    const runnerResult = await lighthouse(url, options, config);
    const audit = runnerResult.lhr;

    const parsedUrl = new URL(url);
    const safeName = parsedUrl.hostname.replace(/\./g, '_');
    const fileName = `report_${safeName}_${device}_${Date.now()}.html`;
    const filePath = path.join(REPORTS_DIR, fileName);
    fs.writeFileSync(filePath, runnerResult.report);

    return {
        reportLink: `/reports/${fileName}`,
        scores: {
            performance: audit.categories.performance.score * 100,
            seo: audit.categories.seo.score * 100,
            accessibility: audit.categories.accessibility.score * 100,
            bestPractices: audit.categories['best-practices'].score * 100,
        },
        metrics: {
            fcp: audit.audits['first-contentful-paint'].numericValue,
            lcp: audit.audits['largest-contentful-paint'].numericValue,
            tbt: audit.audits['total-blocking-time'].numericValue,
            si: audit.audits['speed-index'].numericValue,
            cls: audit.audits['cumulative-layout-shift'].numericValue,
        },
    };
}

app.post('/audit', async (req, res) => {
    const urls = req.body.urls || [];
    if (!urls.length) {
        return res.status(400).json({error: 'No URLs provided'});
    }

    const lighthouse = await loadLighthouse();
    const allResults = [];
    let chrome;

    try {
        chrome = await chromeLauncher.launch({
            chromeFlags: [
                '--headless=new',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
            ],
        });

        for (const rawUrl of urls) {
            const url = rawUrl.trim();
            if (!url) continue;

            for (const device of ['mobile', 'desktop']) {
                const passResults = {
                    scores: {performance: [], seo: [], accessibility: [], bestPractices: []},
                    metrics: {fcp: [], lcp: [], tbt: [], si: [], cls: []},
                    reports: [],
                };

                for (let i = 0; i < 3; i++) {
                    try {
                        const result = await runAudit(lighthouse, url, device, chrome.port);
                        passResults.reports.push(result.reportLink);
                        for (const key in result.scores) {
                            passResults.scores[key].push(result.scores[key]);
                        }
                        for (const key in result.metrics) {
                            passResults.metrics[key].push(result.metrics[key]);
                        }
                    } catch (err) {
                        console.error(`Audit error for ${url} (${device}, pass ${i + 1}):`, err.message);
                    }
                }

                if (passResults.reports.length === 0) continue;

                const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
                const stddev = arr => {
                    const mean = avg(arr);
                    const sqDiffs = arr.map(v => Math.pow(v - mean, 2));
                    return Math.sqrt(avg(sqDiffs));
                };

                allResults.push({
                    url,
                    device,
                    averageScores: {
                        performance: avg(passResults.scores.performance),
                        seo: avg(passResults.scores.seo),
                        accessibility: avg(passResults.scores.accessibility),
                        bestPractices: avg(passResults.scores.bestPractices),
                    },
                    stdScores: {
                        performance: stddev(passResults.scores.performance),
                        seo: stddev(passResults.scores.seo),
                        accessibility: stddev(passResults.scores.accessibility),
                        bestPractices: stddev(passResults.scores.bestPractices),
                    },
                    averageMetrics: {
                        fcp: avg(passResults.metrics.fcp),
                        lcp: avg(passResults.metrics.lcp),
                        tbt: avg(passResults.metrics.tbt),
                        si: avg(passResults.metrics.si),
                        cls: avg(passResults.metrics.cls),
                    },
                    stdMetrics: {
                        fcp: stddev(passResults.metrics.fcp),
                        lcp: stddev(passResults.metrics.lcp),
                        tbt: stddev(passResults.metrics.tbt),
                        si: stddev(passResults.metrics.si),
                        cls: stddev(passResults.metrics.cls),
                    },
                    reports: passResults.reports,
                });
            }
        }
        res.json({results: allResults});
    } catch (error) {
        console.error('General audit process error:', error);
        res.status(500).json({error: 'An internal server error occurred.'});
    } finally {
        if (chrome) {
            await chrome.kill();
        }
    }
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
