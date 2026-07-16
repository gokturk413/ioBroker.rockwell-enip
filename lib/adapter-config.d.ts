// This file extends the AdapterConfig type from "@iobroker/types"
// using the actual properties present in io-package.json
// in order to provide typings for adapter.config properties

import { native } from '../io-package.json';

/** One configured PLC tag. `tags: []` in io-package.json would otherwise infer as never[]. */
interface TagConfig {
	/** sanitized ioBroker state path */
	name: string;
	/** PLC tag path; empty/absent → name is the PLC path */
	address?: string;
	type: string;
	tier?: 'fast' | 'normal' | 'slow';
	write: boolean;
	unit: string;
}

type _AdapterConfig = Omit<typeof native, 'mode' | 'tags'> & {
	mode: 'standard' | 'plantpax_v4' | 'plantpax_v5';
	tags: TagConfig[];
};

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig extends _AdapterConfig {
			// Do not enter anything here!
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
