#!/usr/bin/env node
/**
 * Publish the worker app outside the stores (ADR 0007;
 * docs/worker-app-distribution-plan.md U2a, U5a, U8). Run it on the machine
 * that builds the APK, then copy the output folder to the server's
 * WORKER_APP_DIR (runbook "Releasing the worker app").
 *
 *   pnpm worker-app:release apk --apk arm64-v8a=<path> --apk armeabi-v7a=<path>
 *     [--min-version-code N] [--notes "..."] [--out deploy/worker-app]
 *   pnpm worker-app:release update --key <private-key.pem> --base-url https://app.<domain>
 *     [--export apps/worker-app/dist/android] [--out deploy/worker-app]
 *
 * `apk` checks each APK with the Android SDK's build tools (ANDROID_BUILD_TOOLS,
 * else the newest under $ANDROID_HOME/build-tools): its signature, its
 * signing certificate (the same for every split and every release, or Android
 * refuses the update), its version code and its ABI. It then copies the APKs
 * and records the release in releases.json.
 *
 * `update` publishes a JS-only update from `expo export --platform android`
 * (run with the APK's WORKER_API_URL). It refuses when native modules changed
 * since the published APK, signs the manifest with the private key (which
 * never leaves this machine), and checks the signature against the
 * certificate the APK embeds before writing anything.
 *
 * Requires the workspace to be built (`pnpm build`) so @ota/domain and
 * @ota/schemas resolve.
 */
import { createHash, createPublicKey, randomUUID, sign, verify, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORKER_APP_ABIS,
  splitVersionCode,
  workerAppNativeModules,
  workerJsUpdateRefusal,
} from '@ota/domain';
import { workerAppReleasesSchema } from '@ota/schemas';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps', 'worker-app');

function fail(message) {
  console.error(`worker-app:release: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [], apk: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`${token} needs a value`);
    if (token === '--apk') args.apk.push(value);
    else args[token.slice(2)] = value;
    index += 1;
  }
  return args;
}

/** The app's public config, exactly as the APK and the update embed it. */
function expoConfig() {
  const output = execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    cwd: APP,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(output);
}

function nativeModules() {
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
  return workerAppNativeModules(pkg.dependencies ?? {});
}

function sha256(buffer, encoding) {
  return createHash('sha256').update(buffer).digest(encoding);
}

function readReleases(out) {
  const path = join(out, 'releases.json');
  if (!existsSync(path)) return { apk: null, updates: {} };
  const parsed = workerAppReleasesSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) fail(`${path} is not a valid release file`);
  return parsed.data;
}

function writeReleases(out, releases) {
  const parsed = workerAppReleasesSchema.safeParse(releases);
  if (!parsed.success) fail(`the release does not validate: ${parsed.error.message}`);
  writeFileSync(join(out, 'releases.json'), `${JSON.stringify(parsed.data, null, 2)}\n`);
}

function buildTools() {
  const dir =
    process.env.ANDROID_BUILD_TOOLS ??
    (() => {
      const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
      if (!sdk || !existsSync(join(sdk, 'build-tools'))) return null;
      const versions = readdirSync(join(sdk, 'build-tools')).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
      return versions.length ? join(sdk, 'build-tools', versions.at(-1)) : null;
    })();
  if (!dir) fail('set ANDROID_HOME (or ANDROID_BUILD_TOOLS): apksigner and aapt2 check each APK');
  return { apksigner: join(dir, 'apksigner'), aapt2: join(dir, 'aapt2') };
}

/** apksigner's "certificate SHA-256 digest", as AB:CD:… (the download page shows it). */
function signingCertificate(tools, apk) {
  const output = execFileSync(tools.apksigner, ['verify', '--print-certs', apk], { encoding: 'utf8' });
  const digests = [...output.matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/g)].map((m) => m[1]);
  if (digests.length !== 1) fail(`${apk} must be signed by exactly one certificate`);
  return digests[0].toUpperCase().match(/../g).join(':');
}

function badging(tools, apk) {
  const output = execFileSync(tools.aapt2, ['dump', 'badging', apk], { encoding: 'utf8' });
  return {
    packageName: /package: name='([^']+)'/.exec(output)?.[1],
    versionCode: Number(/versionCode='(\d+)'/.exec(output)?.[1]),
    versionName: /versionName='([^']*)'/.exec(output)?.[1],
    abis: /native-code: (.*)/.exec(output)?.[1]?.match(/'[^']+'/g)?.map((a) => a.slice(1, -1)) ?? [],
  };
}

function publishApk(args, out) {
  if (args.apk.length === 0) fail('give at least one --apk <abi>=<path>');
  const config = expoConfig();
  const releases = readReleases(out);
  const previous = releases.apk;
  const versionCode = config.android?.versionCode;
  const modules = nativeModules();
  if (!Number.isInteger(versionCode)) fail('app.config.ts has no android.versionCode');
  if (previous && versionCode <= previous.versionCode) {
    fail(`versionCode ${versionCode} is not above the published ${previous.versionCode}; bump it in app.config.ts`);
  }
  if (previous?.runtimeVersion === config.runtimeVersion &&
      workerJsUpdateRefusal({ apk: previous, runtimeVersion: config.runtimeVersion, nativeModules: modules })) {
    fail(`native modules changed but the version is still ${config.version}; bump it in app.config.ts`);
  }

  const tools = buildTools();
  const slug = config.slug;
  mkdirSync(join(out, 'apk'), { recursive: true });
  let certificate = null;
  const apks = args.apk.map((entry) => {
    const [abi, path] = entry.split('=');
    if (!WORKER_APP_ABIS.includes(abi) || !path) fail(`--apk takes <abi>=<path>, abi one of ${WORKER_APP_ABIS.join(', ')}`);
    const fingerprint = signingCertificate(tools, path);
    if (certificate && certificate !== fingerprint) fail('the APKs are signed with different certificates');
    certificate = fingerprint;
    const info = badging(tools, path);
    const expectedCode = splitVersionCode(versionCode, abi);
    if (info.packageName !== config.android.package) fail(`${path} is ${info.packageName}, not ${config.android.package}`);
    if (info.versionName !== config.version) fail(`${path} is version ${info.versionName}, not ${config.version}`);
    if (info.versionCode !== expectedCode) fail(`${path} has version code ${info.versionCode}, expected ${expectedCode} for ${abi}`);
    if (info.abis.length !== 1 || info.abis[0] !== abi) fail(`${path} holds ${info.abis.join(', ') || 'no'} native code, not ${abi} only`);
    const file = `${slug}-${config.version}-${abi}.apk`;
    copyFileSync(path, join(out, 'apk', file));
    const bytes = readFileSync(path);
    return { abi, versionCode: expectedCode, file, sizeBytes: bytes.length, sha256: sha256(bytes, 'hex') };
  });
  if (previous && previous.certificateSha256 !== certificate) {
    fail(`signed with ${certificate}, but phones run ${previous.certificateSha256}: Android would refuse the update`);
  }

  releases.apk = {
    versionName: config.version,
    versionCode,
    minVersionCode: Number(args['min-version-code'] ?? previous?.minVersionCode ?? 1),
    publishedAt: new Date().toISOString(),
    notes: args.notes ?? null,
    certificateSha256: certificate,
    runtimeVersion: config.runtimeVersion,
    nativeModules: modules,
    apks,
  };
  writeReleases(out, releases);
  console.log(`Published ${config.version} (${versionCode}) to ${out}: ${apks.map((apk) => apk.file).join(', ')}`);
}

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function publishUpdate(args, out) {
  if (!args.key || !args['base-url']) fail('update needs --key and --base-url');
  const baseUrl = args['base-url'].replace(/\/$/, '');
  const exportDir = resolve(args.export ?? join(APP, 'dist', 'android'));
  const config = expoConfig();
  const runtimeVersion = config.runtimeVersion;
  const releases = readReleases(out);
  const refusal = workerJsUpdateRefusal({ apk: releases.apk, runtimeVersion, nativeModules: nativeModules() });
  if (refusal === 'no-apk') fail('publish the APK first: no phone could load this update');
  if (refusal === 'runtime-version') fail(`the published APK runs ${releases.apk.runtimeVersion}, this build ${runtimeVersion}`);
  if (refusal === 'native-modules') fail('native modules changed since the published APK: release a new APK instead');

  const certificatePath =
    process.env.WORKER_APP_UPDATES_CERTIFICATE ?? join(ROOT, 'tenant', 'assets', 'worker-app', 'certificate.pem');
  if (!existsSync(certificatePath)) fail(`no certificate at ${certificatePath}: the APK accepts no update`);
  const privateKey = readFileSync(args.key, 'utf8');
  const certificate = new X509Certificate(readFileSync(certificatePath, 'utf8'));

  const metadataText = readFileSync(join(exportDir, 'metadata.json'), 'utf8');
  const metadata = JSON.parse(metadataText).fileMetadata?.android;
  if (!metadata?.bundle) fail(`${exportDir} holds no Android export`);
  const hash = sha256(Buffer.from(metadataText + JSON.stringify(config)), 'hex');
  const id = [hash.slice(0, 8), hash.slice(8, 12), `4${hash.slice(13, 16)}`, `8${hash.slice(17, 20)}`, hash.slice(20, 32)].join('-');
  const folder = join(out, 'updates', runtimeVersion, id);
  mkdirSync(join(folder, 'assets'), { recursive: true });

  const asset = (path, ext, contentType) => {
    const bytes = readFileSync(join(exportDir, path));
    const key = createHash('md5').update(bytes).digest('hex');
    const file = `${key}${ext}`;
    copyFileSync(join(exportDir, path), join(folder, 'assets', file));
    return {
      hash: sha256(bytes, 'base64url'),
      key,
      contentType,
      fileExtension: ext,
      url: `${baseUrl}/worker-app/updates/${runtimeVersion}/${id}/assets/${file}`,
    };
  };
  const manifest = {
    id,
    createdAt: new Date().toISOString(),
    runtimeVersion,
    launchAsset: asset(metadata.bundle, '.bundle', 'application/javascript'),
    assets: (metadata.assets ?? []).map(({ path, ext }) =>
      asset(path, `.${ext}`, CONTENT_TYPES[`.${ext}`] ?? 'application/octet-stream'),
    ),
    metadata: {},
    extra: { expoClient: config },
  };
  const body = JSON.stringify(manifest);
  const signature = sign('sha256', Buffer.from(body), privateKey).toString('base64');
  if (!verify('sha256', Buffer.from(body), createPublicKey(certificate.publicKey.export({ type: 'spki', format: 'pem' })), Buffer.from(signature, 'base64'))) {
    fail(`--key does not match ${basename(certificatePath)}: phones would refuse the update`);
  }
  writeFileSync(join(folder, 'manifest.json'), body);
  writeFileSync(join(folder, 'manifest.sig'), `sig="${signature}", keyid="main"\n`);
  releases.updates[runtimeVersion] = { id, createdAt: manifest.createdAt };
  writeReleases(out, releases);
  const size = statSync(join(exportDir, metadata.bundle)).size;
  console.log(`Published update ${id} for ${runtimeVersion} to ${out} (bundle ${size} bytes)`);
}

const args = parseArgs(process.argv.slice(2));
const out = resolve(args.out ?? join(ROOT, 'deploy', 'worker-app'));
mkdirSync(out, { recursive: true });
const mode = args._[0];
if (mode === 'apk') publishApk(args, out);
else if (mode === 'update') publishUpdate(args, out);
else fail('usage: pnpm worker-app:release apk|update … (see the header of tools/worker-app-release.mjs)');
