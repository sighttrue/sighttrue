/**
 * Reading a Dockerfile's `FROM` lines against two things nobody joins up.
 *
 * A base image carries a support clock and a rebuild date, and neither is
 * visible where the decision is made. `FROM node:18` says nothing about Node 18
 * having stopped receiving fixes, and nothing about the image you are pinning
 * having last been rebuilt eight months ago — which is eight months of base OS
 * patches you are not getting, whatever your own dependencies look like.
 *
 * Both readings already exist in the published bundles. This is the join.
 *
 * Nothing here is a verdict. An old rebuild date on a pinned digest can be
 * exactly what somebody intended, and a runtime past its end-of-life date is a
 * fact about the runtime rather than a fault in the Dockerfile.
 */

/**
 * Docker image name to the endoflife.date product that answers for it.
 *
 * Curated rather than guessed, and short on purpose: a wrong mapping here
 * reports somebody else's support window as yours, which is worse than
 * reporting nothing. Images with no entry get their rebuild date and no
 * support claim at all.
 */
const EOL_PRODUCT = {
  node: 'nodejs',
  python: 'python',
  golang: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  postgres: 'postgresql',
  mysql: 'mysql',
  mongo: 'mongodb',
  redis: 'redis',
  nginx: 'nginx',
  debian: 'debian',
  ubuntu: 'ubuntu',
  alpine: 'alpine',
};

/**
 * The `FROM` lines, in order, with the stage aliases they define.
 *
 * A multi-stage build refers to its own earlier stages by name, and those are
 * not images — reporting `FROM builder` as an unknown base image would be noise
 * on every serious Dockerfile there is.
 */
export function fromLines(text) {
  const found = [];
  const stages = new Set();

  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split('#')[0] ?? '').trim();
    const match = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (match === null) continue;

    const reference = match[1];
    if (match[2]) stages.add(match[2].toLowerCase());
    if (stages.has(reference.toLowerCase())) continue;
    // A build argument as the whole reference. Nothing can be said about it.
    if (reference.startsWith('$')) continue;

    // Digest pins carry their tag too when both are given; the tag is what the
    // support window keys on, so it is what is read.
    const withoutDigest = reference.split('@')[0] ?? reference;
    const slash = withoutDigest.lastIndexOf('/');
    const namePart = withoutDigest.slice(slash + 1);
    const colon = namePart.lastIndexOf(':');

    found.push({
      reference,
      // A registry-qualified or namespaced image is somebody's own build, and
      // this project has no reading for it. Kept so the count is honest.
      image: colon === -1 ? namePart : namePart.slice(0, colon),
      tag: colon === -1 ? 'latest' : namePart.slice(colon + 1),
      official: slash === -1,
      digest: reference.includes('@sha256:'),
    });
  }

  return found;
}

/** The endoflife.date cycle a tag belongs to, longest match first. */
export function cycleFor(cycles, tag) {
  // `24-alpine`, `3.12-slim`, `18-bookworm`: the variant suffix is packaging,
  // the number in front is the release line.
  const version = (tag.split('-')[0] ?? tag).trim();
  if (version === '' || version === 'latest') return null;

  let best = null;
  for (const cycle of cycles) {
    if (version === cycle.cycle || version.startsWith(`${cycle.cycle}.`)) {
      if (best === null || cycle.cycle.length > best.cycle.length) best = cycle;
    }
  }
  return best;
}

function daysSince(iso, today) {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - at) / 86_400_000);
}

/**
 * What is on record for one `FROM` line.
 *
 * Returns the readings, never a judgement. An image this project does not
 * track reports exactly that: not tracked, not being judged.
 */
export function readingFor(entry, images, eolProducts, today) {
  const notices = [];

  const image = images.find(
    (row) => row.image === entry.image && row.tag === entry.tag,
  );

  if (image) {
    const rebuilt = daysSince(image.updatedAt, today);
    if (rebuilt !== null && rebuilt >= 90) {
      notices.push({
        kind: 'stale-base-image',
        statement: `The published ${entry.image}:${entry.tag} was last rebuilt ${rebuilt} days ago, so it carries whatever base packages were current then.`,
        source: `https://hub.docker.com/_/${entry.image}`,
      });
    }
  }

  const product = EOL_PRODUCT[entry.image];
  if (product) {
    const cycles = eolProducts.filter((row) => row.product === product);
    const cycle = cycleFor(cycles, entry.tag);

    if (cycle && cycle.eol) {
      const remaining = Math.round(
        (Date.parse(`${cycle.eol}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
      );
      if (cycle.ended === true || remaining <= 0) {
        notices.push({
          kind: 'runtime-ended',
          statement: `${product} ${cycle.cycle} stopped receiving fixes on ${cycle.eol}, according to endoflife.date.`,
          source: `https://endoflife.date/${product}`,
        });
      } else if (remaining <= 180) {
        notices.push({
          kind: 'runtime-ending',
          statement: `${product} ${cycle.cycle} stops receiving fixes on ${cycle.eol}, in ${remaining} days, according to endoflife.date.`,
          source: `https://endoflife.date/${product}`,
        });
      }
    }
  }

  return { ...entry, tracked: Boolean(image), bytes: image?.bytes ?? null, notices };
}
