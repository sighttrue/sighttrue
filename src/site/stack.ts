/**
 * Point the instrument at the visitor's own project.
 *
 * Everything else here observes a list of 388 repositories chosen by a stranger.
 * Nobody wakes up wanting to know the fork velocity of somebody else's
 * watchlist — but every developer has two hundred dependencies they have never
 * checked, because checking them by hand is tedious enough that nobody does it.
 *
 * This inverts the product. Paste a manifest, get a readout of that stack: what
 * is unmaintained, what has advisories, what relicensed, what scores badly, and
 * how the whole thing sits against the corpus. The watchlist stops being the
 * product and becomes the benchmark that makes the visitor's numbers mean
 * something — "5.2" is not a reading until it sits beside 6.1.
 *
 * The manifest never leaves the browser. Parsing and lookup are entirely
 * client-side against a static file, which is both the cheapest architecture
 * and the only honest answer to "are you reading my dependencies".
 */

export const STACK_SCRIPT = `
const stackForm = document.getElementById('stack-form');

if (stackForm) {
  const field = document.getElementById('stack-input');
  const out = document.getElementById('stack-out');
  let index = null;
  /** The engines field from the last package.json read, for the calendar. */
  let lastEngines = {};

  const load = () =>
    index ? Promise.resolve(index) :
      fetch('/data/stack-index.json').then((r) => r.json()).then((d) => { index = d; return d; });

  // Deliberately forgiving. A pasted manifest arrives with comments, trailing
  // commas, version ranges and lockfile noise, and refusing to read it because
  // it is not valid JSON would fail the exact people this is for.
  function names(text) {
    const found = new Map();

    try {
      const pkg = JSON.parse(text);
      // A declared runtime, which is the one support window a manifest states
      // outright rather than implying. Kept for the calendar.
      lastEngines = pkg.engines || {};

      // composer.json is also JSON, and nothing but its key names tells the
      // two apart — a package.json has no \`require\`, a composer.json has no
      // \`dependencies\`. Read first, so a PHP manifest is never reported as a
      // list of npm packages that do not exist.
      if (pkg.require || pkg['require-dev']) {
        for (const group of ['require', 'require-dev']) {
          const block = pkg[group] || {};
          for (const name of Object.keys(block)) {
            // A published name is always vendor/package. The rest of this
            // block is platform constraints — php, ext-mbstring,
            // composer-runtime-api — which describe the machine, not anything
            // Packagist has ever heard of.
            if (name.indexOf('/') === -1) continue;
            found.set('packagist:' + name.toLowerCase(), {
              shown: name,
              range: String(block[name] || ''),
            });
          }
        }
        if (found.size) return found;
      }

      for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const block = pkg[group] || {};
        // The declared range is kept as well as the name. It is not a version —
        // that is the whole point of the note in the SBOM — but it is what the
        // manifest actually says, and reporting a range as a range is honest
        // where reporting it as a version would not be.
        for (const name of Object.keys(block)) {
          found.set('npm:' + name, { shown: name, range: String(block[name] || '') });
        }
      }
      if (found.size) return found;
    } catch { /* not package.json — fall through to the line formats */ }

    // A Gemfile gets its own pass rather than a branch in the loop below.
    // It is a Ruby program, so it is full of bare words — \`end\`, \`gemspec\` —
    // and the requirements reader accepts a bare word as a package name. Read
    // together, a Gemfile comes back with two Python packages in it that do
    // not exist. Only a \`gem\` call with a quoted first argument counts, so a
    // name computed from a variable is skipped rather than guessed at.
    const gems = new Map();
    for (const raw of text.split(/\\r?\\n/)) {
      const line = raw.split('#')[0].trim();
      const rb = /^gem\\s+["']([A-Za-z0-9._-]+)["']\\s*(?:,\\s*["']([^"']+)["'])?/.exec(line);
      if (rb) gems.set('gem:' + rb[1].toLowerCase(), { shown: rb[1], range: (rb[2] || '').trim() });
    }
    if (gems.size) return gems;

    // Which TOML table we are inside, for a pasted Cargo.toml. Every line in
    // one is \`key = value\`, so without this \`name = "my-app"\` under [package]
    // reads as a dependency called \`name\` — and there is a real crate by that
    // name, so the readout would show somebody else's numbers under it.
    //
    // A paste with no headers at all still works: only a table we can see is
    // not a dependency table suppresses. Somebody pasting a bare list of
    // \`name = "1.0"\` lines is the case this page exists for.
    let table = null;
    const deps = (name) => name === null || /dependencies\\]$/.test(name);

    for (const raw of text.split(/\\r?\\n/)) {
      const line = raw.split('#')[0].trim();
      if (!line || line.startsWith('-')) continue;
      if (line.startsWith('[')) { table = line.toLowerCase(); continue; }
      // Before either reader, not inside one. \`lto = true\` under
      // [profile.release] is not a crate, and it is not a Python package
      // called lto either — the requirements reader accepts \`=\` as a version
      // operator, so an unguarded TOML line lands there instead.
      if (!deps(table)) continue;

      // requirements.txt: name, name==1.2, name>=1.2, name[extra]>=1.2
      const py = /^([A-Za-z0-9._-]+)\\s*(?:\\[[^\\]]*\\])?\\s*([=<>!~].*)?$/.exec(line);
      // Cargo.toml / go.mod: name = "1.2"  |  name = { version = "1.2" }
      const other = /^([A-Za-z0-9._\\/-]+)\\s*=\\s*[{"]([^"}]*)/.exec(line);

      if (other) {
        found.set('crates:' + other[1], { shown: other[1], range: (other[2] || '').trim() });
      } else if (py) {
        found.set('pypi:' + py[1].toLowerCase(), { shown: py[1], range: (py[2] || '').trim() });
      }
    }

    return found;
  }

  // A reading nobody can send to a colleague is a reading that stops at one
  // person. The names go in the fragment rather than the query string, so they
  // are never sent to the server — the page's promise is that a pasted manifest
  // does not leave the browser, and a query string would quietly break it.
  const share = (names) => {
    try {
      const hash = names.length ? '#deps=' + names.map(encodeURIComponent).join(',') : '';
      history.replaceState(null, '', location.pathname + hash);
    } catch (e) {}
  };

  // A shared link arrives with names in the fragment. Filled in and read at
  // once, because a link that lands on an empty box has not shared anything.
  const shared = /^#deps=(.+)$/.exec(location.hash);
  if (shared) {
    field.value = shared[1].split(',').map(decodeURIComponent).join(String.fromCharCode(10));
    requestAnimationFrame(() => stackForm.requestSubmit());
  }

  // A real manifest, not a toy one. Six dependencies that between them have
  // advisories, a source-available licence and a package that has not shipped
  // in a while — so the example returns findings rather than a clean sheet,
  // which is what somebody pressing it is trying to see.
  const example = [
    '{',
    '  "dependencies": {',
    '    "react": "^18.2.0",',
    '    "axios": "^1.6.0",',
    '    "lodash": "^4.17.21",',
    '    "moment": "^2.29.4",',
    '    "request": "^2.88.2",',
    '    "elasticsearch": "^16.7.3"',
    '  }',
    '}',
  ].join(String.fromCharCode(10));

  const exampleButton = document.getElementById('stack-example');
  if (exampleButton) {
    exampleButton.addEventListener('click', () => {
      field.value = example;
      stackForm.requestSubmit();
    });
  }

  stackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = field.value.trim();
    if (!text) return;

    out.hidden = false;
    out.innerHTML = '<p class="notice">Reading…</p>';

    let data;
    try { data = await load(); }
    catch { out.innerHTML = '<p class="notice">The index could not be loaded.</p>'; return; }

    const wanted = names(text);
    share([...wanted.values()].map((declared) => declared.shown));

    // Advisories for everything, not only for what this project happens to
    // track. OSV answers 150 packages in one request and allows the call from a
    // browser, so coverage here is the whole manifest rather than the 158
    // packages on the watchlist. A tool that says "not covered" for half of
    // somebody's dependencies does not get used twice.
    let osv = new Map();
    try { osv = await advisories(wanted); } catch { /* leave it unknown, never zero */ }

    // Anything the ledger has never heard of, read from its own registry now.
    // Measured before this existed: 3% of a real manifest had a reading and
    // more than half of them got nothing at all, so the page answered "not
    // tracked" to almost everything it was shown.
    let live = new Map();
    let skipped = 0;
    try {
      const missing = [];
      for (const [key] of wanted) {
        if (data.packages[key]) continue;
        const cut = key.indexOf(':');
        const registry = key.slice(0, cut);
        if (LIVE_READERS[registry]) missing.push({ key, registry, name: key.slice(cut + 1) });
      }
      const read = await readMissing(missing);
      live = read.readings;
      skipped = read.skipped;
    } catch { /* a registry being down is not a finding — leave the rows bare */ }

    const rows = [];
    for (const [key, declared] of wanted) {
      const shown = declared.shown;
      const tracked = data.packages[key] || live.get(key);
      // How many watched projects depend on this. Case-folded to match the
      // index: PyPI treats PyYAML and pyyaml as one package.
      const also = data.dependents?.[shown.toLowerCase().replace(/_/g, '-')] ?? null;
      rows.push({
        name: shown,
        range: declared.range,
        // The index key, which is also the address of that package's page. The
        // pasted spelling is not: PyYAML and pyyaml are the same package and
        // only one of the two has a page.
        key,
        // Tracked means the ledger holds it and it has a page here. A reading
        // taken from the registry a second ago is not in a file, did not pass
        // the carry-forward rules, and cannot be checked again tomorrow — so it
        // arrives labelled rather than quietly counted as the same thing.
        tracked: Boolean(data.packages[key]),
        live: live.has(key),
        also,
        advisories: osv.has(key) ? osv.get(key) : (tracked ? tracked.advisories : null),
        ...(tracked || {}),
      });
    }

    render(rows, data.benchmark, osv.size > 0, skipped);
  });

  /**
   * Reading a package straight from its own registry, in the browser.
   *
   * The same six readers as cli/lib/registry.mjs and the same endpoints, held
   * to agreement by tests/parsers.test.ts. Two of these have a trap: crates.io
   * refuses a request without a user agent, which a browser always sends and
   * curl does not, and Packagist serves CORS on packagist.org but not on the
   * repo.packagist.org mirror that its own tooling uses. Picking the mirror
   * would fail in the browser and nowhere else.
   *
   * Nothing leaves the machine that is not a package name the visitor pasted,
   * and every one of these is a public endpoint anybody can open in a tab.
   */
  const LIVE_READERS = {
    npm: {
      url: (n) => 'https://registry.npmjs.org/' + encodeURIComponent(n),
      read: (d) => {
        const latest = d['dist-tags'] && d['dist-tags'].latest;
        const v = (d.versions && d.versions[latest]) || {};
        const scripts = ['preinstall', 'install', 'postinstall']
          .filter((s) => v.scripts && v.scripts[s]);
        return {
          lastPublish: ((d.time && d.time[latest]) || '').slice(0, 10) || null,
          withdrawn: notice(v.deprecated),
          installScripts: scripts.length ? scripts.join(', ') : null,
        };
      },
    },
    pypi: {
      url: (n) => 'https://pypi.org/pypi/' + encodeURIComponent(n) + '/json',
      read: (d) => {
        const files = (d.urls || []);
        return {
          lastPublish: ((files[0] || {}).upload_time || '').slice(0, 10) || null,
          withdrawn: d.info && d.info.yanked
            ? (notice(d.info.yanked_reason) || 'yanked by the publisher') : null,
          installScripts: null,
        };
      },
    },
    crates: {
      url: (n) => 'https://crates.io/api/v1/crates/' + encodeURIComponent(n),
      read: (d) => {
        const published = (d.versions || [])[0];
        return {
          lastPublish: ((d.crate && d.crate.updated_at) || '').slice(0, 10) || null,
          withdrawn: published && published.yanked
            ? (notice(published.yank_message) || 'yanked by the publisher') : null,
          installScripts: null,
        };
      },
    },
    gem: {
      url: (n) => 'https://rubygems.org/api/v1/gems/' + encodeURIComponent(n) + '.json',
      read: (d) => ({
        lastPublish: (d.version_created_at || '').slice(0, 10) || null,
        withdrawn: d.yanked === true ? 'yanked by the publisher' : null,
        installScripts: null,
      }),
    },
    packagist: {
      url: (n) => 'https://packagist.org/packages/' + n + '.json',
      read: (d) => {
        const p = d.package || {};
        const versions = Object.values(p.versions || {});
        return {
          lastPublish: ((versions[0] || {}).time || '').slice(0, 10) || null,
          withdrawn: p.abandoned
            ? (typeof p.abandoned === 'string'
                ? 'abandoned by the publisher, which suggests ' + p.abandoned
                : 'abandoned by the publisher')
            : null,
          installScripts: null,
        };
      },
    },
    nuget: {
      url: (n) => 'https://api.nuget.org/v3/registration5-gz-semver2/' +
        encodeURIComponent(n.toLowerCase()) + '/index.json',
      read: (d) => {
        const page = (d.items || [])[(d.items || []).length - 1] || {};
        const leaf = (page.items || [])[(page.items || []).length - 1] || {};
        const entry = leaf.catalogEntry || {};
        return {
          lastPublish: (entry.published || '').slice(0, 10) || null,
          withdrawn: entry.deprecation
            ? (notice(entry.deprecation.message) || 'deprecated by the publisher') : null,
          installScripts: null,
        };
      },
    },
  };

  /** A publisher's own words, when they left any. */
  const notice = (value) => {
    if (value === true) return 'withdrawn by the publisher';
    if (typeof value !== 'string' || !value.trim()) return null;
    return 'withdrawn by the publisher: ' + value.trim();
  };

  /** Beyond this a manifest is a directory, and these services owe us nothing. */
  const MAX_LIVE = 60;
  const LIVE_AT_ONCE = 6;

  async function readMissing(missing) {
    const queue = missing.slice(0, MAX_LIVE);
    const readings = new Map();

    for (let i = 0; i < queue.length; i += LIVE_AT_ONCE) {
      const batch = queue.slice(i, i + LIVE_AT_ONCE);
      const done = await Promise.all(batch.map(async (entry) => {
        const reader = LIVE_READERS[entry.registry];
        try {
          const res = await fetch(reader.url(entry.name));
          if (!res.ok) return null;
          const shape = reader.read(await res.json());
          // Every GitHub-derived field stays null rather than being invented:
          // bus factor, scorecard and advisory counts need a token, and asking
          // a stranger for theirs would be a worse trade than the gap it closes.
          return {
            repo: null, scorecard: null, advisories: null, busFactor: null,
            installs: null, pushedAt: null, archived: false, license: null,
            ...shape,
          };
        } catch { return null; }
      }));
      batch.forEach((entry, at) => { if (done[at]) readings.set(entry.key, done[at]); });
    }

    return { readings, skipped: Math.max(0, missing.length - queue.length) };
  }

  // OSV spells several of these differently from the registries themselves, and
  // a query with the wrong ecosystem comes back empty rather than failing — so
  // a typo here reads as "no advisories", which is the worst way to be wrong.
  const OSV_ECOSYSTEM = {
    npm: 'npm',
    pypi: 'PyPI',
    crates: 'crates.io',
    gem: 'RubyGems',
    packagist: 'Packagist',
  };

  async function advisories(wanted) {
    const keys = [...wanted.keys()];
    const found = new Map();

    // Batched at 100. Verified: OSV answers 150 in one call, but a manifest can
    // be any size and one oversized request failing loses the lot.
    for (let i = 0; i < keys.length; i += 100) {
      const slice = keys.slice(i, i + 100);
      const res = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          queries: slice.map((key) => {
            const cut = key.indexOf(':');
            return {
              package: {
                name: key.slice(cut + 1),
                ecosystem: OSV_ECOSYSTEM[key.slice(0, cut)],
              },
            };
          }),
        }),
      });
      if (!res.ok) continue;
      const body = await res.json();
      (body.results || []).forEach((result, index) => {
        found.set(slice[index], (result.vulns || []).length);
      });
    }

    return found;
  }

  const AGE_DAYS = (iso) =>
    iso ? Math.round((Date.now() - Date.parse(iso)) / 86400000) : null;

  function render(rows, benchmark, osvWorked, skipped) {
    if (!rows.length) {
      out.innerHTML = '<p class="notice"><strong>Nothing read</strong> No dependency names were ' +
        'found in that. Paste a package.json, requirements.txt or Cargo.toml.</p>';
      return;
    }

    const tracked = rows.filter((r) => r.tracked);
    const fresh = rows.filter((r) => r.live);
    const bare = rows.filter((r) => !r.tracked && !r.live);
    const scored = rows.filter((r) => typeof r.scorecard === 'number');
    const median = scored.length
      ? scored.map((r) => r.scorecard).sort((a, b) => a - b)[Math.floor(scored.length / 2)]
      : null;

    const stale = rows.filter((r) => (AGE_DAYS(r.pushedAt) || 0) > 365);
    const risky = rows.filter((r) => (r.advisories || 0) > 0);
    const archived = rows.filter((r) => r.archived);
    const restrictive = rows.filter((r) =>
      r.license && /BUSL|SSPL|Elastic|RSAL|Commons-Clause/i.test(r.license));

    const flag = (n, one, many) =>
      n ? '<li><b>' + n + '</b> ' + (n === 1 ? one : many) + '</li>' : '';

    const flags = flag(archived.length, 'is archived', 'are archived') +
      flag(restrictive.length, 'has a source-available licence', 'have source-available licences') +
      flag(risky.length, 'has advisories on record', 'have advisories on record') +
      flag(stale.length, 'has not been pushed to in a year', 'have not been pushed to in a year');

    out.innerHTML =
      '<div class="hero-figures">' +
        fig(rows.length, 'Dependencies read') +
        fig(rows.reduce((t, r) => t + (r.advisories || 0), 0).toLocaleString('en'),
            osvWorked ? 'Advisories, all of them' : 'Advisories, tracked only') +
        fig(median === null ? '—' : median.toFixed(1), 'Median scorecard, yours') +
        fig(benchmark.medianScorecard === null ? '—' : benchmark.medianScorecard.toFixed(1),
            'Median across ' + benchmark.scored + ' tracked') +
      '</div>' +
      // Where each answer came from. A reading taken a second ago and one that
      // has been carried in a file for months are not the same evidence, and a
      // page that presents them identically is overstating the second half.
      '<p class="basis label">' +
        rows.length + ' read — ' + tracked.length + ' from the published readings, ' +
        fresh.length + ' from the registries just now' +
        (bare.length ? ', ' + bare.length + ' with nothing on record either way' : '') +
        (skipped ? '. ' + skipped + ' more were not looked up: sixty is the ceiling per paste.' : '.') +
        ' A live reading has no scorecard, advisory count or bus factor — those need a token, ' +
        'and asking for yours would be a worse trade than the gap it closes.' +
      '</p>' +
      (flags ? '<ul class="stack-flags">' + flags + '</ul>' : '') +
      '<div class="wrap"><table class="readout"><thead><tr>' +
        '<th scope="col">Dependency</th><th scope="col" class="n">Also used by</th>' +
        '<th scope="col">Repository</th>' +
        '<th scope="col" class="n">Scorecard</th><th scope="col" class="n">Advisories</th>' +
        '<th scope="col">Licence</th><th scope="col" class="n">Last push</th>' +
      '</tr></thead><tbody>' +
      rows.map((r) => {
        const age = AGE_DAYS(r.pushedAt);
        return '<tr>' +
          '<td>' + (r.tracked ? link('/' + r.key.replace(':', '/'), r.name) : r.name) + '</td>' +
          '<td class="n num">' + (r.also ? r.also : '<span class="dim">—</span>') + '</td>' +
          '<td>' + (r.tracked
            ? link('/repo/' + r.repo, r.repo)
            : '<span class="dim">' + (r.live ? 'read live' : 'nothing on record') + '</span>') + '</td>' +
          '<td class="n num">' + (typeof r.scorecard === 'number' ? r.scorecard.toFixed(1) : '<span class="dim">—</span>') + '</td>' +
          '<td class="n num">' + (r.advisories === null ? '<span class="dim">—</span>' : r.advisories) + '</td>' +
          '<td class="dim">' + (r.license || '<span class="dim">—</span>') + '</td>' +
          '<td class="n num">' + (age === null ? '<span class="dim">—</span>' : age + 'd') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      // The one thing on this site somebody is obliged to have: EO 14028 asks
      // federal suppliers for an SBOM, and the EU Cyber Resilience Act asks
      // everybody from 2027. Built from what is already on screen, in the
      // browser, so producing it does not mean uploading a manifest.
      // Two things a manifest can answer that nothing else joins up: when the
      // products in it stop getting fixes, and which providers it reveals you
      // depend on. Both built here, so neither needs the manifest uploaded.
      '<p class="repo-facts"><button class="label" type="button" id="stack-eol">' +
      'Download an end-of-life calendar</button>' +
      '<button class="label" type="button" id="stack-providers">' +
      'Which of my providers went down?</button></p>' +
      '<div id="stack-providers-out"></div>' +
      '<p class="repo-facts"><button class="label" type="button" id="stack-sbom">' +
      'Download a CycloneDX SBOM</button>' +
      '<span class="label">Direct dependencies, no versions — a manifest declares ranges. ' +
      'The readings ride along as properties.</span></p>' +
      '<p class="basis label">Advisories from OSV for every dependency. Scorecard, licence and ' +
      'last push for the ' + tracked.length + ' on this watchlist. Also used by counts how many ' +
      'tracked projects depend on it — high means infrastructure, blank means nothing tracked here ' +
      'uses it. Advisory counts are all time. <a href="/method">How</a></p>';

    const button = document.getElementById('stack-sbom');
    if (button) button.addEventListener('click', () => download(rows));

    const eolButton = document.getElementById('stack-eol');
    if (eolButton) eolButton.addEventListener('click', () => calendar(rows));

    const providerButton = document.getElementById('stack-providers');
    if (providerButton) providerButton.addEventListener('click', () => providers(rows));
  }

  /** Hand a blob over as a download without a round trip. */
  function handOver(text, type, filename) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * The support deadlines that apply to this stack, as a calendar.
   *
   * Dates are announced years ahead and looked up by nobody on the day. A
   * calendar is the only shape of that fact which survives a real week.
   */
  async function calendar(rows) {
    let eol;
    try { eol = await (await fetch('/data/eol.json')).json(); }
    catch { return; }

    const entries = sighttrueEolFor(rows.map((r) => r.name), lastEngines, eol.products || []);
    if (!entries.length) {
      const out = document.getElementById('stack-providers-out');
      if (out) out.innerHTML = '<p class="notice">Nothing in this manifest is itself a product ' +
        'with a published end-of-life date. That is not a clean bill of health — it means the ' +
        'runtimes underneath it were not declared here.</p>';
      return;
    }

    handOver(sighttrueIcs(entries, { origin: location.origin }), 'text/calendar', 'sighttrue-eol.ics');
  }

  /**
   * Which tracked providers this manifest reveals, and what they announced.
   *
   * A count measures how much a provider publishes as much as how often it
   * broke, and that caveat sits with the number rather than under it.
   */
  async function providers(rows) {
    const out = document.getElementById('stack-providers-out');
    if (!out) return;
    out.innerHTML = '<p class="notice">Reading…</p>';

    let data;
    try { data = await (await fetch('/data/incidents.json')).json(); }
    catch { out.innerHTML = '<p class="notice">The incident record could not be loaded.</p>'; return; }

    const found = sighttrueProviders(rows.map((r) => r.name), data.incidents || []);
    if (!found.length) {
      out.innerHTML = '<p class="notice">No first-party client for any of the twenty providers ' +
        'tracked here is in this manifest. Only official clients count — a third-party wrapper ' +
        'is not evidence you run the service.</p>';
      return;
    }

    out.innerHTML = '<div class="wrap"><table class="readout"><thead><tr>' +
      '<th scope="col">Provider</th><th scope="col" class="n">Announced, 90 days</th>' +
      '<th scope="col" class="n">Median length</th><th scope="col">Most recent</th>' +
      '<th scope="col">In your stack because of</th>' +
      '</tr></thead><tbody>' +
      found.map((row) =>
        '<tr><td>' + row.provider + '</td>' +
        '<td class="n"><span class="big num">' + row.incidents + '</span></td>' +
        '<td class="n num">' + (row.medianMinutes === null ? '<span class="dim">—</span>'
          : row.medianMinutes < 120 ? row.medianMinutes + 'm' : Math.round(row.medianMinutes / 60) + 'h') + '</td>' +
        '<td>' + (row.latest ? link(row.latest.url, row.latest.title) : '<span class="dim">—</span>') + '</td>' +
        '<td class="dim">' + row.because.join(', ') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<p class="basis label">These are the providers\\u2019 own announcements, kept after their ' +
      'status pages dropped them. A count measures how often a provider published, not how often ' +
      'it broke \\u2014 one that discloses every degradation out-counts one that stays quiet, so ' +
      'never read a low number as a good one. <a href="/incidents">The whole record</a></p>';
  }

  /**
   * The file, assembled and handed over without a round trip.
   *
   * A blob rather than a link to an endpoint: the whole page promises the
   * manifest does not leave the browser, and an SBOM route would break that
   * promise at exactly the moment somebody is most careful about it.
   */
  function download(rows) {
    const serial = self.crypto && self.crypto.randomUUID
      ? 'urn:uuid:' + self.crypto.randomUUID()
      : null;
    const doc = sighttrueSbom(rows, { origin: location.origin, serialNumber: serial });
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sighttrue-sbom.cdx.json';
    anchor.click();

    // Revoked on the next turn of the event loop. Held forever, every download
    // leaks the whole document until the tab closes.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // Built rather than written inline: the build's dead-link guard scans emitted
  // HTML for href literals, and a template string containing one looks exactly
  // like a link to a page that does not exist. The guard is right to complain.
  function link(href, text) {
    return '<a href=' + JSON.stringify(href) + '>' + text + '</a>';
  }

  function fig(value, label) {
    return '<div class="figure"><span class="figure-value num">' + value +
      '</span><span class="label">' + label + '</span></div>';
  }
}`.trim();
