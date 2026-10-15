# Comment-width reflow: the scratch tools

Thread 8 (comment_width). Read this if you must redo the reflow after the sprint's other PRs merge:
see `thread-8-comment_width.md` for the steps. These are scratch scripts, kept here so the redo
takes minutes; they are not part of the repo's tooling and nothing imports them.

## lint.sh -- run the lint of every package as JSON into a scratch directory

```sh
S=<scratch dir>
cd <worktree>
for d in packages/safebyok packages/safebyok-react packages/safebyok-convex demos/safebyok-demo-react root; do
  dir=$d; [ $d = root ] && dir=.
  (cd $dir && pnpm exec eslint -f json . > $S/$(basename $d).json 2>$S/err)
done
```

## reflow.mjs -- prose comments (run first)

`node reflow.mjs $S/*.json`: for each `@stylistic/max-len` message, breaks the line at the last space
at or before column 100 (outside backticks), carries the rest into the next line of the same
paragraph when there is one (cascading), else opens a new line; a one-line `/** text */` becomes a
three-line block. It skips `@example` lines and the code under them (the next script's work), and
it wraps `// eslint-disable-next-line ... -- reason` lines, which breaks them: the rule ignores
directive lines, so run it only with the `ignorePattern` in place, or run `unwrap.mjs` after.

```js
// Scratch tool: rewrap comment lines over LIMIT, reading violations from eslint JSON on stdin-files.
import fs from 'node:fs'
const LIMIT = 100
const skipped = []

function breakAt(text, limit) {
  // last space at index <= limit, outside inline backticks, not leaving a bullet-ish start
  const cands = []
  let inTick = false
  for (let ii = 0; ii < text.length; ii++) {
    if (text[ii] === '`') { inTick = ! inTick }
    if (text[ii] === ' ' && ! inTick && ii <= limit && ii > 0) { cands.push(ii) }
  }
  const all = []
  for (let ii = 1; ii <= limit && ii < text.length; ii++) { if (text[ii] === ' ') { all.push(ii) } }
  const ok = (pos) => ! /^(- |\* |\d+\. |@|\/\/)/.test(text.slice(pos + 1).trimStart())
  for (const list of [cands, all]) {
    for (let jj = list.length - 1; jj >= 0; jj--) { if (ok(list[jj])) { return list[jj] } }
  }
  return -1
}

function parse(line) {
  let mm = line.match(/^(\s*)(\/\/)( ?)(.*)$/)
  if (mm) { return { kind: 'line', indent: mm[1], lead: mm[1] + '//' + (mm[3] || ' '), body: mm[4] } }
  mm = line.match(/^(\s*)\*( ?)(.*)$/)
  if (mm && ! line.trimStart().startsWith('*/')) { return { kind: 'block', indent: mm[1], lead: mm[1] + '* ', body: mm[3] } }
  return null
}
const contIndent = (body) => {
  const lead = body.match(/^ */)[0]
  const rest = body.slice(lead.length)
  if (/^(@\w+|[-*] )/.test(rest)) { return lead + '  ' }
  const nm = rest.match(/^\d+\. /)
  if (nm) { return lead + ' '.repeat(nm[0].length) }
  return lead
}
const isStarter = (rest) => /^(@\w+|[-*] |\d+\. |```)/.test(rest)

function fixFile(file, lineNos) {
  let lines = fs.readFileSync(file, 'utf8').split('\n')
  for (const ln of [...new Set(lineNos)].sort((aa, bb) => bb - aa)) {
    let idx = ln - 1
    if (lines[idx].length <= LIMIT) { continue }
    // one-line doc block
    const om = lines[idx].match(/^(\s*)\/\*\* (.*) \*\/\s*$/)
    if (om) {
      const [, ind, text] = om
      lines.splice(idx, 1, ind + '/**', ind + ' * ' + text, ind + ' */')
      idx += 1
    }
    const info = parse(lines[idx])
    if (! info) { skipped.push(`${file}:${ln}: unparsed`); continue }
    if (/@example|^\s*\*?\s*\/\/?\s*@example/.test(lines[idx]) ) { skipped.push(`${file}:${ln}: example`); continue }
    for (let bb = idx; bb >= 0; bb--) {
      const pb = parse(lines[bb])
      if (! pb || pb.body.trim() === '') { break }
      if (! pb.body.startsWith(' ')) { if (pb.body.startsWith('@example')) { skipped.push(`${file}:${ln}: in example`); idx = -1 } break }
    }
    if (idx < 0) { continue }
    let cur = idx
    let guard = 0
    while (lines[cur].length > LIMIT && guard++ < 50) {
      const pi = parse(lines[cur])
      if (! pi) { break }
      const text = lines[cur]
      const bp = breakAt(text, LIMIT)
      const prefixLen = pi.lead.length
      if (bp <= prefixLen) { skipped.push(`${file}:${cur + 1}: cannot break`); break }
      const head = text.slice(0, bp).trimEnd()
      const rest = text.slice(bp + 1).trimStart()
      const cind = contIndent(pi.body)
      const nextInfo = parse(lines[cur + 1] ?? '')
      lines[cur] = head
      const nextOk = nextInfo && nextInfo.kind === pi.kind && nextInfo.indent === pi.indent && nextInfo.body.trim() !== ''
        && nextInfo.body.startsWith(cind) && ! isStarter(nextInfo.body.slice(cind.length)) && nextInfo.body.slice(cind.length)[0] !== ' '
      if (nextOk) {
        lines[cur + 1] = pi.lead + cind + rest + ' ' + nextInfo.body.slice(cind.length)
      } else {
        lines.splice(cur + 1, 0, pi.lead + cind + rest)
      }
      cur += 1
    }
  }
  fs.writeFileSync(file, lines.join('\n'))
}

const byFile = {}
for (const jf of process.argv.slice(2)) {
  for (const rr of JSON.parse(fs.readFileSync(jf, 'utf8'))) {
    for (const mm of rr.messages) {
      if (mm.ruleId === '@stylistic/max-len') { (byFile[rr.filePath] ??= []).push(mm.line) }
    }
  }
}
for (const [file, lns] of Object.entries(byFile)) { fixFile(file, lns) }
console.log(skipped.join('\n'))
```

## reflow-ex.mjs -- @example lines and the code under them (run second)

Same input. Breaks at a space outside quotes, the continuation indented two more spaces; a trailing
`// result` comment goes on a line of its own first. A violation that is not a ` * ` block line (a
`//` line, a one-line `/** */`) is reported and left, so run `reflow.mjs` first; anything still
reported is for the hand. Review the output by eye: JSX and ternaries may break at an ugly place,
and want a hand fix (this thread fixed five).

```js
import fs from 'node:fs'
const LIMIT = 100
const byFile = {}
for (const jf of process.argv.slice(2)) {
  for (const rr of JSON.parse(fs.readFileSync(jf, 'utf8'))) {
    for (const mm of rr.messages) {
      if (mm.ruleId === '@stylistic/max-len') { (byFile[rr.filePath] ??= []).push(mm.line) }
    }
  }
}
const quoteSafeBreak = (text, from) => {
  // last space-run start at index <= LIMIT, > from, outside quotes
  let quote = null, best = -1
  for (let ii = 0; ii < text.length && ii <= LIMIT; ii++) {
    const ch = text[ii]
    if (quote) { if (ch === quote) { quote = null } } else if (ch === '\'' || ch === '"' || ch === '`') { quote = ch }
    else if (ch === ' ' && ii > from && text[ii - 1] !== ' ') { best = ii }
  }
  return best
}
for (const [file, lns] of Object.entries(byFile)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  for (const ln of [...new Set(lns)].sort((aa, bb) => bb - aa)) {
    let cur = ln - 1
    const mm = lines[cur].match(/^(\s*\* )(\s*)(@example )?(.*)$/)
    if (! mm) { console.log(`not a block-comment line, left for reflow.mjs or the hand: ${file}:${ln}`); continue }
    const pre = mm[1], lead = mm[2], tag = mm[3] ?? ''
    const cont = pre + lead + (tag ? '  ' : '') + '  '
    // a trailing result comment goes first
    const body = mm[4]
    const cm = body.match(/^(.*?\S)\s{1,}(\/\/ .*)$/)
    let queue
    if (cm && (pre + lead + tag + body).length > LIMIT) { queue = [pre + lead + tag + cm[1], cont + cm[2]] }
    else { queue = [lines[cur]] }
    const out = []
    while (queue.length) {
      let ll = queue.shift()
      if (ll.length <= LIMIT) { out.push(ll); continue }
      const from = (pre + lead + tag).length
      const bp = quoteSafeBreak(ll, from)
      if (bp < 0) { console.log('cannot break', file, ln); out.push(ll); continue }
      out.push(ll.slice(0, bp).trimEnd())
      queue.unshift(cont + ll.slice(bp + 1).trimStart())
    }
    lines.splice(cur, 1, ...out)
  }
  fs.writeFileSync(file, lines.join('\n'))
}
```

## unwrap.mjs -- rejoin a wrapped eslint-disable-next-line

```js
import fs from 'node:fs'
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8')
  const out = src.replace(/^(\s*\/\/ eslint-disable-next-line [^\n]* --[^\n]*)\n\s*\/\/ ([^\n]*)\n(?=\s*[^\s/])/gm, '$1 $2\n')
  if (out !== src) { fs.writeFileSync(file, out); console.log('unwrapped', file) }
}
```

## verify.mjs -- only whitespace and comment markers changed

What it proves, and what it does not, is in its header. It parses each changed file with
TypeScript and compares the code tokens exactly and the comment words (markers removed). The
configs' own differences are expected: the rule is added there. Mutation-tested: a changed comment
word, and a changed code token, are each reported.

```js
// Usage, from the repo root: node verify.mjs [<base-ref>]   (default HEAD~; compares changed files)
// Proves, per changed .ts/.tsx/.mjs file: the sequence of code tokens (kind and text) is identical,
// and the sequence of comment words (comment markers and leading `*` removed) is identical.
// Does NOT prove: that a wrap kept an inline tag whole (see inline-tags.mjs), that the wrap reads
// well. A comment at the very end of a block or file, or trailing a token, is read as the leading
// comment of the token after it, which compares the same in both versions. JSX text and string
// contents are tokens, so a changed space inside one differs.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
const ts = createRequire(`${process.cwd()}/package.json`)('typescript')
const base = process.argv[2] ?? 'HEAD~'

const commentWords = (raw) => raw.replace(/^\/\*\*?|^\/\//, '').replace(/\*\/$/, '').replace(/^\s*\*/gm, '').split(/\s+/).filter(Boolean)

const scan = (file, text) => {
  const kindOfFile = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.mjs') ? ts.ScriptKind.JS : kindOfFile)
  const tokens = []
  const words = []
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) { return }
    const kids = node.getChildren(source)
    if (kids.length === 0) {
      // a leaf token: its leading comments, then its own text (JSX text keeps its whitespace)
      ts.forEachLeadingCommentRange(text, node.getFullStart(), (pos, end) => { words.push(...commentWords(text.slice(pos, end))) })
      if (node.kind !== ts.SyntaxKind.EndOfFileToken) { tokens.push(`${node.kind}:${node.getText(source)}`) }
    } else { kids.forEach(visit) }
  }
  visit(source)
  return { tokens, words }
}

const files = execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' }).trim().split('\n')
  .filter((ff) => /\.(ts|tsx|mjs)$/.test(ff))
let bad = 0
for (const file of files) {
  const before = scan(file, execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', maxBuffer: 1e8 }))
  const after = scan(file, fs.readFileSync(file, 'utf8'))
  for (const part of ['tokens', 'words']) {
    if (before[part].join('\n') !== after[part].join('\n')) { console.log(`DIFFERS (${part}): ${file}`); bad += 1 }
  }
}
console.log(`checked ${files.length} files, ${bad} differences`)
process.exit(bad === 0 ? 0 : 1)
```

## inline-tags.mjs -- no inline tag left open at a line end (run last)

The review of this thread caught `{@link` ending a line with its target on the next, which
TypeScript reads as a link to nothing. `verify.mjs` cannot see it (the words are the same), so run
this after any reflow and wrap each hit by hand so the tag stays whole. Zero hits on this branch.

```js
// Usage, from the repo root: node inline-tags.mjs
// Lists every comment line, in every tracked .ts/.tsx/.mjs file, that opens an inline tag such as
// `{@link` and does not close it with `}` on the same line. TypeScript reads a `{@link` split from
// its target as a link to nothing (the trap the thread 8 review caught); a hit is wrapped by hand.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n')
  .filter((ff) => /\.(ts|tsx|mjs)$/.test(ff) && ! ff.includes('_generated'))
let hits = 0
for (const file of files) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
    if (/^\s*(\/\/|\/?\*)/.test(line) && /\{@\w+[^}]*$/.test(line)) { console.log(`${file}:${idx + 1}: ${line.trim()}`); hits += 1 }
  })
}
console.log(`${hits} open inline tags`)
process.exit(hits === 0 ? 0 : 1)
```
