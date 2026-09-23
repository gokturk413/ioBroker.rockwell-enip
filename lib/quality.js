'use strict';

/**
 * ioBroker quality bits are decided here and nowhere else. The engine reports a neutral
 * reason: 'link' when the controller stopped answering, 'tag' when a single tag failed
 * while the link was up. Those map onto the ioBroker codes (docs/en/dev/objectsschema.md):
 * 0x42 "device not connected" and 0x44 "device reports error". A Bad change without a
 * reason (older engine) keeps 0x42, which is what every Bad change used to get.
 *
 * @param {{ Quality: string, Reason?: string }} change engine change event
 * @returns {number} ioBroker q value
 */
function qualityFor(change) {
	if (change.Quality === 'Good') {
		return 0;
	}
	return change.Reason === 'tag' ? 0x44 : 0x42;
}

module.exports = { qualityFor };
