'use strict';
const fs = require('node:fs');
const os = require('os');
const path = require('node:path');
const { expect } = require('chai');
const { resolveProjectFile, writeProjectChunk } = require('./projectFile');

describe('projectFile', () => {
	describe('resolveProjectFile', () => {
		let dataDir;

		before(() => {
			dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rockwell-test-'));
			fs.writeFileSync(path.join(dataDir, 'station.L5X'), '<x/>');
		});

		after(() => {
			fs.rmSync(dataDir, { recursive: true, force: true });
		});

		it('resolves a file stored inside the data dir', () => {
			const abs = path.join(dataDir, 'station.L5X');
			expect(resolveProjectFile(dataDir, abs)).to.equal(abs);
		});

		it('resolves a bare filename relative to the data dir', () => {
			expect(resolveProjectFile(dataDir, 'station.L5X')).to.equal(path.join(dataDir, 'station.L5X'));
		});

		it('rejects paths that escape the data dir', () => {
			expect(() => resolveProjectFile(dataDir, path.join('..', 'evil.L5K'))).to.throw(/inside/);
			expect(() => resolveProjectFile(dataDir, path.resolve(dataDir, '..', 'evil.L5K'))).to.throw(/inside/);
		});

		it('rejects missing files', () => {
			expect(() => resolveProjectFile(dataDir, 'nope.L5K')).to.throw(/not found/);
		});

		it('rejects empty input', () => {
			expect(() => resolveProjectFile(dataDir, '')).to.throw(/required/);
		});
	});

	describe('writeProjectChunk', () => {
		let dataDir;

		beforeEach(() => {
			dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rockwell-chunk-'));
		});

		afterEach(() => {
			fs.rmSync(dataDir, { recursive: true, force: true });
		});

		it('single-shot write without seq/total (legacy)', () => {
			const r = writeProjectChunk(dataDir, 'a.L5K', 'CONTENT');
			expect(r.done).to.equal(true);
			expect(fs.readFileSync(r.path, 'utf8')).to.equal('CONTENT');
		});

		it('assembles sequential chunks and finalizes on the last one', () => {
			const r0 = writeProjectChunk(dataDir, 'big.L5X', '<Root', 0, 3);
			expect(r0.done).to.equal(false);
			expect(fs.existsSync(r0.path)).to.equal(false); // only the .upload temp exists
			const r1 = writeProjectChunk(dataDir, 'big.L5X', '>abc', 1, 3);
			expect(r1.done).to.equal(false);
			const r2 = writeProjectChunk(dataDir, 'big.L5X', '</Root>', 2, 3);
			expect(r2.done).to.equal(true);
			expect(fs.readFileSync(r2.path, 'utf8')).to.equal('<Root>abc</Root>');
			expect(fs.existsSync(r2.path + '.upload')).to.equal(false);
		});

		it('restarting at seq 0 truncates a stale partial upload', () => {
			writeProjectChunk(dataDir, 'x.L5X', 'OLD-PART', 0, 2);
			const r0 = writeProjectChunk(dataDir, 'x.L5X', 'NEW', 0, 2);
			expect(r0.done).to.equal(false);
			const r1 = writeProjectChunk(dataDir, 'x.L5X', '!', 1, 2);
			expect(fs.readFileSync(r1.path, 'utf8')).to.equal('NEW!');
		});

		it('sanitizes the file name like saveProjectFile always did', () => {
			const r = writeProjectChunk(dataDir, 'we ird/na:me.L5X', '<x/>');
			expect(path.basename(r.path)).to.equal('we_ird_na_me.L5X');
		});

		it('rejects missing name or content', () => {
			expect(() => writeProjectChunk(dataDir, '', 'x')).to.throw(/required/);
			expect(() => writeProjectChunk(dataDir, 'a.L5K', /** @type {any} */ (undefined))).to.throw(/required/);
		});
	});
});
