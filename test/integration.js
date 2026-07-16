const path = require('path');
const { tests } = require('@iobroker/testing');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
	// The harness defaults to the "dev" dist-tag of js-controller, which now requires
	// Node >= 22. The CI action sets engine-strict, so on Node 20 npm refuses to install
	// it, the data directory is never created and every test dies in `before all` with
	// `iobroker-data/iobroker.json: ENOENT`. Pin to the released controller — that is
	// also what users actually run.
	controllerVersion: 'latest',
});
