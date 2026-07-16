'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Resolve a project-file path the admin sent over sendTo, confined to the
 * instance data directory (where saveProjectFile writes). Prevents the admin
 * socket from reading arbitrary host files.
 *
 * @param {string} dataDir - absolute instance data directory
 * @param {string} requestedPath - path from the admin (absolute or relative)
 * @returns {string} resolved absolute path of an existing file inside dataDir
 */
function resolveProjectFile(dataDir, requestedPath) {
	if (!requestedPath || typeof requestedPath !== 'string') {
		throw new Error('path required');
	}
	const base = path.resolve(dataDir);
	const resolved = path.resolve(base, requestedPath);
	const rel = path.relative(base, resolved);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error('path must be inside the instance data directory');
	}
	if (!fs.existsSync(resolved)) {
		throw new Error('project file not found — upload it again');
	}
	return resolved;
}

/**
 * Write one chunk of a project-file upload. Large exports (22 MB L5X) cannot
 * cross the ioBroker message bus in one sendTo, so the admin sends 1 MB slices;
 * chunks accumulate in a `.upload` temp file that is renamed into place on the
 * last one — a parse can never see a torn file. Without seq/total this is the
 * original single-shot write.
 *
 * @param {string} dataDir - absolute instance data directory (must exist)
 * @param {string} name - original file name; sanitized to [\w.-]
 * @param {string} content - this chunk's text
 * @param {number} [seq] - 0-based chunk index
 * @param {number} [total] - total chunk count
 * @returns {{path: string, done: boolean}} final path and whether the file is complete
 */
function writeProjectChunk(dataDir, name, content, seq, total) {
	if (!name || typeof content !== 'string') {
		throw new Error('name and content required');
	}
	const finalPath = path.join(dataDir, String(name).replace(/[^\w.-]/g, '_'));
	if (seq === undefined || total === undefined) {
		fs.writeFileSync(finalPath, content, 'utf8');
		return { path: finalPath, done: true };
	}
	const tmp = `${finalPath}.upload`;
	if (seq === 0) {
		fs.writeFileSync(tmp, content, 'utf8'); // truncates a stale partial upload
	} else {
		fs.appendFileSync(tmp, content, 'utf8');
	}
	if (seq === total - 1) {
		fs.rmSync(finalPath, { force: true });
		fs.renameSync(tmp, finalPath);
		return { path: finalPath, done: true };
	}
	return { path: finalPath, done: false };
}

module.exports = { resolveProjectFile, writeProjectChunk };
