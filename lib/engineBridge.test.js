'use strict';
const { expect } = require('chai');
const { ridFor, platformPackage, devPublishName } = require('./engineBridge');

describe('engineBridge', () => {
	describe('ridFor', () => {
		it('maps node platform-arch to the .NET RID used by prebuilds/', () => {
			expect(ridFor('win32', 'x64')).to.equal('win-x64');
			expect(ridFor('linux', 'x64')).to.equal('linux-x64');
			expect(ridFor('linux', 'arm64')).to.equal('linux-arm64');
			expect(ridFor('darwin', 'arm64')).to.equal('osx-arm64');   // Apple Silicon
			expect(ridFor('darwin', 'x64')).to.equal('osx-x64');       // Intel Mac
		});

		it('falls back to <platform>-<arch> for unsupported combinations', () => {
			expect(ridFor('freebsd', 'x64')).to.equal('freebsd-x64');
		});
	});

	describe('platformPackage', () => {
		it('names the optional dependency after the node platform-arch pair', () => {
			expect(platformPackage('win32', 'x64')).to.equal('iobroker.rockwell-enip-win32-x64');
			expect(platformPackage('darwin', 'arm64')).to.equal('iobroker.rockwell-enip-darwin-arm64');
			expect(platformPackage('darwin', 'x64')).to.equal('iobroker.rockwell-enip-darwin-x64');
		});
	});

	describe('devPublishName', () => {
		it('matches what the AOT publish actually emits per platform', () => {
			// Verified in CI: the module is never called .node in the publish output.
			expect(devPublishName('win32')).to.equal('rockwell_engine.dll');
			expect(devPublishName('linux')).to.equal('rockwell_engine.so');
			expect(devPublishName('darwin')).to.equal('rockwell_engine.dylib');
		});
	});
});
