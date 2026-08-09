/**
 * A CycloneDX bill of materials, built in the browser.
 *
 * The only thing on this site somebody is legally obliged to have. US Executive
 * Order 14028 requires an SBOM from suppliers to federal agencies, and the EU
 * Cyber Resilience Act requires one from 2027 for anything sold with a digital
 * element — so the people who need this are not shopping for a tool, they are
 * looking for the thing that produces the file.
 *
 * Built here rather than server-side for the same reason the rest of this page
 * is: the manifest never leaves the browser, and an SBOM endpoint would quietly
 * turn a page that reads a stack into a service that collects them.
 *
 * ── What this document does not claim
 *
 * A manifest is not a lockfile. It says a project depends on `axios ^1.6.0`; it
 * does not say which version was installed, and it says nothing at all about
 * the two hundred transitive dependencies underneath. So no component here
 * carries a `version`, and the document says so in its own metadata rather than
 * leaving a reader to notice. An SBOM that guessed versions would be worse than
 * none: it would be a compliance artefact asserting something nobody checked.
 *
 * The readings are attached as `properties`, which is CycloneDX's own extension
 * point, namespaced so nothing here can be mistaken for part of the standard.
 *
 * Shipped as source rather than compiled from the TypeScript beside it because
 * this project has no bundler. The test evaluates this exact string and calls
 * the function it defines, so what is tested is what runs.
 */

export const SBOM_SCRIPT = `
function sighttrueSbom(rows, options) {
  var opts = options || {};
  var origin = opts.origin || 'https://sighttrue.com';
  var when = opts.now || new Date().toISOString();
  var serial = opts.serialNumber || null;

  // purl spells each ecosystem its own way, and getting it wrong makes the
  // document unmatchable by every scanner that reads one.
  function purl(registry, name) {
    if (registry === 'npm') {
      var parts = name.split('/');
      return parts.length === 2
        ? 'pkg:npm/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1])
        : 'pkg:npm/' + encodeURIComponent(name);
    }
    if (registry === 'pypi') {
      return 'pkg:pypi/' + encodeURIComponent(name.toLowerCase().replace(/[-_.]+/g, '-'));
    }
    if (registry === 'packagist') {
      // pkg:composer/vendor/package, and the slash is a namespace separator
      // rather than a character in the name.
      var vendor = name.split('/');
      return vendor.length === 2
        ? 'pkg:composer/' + encodeURIComponent(vendor[0]) + '/' + encodeURIComponent(vendor[1])
        : 'pkg:composer/' + encodeURIComponent(name);
    }
    if (registry === 'gem') return 'pkg:gem/' + encodeURIComponent(name);
    if (registry === 'nuget') return 'pkg:nuget/' + encodeURIComponent(name);
    return 'pkg:cargo/' + encodeURIComponent(name);
  }

  function property(name, value) {
    return { name: 'sighttrue:' + name, value: String(value) };
  }

  var components = rows.map(function (row) {
    var cut = row.key.indexOf(':');
    var registry = row.key.slice(0, cut);
    var name = row.name;

    var properties = [property('tracked', row.tracked ? 'yes' : 'no')];
    if (row.range) properties.push(property('declaredRange', row.range));
    if (typeof row.advisories === 'number') properties.push(property('advisories', row.advisories));
    if (typeof row.scorecard === 'number') properties.push(property('scorecard', row.scorecard));
    if (row.pushedAt) properties.push(property('repositoryLastPush', row.pushedAt));
    if (row.lastPublish) properties.push(property('registryLastPublish', row.lastPublish));
    if (row.archived) properties.push(property('repositoryArchived', 'yes'));
    if (row.withdrawn) properties.push(property('withdrawnByPublisher', row.withdrawn));
    if (row.installScripts) properties.push(property('runsOnInstall', row.installScripts));
    if (typeof row.busFactor === 'number') properties.push(property('busFactor', row.busFactor));

    var references = [];
    if (row.repo) {
      references.push({ type: 'vcs', url: 'https://github.com/' + row.repo });
    }
    if (row.tracked) {
      references.push({ type: 'other', url: origin + '/' + row.key.replace(':', '/'), comment: 'Sighttrue readings' });
    }

    var component = {
      type: 'library',
      // Deliberately absent: a manifest declares a range, not a version. See
      // the note in metadata.properties.
      name: name,
      purl: purl(registry, name),
      properties: properties,
    };
    if (row.license) component.licenses = [{ license: { id: row.license } }];
    if (references.length) component.externalReferences = references;
    return component;
  });

  var document = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp: when,
      tools: {
        components: [
          {
            type: 'application',
            name: 'Sighttrue',
            externalReferences: [{ type: 'website', url: origin }],
          },
        ],
      },
      properties: [
        {
          name: 'sighttrue:source',
          value: 'Generated in the browser from a pasted manifest. The manifest was not uploaded anywhere.',
        },
        {
          name: 'sighttrue:versions',
          value:
            'No component carries a version. A manifest declares ranges rather than resolved versions, so any version here would be a guess. Generate from a lockfile for a resolved bill of materials.',
        },
        {
          name: 'sighttrue:scope',
          value:
            'Direct dependencies only, as declared. Transitive dependencies are not included and are usually the larger part of a dependency tree.',
        },
        {
          name: 'sighttrue:readings',
          value:
            'sighttrue:* properties are readings republished from OSV, Google Open Source Insights, the package registries and GitHub. They are measurements, not assessments, and no field here states whether a component is safe to use.',
        },
      ],
    },
    components: components,
  };

  if (serial) document.serialNumber = serial;
  return document;
}
`.trim();
