/**
 * Sighttrue for editors.
 *
 * The earliest place any of this can be said. The Action speaks in CI, the App
 * speaks on a pull request, the CLI speaks when somebody remembers to run it —
 * and all three arrive after the dependency is already in the file. This
 * arrives while it is being typed.
 *
 * Underlines a dependency and says what is on record: the publisher withdrew
 * it, it runs a script on the installing machine, its repository is archived,
 * advisories, a source-available licence, no publish in two years. Never a
 * verdict, and never a squiggle that means "do not use this" — every diagnostic
 * here is Information severity, because a warning colour is a judgement and
 * these are readings.
 *
 * The readers come from the published `sighttrue` package rather than being
 * copied in. Three implementations of the manifest reader once disagreed badly
 * enough to report a crate called `name`, and this would have been a fifth.
 *
 * No dependency on the network at activation: the index is fetched once, lazily,
 * cached for the session, and any failure is silent. An editor extension that
 * shows an error box because somebody else's site is down is an extension people
 * disable that afternoon.
 */

const vscode = require('vscode');

const { foldName, registryFor } = require('sighttrue/manifest');
const { noticesFor } = require('sighttrue/notices');
const { positionOf } = require('sighttrue/positions');

const ENDPOINT = 'https://sighttrue.com';

/** Fetched once per session. A manifest is edited far more often than the readings move. */
let indexPromise = null;

function loadIndex() {
  if (indexPromise === null) {
    indexPromise = fetch(`${ENDPOINT}/data/stack-index.json`, {
      headers: { 'user-agent': 'sighttrue-vscode' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return indexPromise;
}

/**
 * Every dependency in a document that has something on record.
 *
 * Names come from the document text, positions from the same text, and the
 * readings from the published index. A name the index does not carry produces
 * nothing at all — it is not tracked, which is not a finding about it.
 */
async function diagnosticsFor(document) {
  const registry = registryFor(document.fileName);
  if (registry === null) return [];

  const index = await loadIndex();
  if (index === null || !index.packages) return [];

  const text = document.getText();
  const { names } = require('sighttrue/manifest');
  const today = new Date().toISOString().slice(0, 10);
  const found = [];

  for (const name of names(text, registry)) {
    const entry = index.packages[`${registry}:${foldName(registry, name)}`];
    if (!entry) continue;

    const notices = noticesFor(registry, name, entry, today);
    if (notices.length === 0) continue;

    const at = positionOf(text, registry, name);
    if (at === null) continue;

    const range = new vscode.Range(
      new vscode.Position(at.line, at.character),
      new vscode.Position(at.line, at.character + at.length),
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      notices.map((notice) => notice.statement).join('\n'),
      // Information, never Warning. A warning colour is a judgement, and none
      // of these is one — they are things on record about the package.
      vscode.DiagnosticSeverity.Information,
    );
    diagnostic.source = 'Sighttrue';
    diagnostic.code = {
      value: notices[0].kind,
      target: vscode.Uri.parse(`${ENDPOINT}/${registry}/${name}`),
    };
    found.push(diagnostic);
  }

  return found;
}

function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection('sighttrue');
  context.subscriptions.push(collection);

  /** Debounced, so a burst of keystrokes costs one pass rather than thirty. */
  let pending = null;
  const refresh = (document) => {
    if (!document) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      diagnosticsFor(document)
        .then((found) => collection.set(document.uri, found))
        // Silent on purpose. A reading that cannot be taken is not an error
        // worth interrupting somebody's editing for.
        .catch(() => collection.delete(document.uri));
    }, 400);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
  );

  for (const document of vscode.workspace.textDocuments) refresh(document);
}

function deactivate() {}

module.exports = { activate, deactivate, diagnosticsFor };
