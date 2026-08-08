/**
 * Two artefacts built from a pasted manifest, in the browser.
 *
 * The page already tells somebody what their dependencies are. These answer the
 * two questions that come after it and that nothing else joins up:
 *
 *   - **When does what I depend on stop getting fixes?** The dates are
 *     published years ahead by endoflife.date and remembered by nobody on the
 *     day. A calendar subscribed once is the only form of that which survives
 *     contact with a real week.
 *
 *   - **Which of my providers actually broke?** A manifest names its providers
 *     without meaning to: `@supabase/supabase-js` says Supabase, `groq-sdk`
 *     says Groq. This project keeps two years of their own announcements after
 *     their status pages drop them, and nobody has ever been able to ask "which
 *     of mine had a bad quarter" because the record did not exist.
 *
 * Client-side for the same reason as the SBOM: the manifest never leaves the
 * browser, and an endpoint that generated these would quietly turn a page that
 * reads a stack into a service that collects them.
 *
 * Shipped as source and evaluated by its own test, so what is tested is what
 * runs.
 */

export const STACK_EXTRAS_SCRIPT = `
/**
 * Dependency name to the endoflife.date product it is, where it is one.
 *
 * Only exact identities — the Django package *is* the Django release line.
 * Nothing here infers a runtime from a library that merely talks to it, which
 * would put somebody else's support window on your calendar.
 */
var SIGHTTRUE_EOL_PACKAGES = {
  django: 'django',
  rails: 'rails',
  laravel: 'laravel',
  'spring-boot': 'spring-framework',
  redis: 'redis',
  mongodb: 'mongodb',
  elasticsearch: 'elasticsearch',
  '@elastic/elasticsearch': 'elasticsearch',
  psycopg2: 'postgresql',
  'psycopg2-binary': 'postgresql',
  pg: 'postgresql',
  mysql2: 'mysql',
  mysqlclient: 'mysql',
};

/**
 * Dependency name to the provider whose client it is.
 *
 * A first-party client is evidence the service is in use. A third-party wrapper
 * is not, so only official packages are listed — being wrong here puts an
 * outage on somebody's report for a service they do not run.
 */
var SIGHTTRUE_PROVIDER_PACKAGES = {
  '@supabase/supabase-js': 'supabase',
  supabase: 'supabase',
  '@sentry/node': 'sentry',
  '@sentry/browser': 'sentry',
  '@sentry/react': 'sentry',
  'sentry-sdk': 'sentry',
  'groq-sdk': 'groq',
  groq: 'groq',
  openai: 'openai',
  '@anthropic-ai/sdk': 'anthropic',
  anthropic: 'anthropic',
  '@octokit/rest': 'github',
  '@octokit/core': 'github',
  pygithub: 'github',
  '@vercel/analytics': 'vercel',
  '@vercel/kv': 'vercel',
  '@upstash/redis': 'upstash',
  '@upstash/ratelimit': 'upstash',
  upstash_redis: 'upstash',
  twilio: 'twilio',
  'discord.js': 'discord',
  'discord-py': 'discord',
  'datadog-api-client': 'datadog',
  'dd-trace': 'datadog',
  datadog: 'datadog',
  '@netlify/functions': 'netlify',
  'netlify-cli': 'netlify',
  wrangler: 'cloudflare',
  '@cloudflare/workers-types': 'cloudflare',
  pymongo: 'mongodb',
  mongoose: 'mongodb',
  'atlassian-python-api': 'atlassian',
  'jira.js': 'atlassian',
};

/** Fold the way the index does, so PyYAML and pyyaml are one lookup. */
function sighttrueFold(name) {
  return String(name).trim().toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * The end-of-life dates that apply to a pasted stack.
 *
 * Matched two ways and both are exact: a dependency that *is* a tracked
 * product, and a runtime the manifest declares outright in \`engines\`. Nothing
 * is guessed from the shape of a project.
 */
function sighttrueEolFor(names, engines, products) {
  var wanted = {};

  names.forEach(function (name) {
    var lower = String(name).toLowerCase();
    var product = SIGHTTRUE_EOL_PACKAGES[lower] || SIGHTTRUE_EOL_PACKAGES[sighttrueFold(lower)];
    if (product) wanted[product] = name;
  });

  Object.keys(engines || {}).forEach(function (key) {
    if (key === 'node') wanted['nodejs'] = 'engines.node ' + engines[key];
  });

  var out = [];
  Object.keys(wanted).forEach(function (product) {
    products
      .filter(function (row) {
        return row.product === product && row.eol && row.ended !== true;
      })
      .forEach(function (row) {
        out.push({ product: product, cycle: row.cycle, eol: row.eol, because: wanted[product] });
      });
  });

  return out.sort(function (a, b) {
    return a.eol < b.eol ? -1 : 1;
  });
}

/** RFC 5545 folds at 75 octets and escapes these four characters. */
function sighttrueIcsText(value) {
  return String(value)
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/;/g, '\\\\;')
    .replace(/,/g, '\\\\,')
    .replace(/\\n/g, '\\\\n');
}

/**
 * A calendar of the support deadlines that apply to this stack.
 *
 * All-day events on the published date, with the source in the description so
 * a reader six months from now can check it without coming back here.
 */
function sighttrueIcs(entries, options) {
  var opts = options || {};
  var stamp = (opts.now || new Date().toISOString()).replace(/[-:]/g, '').replace(/\\.\\d+/, '');
  var origin = opts.origin || 'https://sighttrue.com';

  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sighttrue//End of life//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:End of life — your stack',
  ];

  entries.forEach(function (entry) {
    var date = entry.eol.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + entry.product + '-' + entry.cycle + '@sighttrue.com',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + date,
      'DTEND;VALUE=DATE:' + date,
      'SUMMARY:' + sighttrueIcsText(entry.product + ' ' + entry.cycle + ' stops receiving fixes'),
      'DESCRIPTION:' +
        sighttrueIcsText(
          'Published by endoflife.date and republished unchanged. In your stack because of ' +
            entry.because +
            '. Readings: ' +
            origin +
            '/stack',
        ),
      'URL:https://endoflife.date/' + entry.product,
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  // RFC 5545 requires CRLF.
  return lines.join('\\r\\n') + '\\r\\n';
}

/**
 * Which tracked providers this stack uses, and what they announced.
 *
 * A count of announced incidents measures disclosure as much as reliability —
 * the caller renders that caveat beside the number, because a provider that
 * publishes every degradation will out-count one that publishes nothing.
 */
function sighttrueProviders(names, incidents, options) {
  var opts = options || {};
  var windowDays = opts.windowDays || 90;
  var cutoff = Date.parse(opts.now || new Date().toISOString()) - windowDays * 86400000;

  var used = {};
  names.forEach(function (name) {
    var lower = String(name).toLowerCase();
    var provider = SIGHTTRUE_PROVIDER_PACKAGES[lower];
    if (provider) {
      if (!used[provider]) used[provider] = [];
      if (used[provider].indexOf(name) === -1) used[provider].push(name);
    }
  });

  return Object.keys(used)
    .map(function (provider) {
      var mine = incidents.filter(function (row) {
        if (row.provider !== provider) return false;
        var at = row.startedAt || row.updatedAt;
        return at && Date.parse(at) >= cutoff;
      });

      var lengths = mine
        .map(function (row) {
          if (!row.startedAt || !row.resolvedAt) return null;
          return Math.round((Date.parse(row.resolvedAt) - Date.parse(row.startedAt)) / 60000);
        })
        .filter(function (value) {
          return value !== null && value >= 0;
        })
        .sort(function (a, b) {
          return a - b;
        });

      return {
        provider: provider,
        because: used[provider],
        incidents: mine.length,
        timed: lengths.length,
        medianMinutes: lengths.length ? lengths[Math.floor(lengths.length / 2)] : null,
        latest: mine
          .map(function (row) {
            return { title: row.title, at: row.startedAt || row.updatedAt, url: row.url };
          })
          .sort(function (a, b) {
            return a.at < b.at ? 1 : -1;
          })[0] || null,
        windowDays: windowDays,
      };
    })
    .sort(function (a, b) {
      return b.incidents - a.incidents;
    });
}
`.trim();
