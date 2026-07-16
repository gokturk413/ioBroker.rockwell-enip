'use strict';
const path = require('node:path');
const fs = require('node:fs');

const PACKAGE_PREFIX = 'iobroker.rockwell_ethernetip';

/**
 * node `process.platform`-`process.arch` → the .NET RID that names prebuilds/<rid>/.
 *
 * @param platform - node's `process.platform` (win32, linux, darwin)
 * @param arch - node's `process.arch` (x64, arm64)
 * @returns the matching .NET RID, or `<platform>-<arch>` when unsupported
 */
function ridFor(platform, arch) {
	return (
		{
			'win32-x64': 'win-x64',
			'linux-x64': 'linux-x64',
			'linux-arm64': 'linux-arm64',
			'darwin-arm64': 'osx-arm64',
			'darwin-x64': 'osx-x64',
		}[`${platform}-${arch}`] || `${platform}-${arch}`
	);
}

/**
 * Name of the optional dependency that ships this platform's engine binary.
 *
 * @param platform - node's `process.platform`
 * @param arch - node's `process.arch`
 * @returns the npm package name, e.g. `iobroker.rockwell_ethernetip-linux-arm64`
 */
function platformPackage(platform, arch) {
	return `${PACKAGE_PREFIX}-${platform}-${arch}`;
}

/**
 * File name the AOT publish gives the native module. It is never `.node` — the
 * prebuilds and the published platform packages are what rename it.
 *
 * @param platform - node's `process.platform`
 * @returns the artifact name inside `.../publish/`
 */
function devPublishName(platform) {
	if (platform === 'win32') {
		return 'rockwell_engine.dll';
	}
	return platform === 'darwin' ? 'rockwell_engine.dylib' : 'rockwell_engine.so';
}

/**
 * Loads the platform-specific AOT engine addon and returns its Engine surface
 * (ping/version/onEvent/init/start/stop/write/read/lease/getAlarms/getStats/
 * getLicenseInfo/parseProject).
 *
 * Search order: the optional per-platform npm package (how released installs get
 * it — npm only downloads the one matching the host's os/cpu), then
 * `prebuilds/<rid>/rockwell_engine.node` (locally built artifact), then the dev
 * publish output (see devPublishName).
 *
 * @param log - optional ioBroker logger; only `debug` is used
 * @returns the addon's `Engine` namespace
 * @throws when no engine binary exists for this platform, naming every path tried
 */
function load(log) {
	const rid = ridFor(process.platform, process.arch);
	const pkg = platformPackage(process.platform, process.arch);
	const tried = [];

	// 1. optional platform package
	try {
		const resolved = require.resolve(`${pkg}/rockwell_engine.node`);
		return unwrap(resolved, log);
	} catch (e) {
		tried.push(`${pkg} (${e.code === 'MODULE_NOT_FOUND' ? 'not installed' : e.message})`);
	}

	// 2./3. on-disk artifacts
	const files = [
		path.join(__dirname, '..', 'prebuilds', rid, 'rockwell_engine.node'),
		path.join(
			__dirname,
			'..',
			'native',
			'RockwellEngine.Node',
			'bin',
			'Release',
			'net10.0',
			rid,
			'publish',
			devPublishName(process.platform),
		),
	];
	for (const p of files) {
		if (fs.existsSync(p)) {
			return unwrap(p, log);
		}
		tried.push(p);
	}

	throw new Error(`rockwell engine addon not found for ${rid}; tried:\n${tried.join('\n')}`);
}

function unwrap(modulePath, log) {
	if (log && log.debug) {
		log.debug(`engineBridge: loading ${modulePath}`);
	}
	const mod = require(modulePath);
	if (!mod.Engine) {
		throw new Error(`engineBridge: ${modulePath} has no Engine export`);
	}
	return mod.Engine;
}

module.exports = { load, ridFor, platformPackage, devPublishName };
