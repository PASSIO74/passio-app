// Exercise the actual Node proof embedded in both trusted workflows, offline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const model = 'claude-fable-5-1';
const cliVersion = '2.1.263';
const project = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
const files = ['.github/workflows/claude-code.yml', '.github/workflows/claude-pr-task.yml'];
const sources = files.map(file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
const actionSettings = JSON.parse(sources[0].match(/          settings: \|\n([\s\S]*?)\n\n          # Déclencheurs/)[1]);
const prSettings = JSON.parse(sources[1].match(/--settings '([^']+)'/)[1]);
for (const config of [project, actionSettings, prSettings]) {
  assert.equal(config.model, model);
  assert.deepEqual(config.availableModels, [model]);
  assert.equal(config.enforceAvailableModels, true);
  assert.equal(config.switchModelsOnFlag, false);
  assert.deepEqual(config.fallbackModel, []);
  assert.equal(config.teammateDefaultModel, model);
}
for (const config of [project, actionSettings]) {
  assert.equal(config.env.ANTHROPIC_MODEL, model);
  assert.equal(config.env.ANTHROPIC_DEFAULT_FABLE_MODEL, model);
  assert.equal(config.env.CLAUDE_CODE_SUBAGENT_MODEL, model);
  assert.equal(config.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE, '1');
  assert.equal(config.env.ANTHROPIC_DEFAULT_OPUS_MODEL, undefined);
}
assert.match(sources[0], /--model claude-fable-5-1\s/);
assert.match(sources[0], /--max-turns 80\s/);
assert.match(sources[0], /--permission-mode default\s/);
assert.equal(actionSettings.permissions.disableBypassPermissionsMode, 'disable');
assert.match(sources[0], /ANTHROPIC_MODEL: claude-fable-5-1\n/);
assert.match(sources[0], /CLAUDE_CODE_SUBAGENT_MODEL: claude-fable-5-1\n/);
assert.match(sources[0], /CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1'\n/);
assert.match(sources[1], /MODELE_PRIMAIRE=claude-fable-5-1\n/);
assert.match(sources[1], /--model "\$\{MODELE_PRIMAIRE\}"/);
assert.match(sources[1], /export CLAUDE_CODE_SUBAGENT_MODEL="\$\{MODELE_PRIMAIRE\}"/);
assert.match(sources[1], /export CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1\n/);
// The reviewed action bundles an older incompatible CLI. Supplying a custom
// executable is its documented override; no moving version or ignored input.
assert.match(sources[0], /uses: anthropics\/claude-code-action@3f854a8fb5146b39d5cbf8b57f70d80810e1366f/);
assert.match(sources[0], /path_to_claude_code_executable: \$\{\{ steps\.cli\.outputs\.executable \}\}/);
assert.match(sources[0], /id: cli\n/);
assert.ok(sources[0].indexOf('id: cli\n') < sources[0].indexOf('id: claude\n'));
assert.match(sources[0], /echo "executable=\$CLAUDE_BIN" >> "\$GITHUB_OUTPUT"/);
assert.match(sources[0], /CLAUDE_BIN="\$CLI_PREFIX\/bin\/claude"/);
assert.match(sources[0], /npm install --global --prefix "\$CLI_PREFIX" --no-audit --no-fund @anthropic-ai\/claude-code@2\.1\.263\n/);
assert.match(sources[1], /npm install -g --no-audit --no-fund @anthropic-ai\/claude-code@2\.1\.263\n/);
for (const source of sources) {
  assert.ok(source.includes(`= '${cliVersion} (Claude Code)'`), 'exact installed CLI version check missing');
  assert.doesNotMatch(source, /claude_code_version:|claude-code@(?:latest|stable|2\.1\.238)/);
}
assert.doesNotMatch(sources[1], /MODELE_REPLI|lancer_claude|eval "\$\(node/);
assert.equal((sources[1].match(/claude -p /g) || []).length, 1);
assert.match(sources[0], /if: steps\.claude\.outcome == 'success' && steps\.modele\.outcome == 'success'/);
assert.match(sources[0], /id: preuve[\s\S]*?if: steps\.claude\.outcome == 'success' && steps\.modele\.outcome == 'success'/);
for (const source of sources) {
  assert.match(source, /ANTHROPIC_API_KEY: ''/);
  assert.match(source, /secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
  assert.doesNotMatch(source, /--fallback-model|secrets\.ANTHROPIC_API_KEY|secrets\.PASSIO\}/);
}
const scripts = sources.map(source => {
  const start = source.indexOf("          const EXPECTED_MODEL = 'claude-fable-5-1';");
  assert.ok(start > 0, 'actual proof missing');
  const blockStart = source.lastIndexOf("          node <<'NODE'\n", start);
  const blockEnd = source.indexOf('\n          NODE', start);
  assert.ok(blockStart >= 0 && blockEnd > start);
  return source.slice(blockStart + "          node <<'NODE'\n".length, blockEnd)
    .split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
});
const init = (m=model, auth='none') => ({type:'system',subtype:'init',model:m,apiKeySource:auth});
const assistant = (m=model) => ({type:'assistant',message:{model:m}});
const result = (used=[model]) => ({type:'result',subtype:'success',is_error:false,modelUsage:Object.fromEntries(used.map(m=>[m,{inputTokens:4,outputTokens:2}]))});
const pass = [init(), assistant(), result()];
const cases = [
  ['Fable 5.1 JSON', JSON.stringify(pass), true],
  ['Fable 5.1 JSONL', pass.map(e=>JSON.stringify(e)).join('\n')+'\n', true],
  ['init Opus', JSON.stringify([init('claude-opus-5'), result()]), false],
  ['init Sonnet', JSON.stringify([init('claude-sonnet-5'), result()]), false],
  ['old Fable 5', JSON.stringify([init('claude-fable-5'), result(['claude-fable-5'])]), false],
  ['Fable 5.2', JSON.stringify([init('claude-fable-5-2'), result(['claude-fable-5-2'])]), false],
  ['moving Fable alias', JSON.stringify([init('fable'), result(['fable'])]), false],
  ['unexpected version suffix', JSON.stringify([init('claude-fable-5-1-other'), result()]), false],
  ['mid-session fallback', JSON.stringify([init(), assistant('claude-opus-5'), result()]), false],
  ['second init fallback', JSON.stringify([init(),init('claude-sonnet-5'), result()]), false],
  ['usage includes other agent', JSON.stringify([init(),result([model,'claude-haiku-4-5'])]), false],
  ['usage switches back to 5', JSON.stringify([init(),result(['claude-fable-5'])]), false],
  ['usage switches to 5.2', JSON.stringify([init(),result(['claude-fable-5-2'])]), false],
  ['subagent returns old Fable', JSON.stringify([init(),assistant('claude-fable-5'),result()]), false],
  ['no init', JSON.stringify([result()]), false],
  ['no result', JSON.stringify([init()]), false],
  ['missing usage', JSON.stringify([init(),{type:'result',subtype:'success'}]), false],
  ['empty usage', JSON.stringify([init(), result([])]), false],
  ['error result', JSON.stringify([init(),{...result(),subtype:'error_max_turns'}]), false],
  ['is_error', JSON.stringify([init(),{...result(),is_error:true}]), false],
  ['missing assistant model', JSON.stringify([init(),{type:'assistant',message:{}},result()]), false],
  ['missing auth', JSON.stringify([init(model,''), result()]), false],
  ['API key auth', JSON.stringify([init(model,'ANTHROPIC_API_KEY'),result()]), false],
  ['unknown auth', JSON.stringify([init(model,'temporary'),result()]), false],
  ['auth changes on second init', JSON.stringify([init(),init(model,'apiKeyHelper'),result()]), false],
  ['corrupt JSONL after valid events', pass.map(e=>JSON.stringify(e)).join('\n')+'\n{broken', false],
  ['empty trace', '', false],
  ['unreadable trace', null, false]
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'passio-model-'));
let count=0;
try {
  scripts.forEach((script,channel) => {
    const scriptPath=path.join(scratch,`guard-${channel}.cjs`);
    fs.writeFileSync(scriptPath,script);
    for (const [name,trace,expected] of cases) {
      const tracePath=path.join(scratch,'trace.json');
      const outputPath=path.join(scratch,'output.txt');
      fs.writeFileSync(outputPath,'');
      if(trace===null) fs.rmSync(tracePath,{force:true}); else fs.writeFileSync(tracePath,trace);
      const run=spawnSync(process.execPath,[scriptPath], {encoding:'utf8',timeout:10000,env:{...process.env,EXECUTION_FILE:tracePath,GITHUB_OUTPUT:outputPath}});
      assert.ifError(run.error);
      assert.equal(run.status===0,expected,`${files[channel]}: ${name}\n${run.stderr}`);
      const output=fs.readFileSync(outputPath,'utf8');
      if(expected) assert.equal(output,`nom=${model}\nauth_reelle=none\n`);
      else assert.equal(output,'','failed proof must emit no successful outputs');
      count++;
    }
  });
  console.log(`PASS: exact-model configuration and ${count} execution-proof scenarios (both channels, offline).`);
} finally {
  fs.rmSync(scratch,{recursive:true,force:true});
}
