'use strict';
const { expect } = require('chai');
const { qualityFor } = require('./quality');

describe('quality', () => {
	describe('qualityFor', () => {
		it('maps Good to 0', () => {
			expect(qualityFor({ Quality: 'Good' })).to.equal(0);
		});

		it('maps a dropped link to 0x42 device not connected', () => {
			expect(qualityFor({ Quality: 'Bad', Reason: 'link' })).to.equal(0x42);
		});

		it('maps a single failed tag to 0x44 device reports error', () => {
			expect(qualityFor({ Quality: 'Bad', Reason: 'tag', Status: -7 })).to.equal(0x44);
		});

		it('keeps 0x42 for a Bad change without a reason (older engine)', () => {
			expect(qualityFor({ Quality: 'Bad' })).to.equal(0x42);
		});
	});
});
