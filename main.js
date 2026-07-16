'use strict';

/*
 * Created with @iobroker/create-adapter v3.1.2
 * The whole PLC path runs through the .NET AOT engine (native/): config in,
 * tiered polling out, batched change events into ioBroker states, writes gated
 * and encoded in C#, alarms and on-demand reads over sendTo.
 */

const fs = require('fs');
const utils = require('@iobroker/adapter-core');
const { load } = require('./lib/engineBridge');
const { resolveProjectFile, writeProjectChunk } = require('./lib/projectFile');

const HEARTBEAT_TIMEOUT_MS = 30000;
const WATCHDOG_INTERVAL_MS = 10000;

class RockwellEthernetip extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: 'rockwell_ethernetip',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.engine = null;
		this.pathToState = {}; // PLC path -> ioBroker state id
		this.licenseValid = false;
		this.lastHeartbeat = 0;
		this.watchdog = null;
	}

	/** Build the engine config JSON object from the adapter config. */
	engineConfig() {
		const c = this.config;
		// EP states are file-served, never polled — the engine must not see them.
		const tags = (c.tags || [])
			.filter(t => (t.type || '').toUpperCase() !== 'EP')
			.map(t => ({
				name: t.name,
				address: t.address || '',
				type: t.type || 'DINT',
				tier: t.tier || 'normal',
				// Every tag is writable: control happens from ioBroker states and from
				// PLC logic alike — per-tag write gating was removed from the UI.
				write: true,
			}));
		return {
			gateway: c.plcHost,
			path: `1,${c.plcSlot || 0}`,
			licenseKey: c.licenseKey || '',
			mode: c.mode || 'standard',
			projectFile: c.projectFile || '',
			cipPayload: c.cipPayload || 0,
			parallelConnections: c.parallelConnections || 1,
			instance: this.instance,
			pushMode: !!c.pushMode,
			pushTransport: c.pushTransport || 'poll',
			pushPort: c.pushPort || 44819,
			timeoutMs: c.connectionTimeout || 5000,
			pollTiers: c.pollTiers || { normalMs: c.pollInterval || 1000 },
			tags,
		};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		await this.setState('info.connection', false, true);

		// Always create ioBroker state objects on startup, regardless of PLC connectivity
		await this.createStateObjects();
		await this.raiseObjectsWarnLimit();
		for (const t of this.config.tags || []) {
			this.pathToState[t.address || t.name] = t.name;
		}

		if (!this.config.plcHost) {
			this.log.warn('PLC host is not configured. Please configure the adapter.');
			return;
		}

		try {
			this.engine = load(this.log);
		} catch (e) {
			this.log.error(`Engine addon could not be loaded: ${e.message}`);
			return;
		}

		this.log.info(
			`Starting engine for PLC at ${this.config.plcHost}, Slot ${this.config.plcSlot} (engine ${this.engine.version()})`,
		);
		this.engine.onEvent(json => this.onEngineEvent(json));
		this.engine.init(JSON.stringify(this.engineConfig()));
		this.engine.start();
		this.subscribeConfiguredStates();
		this.applyEpStates().catch(e => this.log.debug(`EP states skipped: ${e.message}`));

		this.lastHeartbeat = Date.now();
		this.watchdog = this.setInterval(() => {
			if (!this.licenseValid) {
				return;
			} // engine refused to start — nothing to restart
			if (Date.now() - this.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
				this.log.warn('engine heartbeat lost — restarting engine');
				this.restartEngine();
			}
		}, WATCHDOG_INTERVAL_MS);
	}

	/** Stop + re-init + start the engine with the current config. */
	restartEngine() {
		if (!this.engine) {
			return;
		}
		try {
			this.engine.stop();
		} catch (e) {
			this.log.warn(`engine stop failed: ${e.message}`);
		}
		this.engine.init(JSON.stringify(this.engineConfig()));
		this.engine.start();
		this.lastHeartbeat = Date.now();
	}

	/**
	 * Single sink for all engine events (JSON strings posted onto the JS thread).
	 *
	 * @param json - one event envelope: changes | connection | heartbeat | license
	 */
	onEngineEvent(json) {
		let ev;
		try {
			ev = JSON.parse(json);
		} catch {
			return;
		}
		if (ev.type === 'changes') {
			const fromPush = ev.src === 'push';
			for (const c of ev.data) {
				if (fromPush) {
					// test visibility: each pushed change at info with ms, burst-guarded
					const now = Date.now();
					if (!this.pushLogWin || now - this.pushLogWin.start >= 1000) {
						if (this.pushLogWin && this.pushLogWin.suppressed > 0) {
							this.log.info(`push: +${this.pushLogWin.suppressed} more change(s) in that second`);
						}
						this.pushLogWin = { start: now, count: 0, suppressed: 0 };
					}
					if (this.pushLogWin.count < 20) {
						this.pushLogWin.count++;
						const d = new Date(c.TsMs || now);
						const hh = d.toTimeString().slice(0, 8);
						const ms = String((c.TsMs || now) % 1000).padStart(3, '0');
						this.log.info(`push: ${hh}.${ms} ${c.Path} = ${c.Value}`);
					} else {
						this.pushLogWin.suppressed++;
					}
				}
				const stateId = this.pathToState[c.Path];
				if (stateId) {
					this.setState(stateId, { val: c.Value, ack: true, q: c.Quality === 'Good' ? 0 : 0x42 }).catch(e =>
						this.log.warn(`setState ${stateId}: ${e.message}`),
					);
				}
			}
		} else if (ev.type === 'connection') {
			this.setState('info.connection', !!ev.connected, true);
		} else if (ev.type === 'heartbeat') {
			this.lastHeartbeat = Date.now();
			// capacity diagnostics: how long each tier's poll pass really takes
			this.heartbeatCount = (this.heartbeatCount || 0) + 1;
			if (this.heartbeatCount % 6 === 0 && this.engine) {
				try {
					const st = JSON.parse(this.engine.getStats());
					const push =
						st.push && st.push.enabled
							? ` | push: ${st.push.connected ? 'ok' : 'DOWN'}, ${st.push.groups} groups, ${st.push.pushedTags} tags, ${st.push.events} events (${st.push.dirtyReads} reads)`
							: '';
					this.log.info(
						`poll pass ms: ${JSON.stringify(st.passMs)} (cached ${st.cachedCount}/${st.tagCount})${push}`,
					);
				} catch {
					/* stats are best-effort */
				}
			}
		} else if (ev.type === 'log') {
			// engine-side diagnostics (push group build warnings etc.)
			const level = ev.level === 'error' ? 'error' : ev.level === 'info' ? 'info' : 'warn';
			this.log[level](`engine: ${ev.message}`);
		} else if (ev.type === 'license') {
			this.licenseValid = !!ev.valid;
			if (ev.valid) {
				this.log.info(`License: ${ev.message}`);
			} else if (ev.freeEligible) {
				// no key, but within the free envelope (instance 0, tag limit) — not an error
				this.log.info(`License: free tier active — ${ev.message}`);
			} else {
				this.log.error(`License: ${ev.message}`);
			}
		}
	}

	/**
	 * Create hierarchical folders/channels from tag path
	 *
	 * @param tagName - sanitized state path, dot-separated
	 * @param seenPaths - channels already created in this run; mutated
	 * @param tagIds - ids of configured tags: these stay states, never channels
	 * @returns the full state id for the leaf
	 */
	async createHierarchy(tagName, seenPaths, tagIds) {
		// tagName is already sanitized (no brackets) - split on dots only
		const parts = tagName.split('.').filter(p => p);
		let currentPath = '';
		const promises = [];

		for (let i = 0; i < parts.length - 1; i++) {
			currentPath = currentPath ? `${currentPath}.${parts[i]}` : parts[i];
			if (!seenPaths.has(currentPath)) {
				seenPaths.add(currentPath);
				// A parent that is itself a configured tag (e.g. the value tag under
				// which an EP state like .Description lives) must stay a STATE — its
				// own tag entry creates it; a channel here would shadow the value.
				if (tagIds && tagIds.has(currentPath)) {
					continue;
				}
				promises.push(
					this.setObjectNotExistsAsync(currentPath, {
						type: 'channel',
						common: { name: parts[i] },
						native: {},
					}),
				);
			}
		}

		await Promise.all(promises);
		return parts.join('.');
	}

	/**
	 * EP states (Label, Description, EngineeringUnit, Navigation, ...) carry file
	 * values: set once from the loaded project model with ack=true — they are
	 * excluded from polling, only changing PLC values travel over EtherNet/IP.
	 */
	async applyEpStates() {
		if (!this.engine) {
			return;
		}
		const eps = (this.config.tags || []).filter(t => (t.type || '').toUpperCase() === 'EP');
		if (eps.length === 0) {
			return;
		}
		const values = JSON.parse(this.engine.getEpValues(JSON.stringify(eps.map(t => t.address || t.name))));
		let applied = 0;
		for (const t of eps) {
			const value = values[t.address || t.name];
			if (value === undefined) {
				continue;
			}
			await this.setState(t.name, { val: String(value), ack: true });
			applied++;
		}
		this.log.info(`EP states: ${applied}/${eps.length} served from the project file`);
	}

	/**
	 * PLC projects legitimately create thousands of state objects; lift the
	 * js-controller per-instance objects warning when it sits below what this
	 * configuration needs. A larger user-set value is left untouched.
	 */
	async raiseObjectsWarnLimit() {
		const needed = Math.max(100000, (this.config.tags || []).length * 3);
		const id = `system.adapter.${this.namespace}.objectsWarnLimit`;
		try {
			const cur = await this.getForeignStateAsync(id);
			if (!cur || typeof cur.val !== 'number' || cur.val < needed) {
				await this.setForeignStateAsync(id, { val: needed, ack: true });
				this.log.debug(`objectsWarnLimit raised to ${needed}`);
			}
		} catch (e) {
			this.log.debug(`objectsWarnLimit not raised: ${e.message}`);
		}
	}

	/**
	 * Create ioBroker state objects for all configured tags (no PLC connection needed).
	 * Called at adapter startup so objects always exist.
	 */
	async createStateObjects() {
		const tags = this.config.tags || [];

		if (tags.length === 0) {
			this.log.info('No tags configured yet');
			return;
		}

		const seenPaths = new Set();
		const tagIds = new Set(tags.map(t => t.name));
		const BATCH = 50;

		for (let i = 0; i < tags.length; i += BATCH) {
			const batch = tags.slice(i, i + BATCH);
			await Promise.all(
				batch.map(async tagConfig => {
					const plcAddress = tagConfig.address || tagConfig.name;
					const stateId = await this.createHierarchy(tagConfig.name, seenPaths, tagIds);
					const leafName = tagConfig.name.split('.').pop() || tagConfig.name;
					const common = {
						name: leafName,
						type: this.getStateType(tagConfig.type),
						role: 'value',
						read: true,
						write: true,
						unit: tagConfig.unit || '',
					};
					const native = { tagName: plcAddress, tagType: tagConfig.type };
					const existing = await this.getObjectAsync(stateId).catch(() => null);
					if (existing && existing.type !== 'state') {
						// repair: an EP child once auto-created this id as a channel;
						// extendObject cannot change the type, a full set can
						const keepCustom = existing.common && existing.common.custom;
						await this.setObjectAsync(stateId, {
							type: 'state',
							common: keepCustom ? { ...common, custom: existing.common.custom } : common,
							native,
						});
					} else {
						await this.extendObjectAsync(stateId, { type: 'state', common, native });
					}
				}),
			);
		}

		this.log.info(`Created ${tags.length} ioBroker state objects`);
	}

	/**
	 * Subscribe to all configured states so ioBroker→PLC writes are received.
	 */
	subscribeConfiguredStates() {
		this.unsubscribeStates('*');
		const tags = this.config.tags || [];
		for (const tag of tags) {
			this.subscribeStates(tag.name);
		}
		this.log.debug(`Subscribed to ${tags.length} configured states for write-back`);
	}

	/**
	 * Get ioBroker state type from PLC tag type
	 *
	 * @param tagType - Logix data type, e.g. DINT / REAL / BOOL / STRING
	 * @returns {ioBroker.CommonType} the ioBroker common.type
	 */
	getStateType(tagType) {
		if (!tagType) {
			return 'mixed';
		}

		const type = tagType.toUpperCase();
		if (type === 'EP') {
			return 'string'; // file-served extended property
		}
		if (type.includes('BOOL')) {
			return 'boolean';
		}
		if (type.includes('INT') || type.includes('DINT') || type.includes('REAL')) {
			return 'number';
		}
		if (type.includes('STRING')) {
			return 'string';
		}
		return 'mixed';
	}

	/**
	 * Is called if a subscribed state changes: ioBroker → PLC write through the engine.
	 *
	 * @param {string} id - State ID
	 * @param {ioBroker.State | null | undefined} state - State object
	 */
	async onStateChange(id, state) {
		if (!state || state.ack) {
			return;
		}

		const stateId = id.replace(`${this.namespace}.`, '');
		if (stateId.startsWith('info.')) {
			return;
		}

		const tagConfig = (this.config.tags || []).find(tag => tag.name === stateId);
		if (!tagConfig || !this.engine) {
			return;
		}
		if ((tagConfig.type || '').toUpperCase() === 'EP') {
			return; // file metadata — nothing to write to the PLC
		}

		const plcPath = tagConfig.address || tagConfig.name;
		let result;
		try {
			result = JSON.parse(this.engine.write(plcPath, JSON.stringify(state.val)));
		} catch (e) {
			this.log.error(`Error writing to tag ${plcPath}: ${e.message}`);
			return;
		}
		if (result.ok) {
			const fromAdapter = (state.from || '').replace('system.adapter.', '');
			this.log.info(`Wrote ${state.val} to PLC tag ${plcPath} [from: ${fromAdapter}]`);
			await this.setState(stateId, { val: state.val, ack: true });
		} else {
			this.log.error(`Error writing to tag ${plcPath}: ${result.error}`);
		}
	}

	/**
	 * engine.parseProject → admin response ({success, tags, stats}) — wire-compatible
	 * with the retired JS L5K parser flow.
	 *
	 * @param content - raw project file text
	 * @param format - 'l5k' or 'l5x'
	 * @returns the admin response payload
	 */
	parseProjectForAdmin(content, format) {
		const parsed = JSON.parse(this.engine.parseProject(content, format));
		const tags = parsed.tags || [];
		const programs = new Set(tags.filter(t => (t.group || '').startsWith('Program: ')).map(t => t.group));
		return {
			success: true,
			tags,
			stats: {
				controllerTags: parsed.tagCount,
				programs: programs.size,
				dataTypes: parsed.dataTypeCount,
				alarmTags: parsed.alarmTagCount,
			},
		};
	}

	/**
	 * Some message was sent to this instance over message box
	 *
	 * @param {ioBroker.Message} obj - Message object
	 */
	async onMessage(obj) {
		if (typeof obj !== 'object' || !obj.command) {
			return;
		}
		const respond = payload => {
			if (obj.callback) {
				this.sendTo(obj.from, obj.command, payload, obj.callback);
			}
		};

		try {
			switch (obj.command) {
				case 'browseTags': {
					// Model-based browse from the configured project file (live browse: Phase 6)
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const file = this.config.projectFile;
					if (!file || !fs.existsSync(file)) {
						return respond({ success: false, error: 'configure projectFile to browse tags' });
					}
					const format = file.toLowerCase().endsWith('.l5x') ? 'l5x' : 'l5k';
					return respond(this.parseProjectForAdmin(fs.readFileSync(file, 'utf8'), format));
				}
				case 'importTags': {
					// Bulk tag-config import from a JSON file in the instance data dir —
					// the message bus cannot carry a 12k-tag array, a file can.
					const file = resolveProjectFile(
						utils.getAbsoluteInstanceDataDir(this),
						obj.message && obj.message.path,
					);
					const imported = JSON.parse(fs.readFileSync(file, 'utf8'));
					if (!Array.isArray(imported)) {
						return respond({ success: false, error: 'file must contain a tag array' });
					}
					this.log.info(`importTags: applying ${imported.length} tags from ${file} (adapter will restart)`);
					respond({ success: true, count: imported.length });
					await this.updateConfig({ tags: imported });
					return;
				}
				case 'deleteObjects': {
					// Bulk state-object removal for the admin: one recursive delete per
					// subtree root instead of one socket round trip per object (the old
					// per-object path took minutes for a 600-tag group and looked dead).
					const ids = (obj.message && obj.message.ids) || [];
					if (!Array.isArray(ids) || !ids.length) {
						return respond({ success: false, error: 'ids required' });
					}
					respond({ success: true, count: ids.length }); // config already updated — don't block the UI
					for (const id of ids) {
						try {
							await this.delObjectAsync(id, { recursive: true });
						} catch (e) {
							this.log.debug(`deleteObjects ${id}: ${e.message}`);
						}
					}
					this.log.info(`deleteObjects: removed ${ids.length} subtree(s)`);
					return;
				}
				case 'generatePushProgram': {
					// Build the partial-import L5X for the current push selection.
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const hostIp = (obj.message && obj.message.hostIp) || '';
					if (!hostIp) {
						return respond({ success: false, error: 'hostIp required' });
					}
					const l5x = this.engine.generatePushL5x(hostIp);
					if (l5x.startsWith('{')) {
						return respond({ success: false, error: JSON.parse(l5x).error || 'generation failed' });
					}
					return respond({ success: true, l5x });
				}
				case 'browseController': {
					// Live symbol-list browse over EtherNet/IP — no project file needed.
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const parsed = JSON.parse(this.engine.browseController());
					if (parsed.error) {
						return respond({ success: false, error: parsed.error });
					}
					const liveTags = parsed.tags || [];
					const livePrograms = new Set(
						liveTags.filter(t => (t.group || '').startsWith('Program: ')).map(t => t.group),
					);
					return respond({
						success: true,
						tags: liveTags,
						stats: {
							controllerTags: parsed.tagCount,
							programs: livePrograms.size,
							dataTypes: 0,
							alarmTags: 0,
						},
					});
				}
				case 'testConnection': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const tags = this.config.tags || [];
					if (tags.length === 0) {
						const stats = JSON.parse(this.engine.getStats());
						return respond({ success: !!stats.started, stats });
					}
					const path = tags[0].address || tags[0].name;
					const [read] = JSON.parse(this.engine.read(JSON.stringify([path])));
					return respond({ success: read && read.quality === 'Good', read });
				}
				case 'reloadTags': {
					respond({ success: true }); // reply first so the browser does not block
					const { tags } = obj.message || {};
					if (!tags) {
						return;
					}
					this.config.tags = tags;
					this.pathToState = {};
					for (const t of tags) {
						this.pathToState[t.address || t.name] = t.name;
					}
					try {
						await this.createStateObjects();
						this.subscribeConfiguredStates();
						this.restartEngine();
						this.log.info(`reloadTags: ${tags.length} tags reloaded`);
					} catch (e) {
						this.log.error(`reloadTags background error: ${e.message}`);
					}
					return;
				}
				case 'parseL5K': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const { fileContent } = obj.message || {};
					if (!fileContent) {
						throw new Error('No file content provided');
					}
					return respond(this.parseProjectForAdmin(fileContent, 'l5k'));
				}
				case 'parseProject': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const { content, format } = obj.message || {};
					if (!content) {
						throw new Error('No content provided');
					}
					return respond(this.parseProjectForAdmin(content, format === 'l5x' ? 'l5x' : 'l5k'));
				}
				case 'parseProjectPath': {
					// Parse a previously saved project file from disk — the file content
					// never crosses the message bus (22 MB L5X exceeds its size limit).
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const { path: requestedPath, format } = obj.message || {};
					const file = resolveProjectFile(utils.getAbsoluteInstanceDataDir(this), requestedPath);
					// The saved file's extension is ground truth — a client format hint must
					// not send L5K text into the XML parser (admin selector can be stale).
					const lower = file.toLowerCase();
					const fmt = lower.endsWith('.l5x')
						? 'l5x'
						: lower.endsWith('.l5k')
							? 'l5k'
							: format === 'l5x'
								? 'l5x'
								: 'l5k';
					return respond(this.parseProjectForAdmin(fs.readFileSync(file, 'utf8'), fmt));
				}
				case 'readValues': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const { paths } = obj.message || {};
					const values = JSON.parse(this.engine.read(JSON.stringify(paths || [])));
					return respond({ success: true, values });
				}
				case 'leaseTags': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const { paths, ttlMs } = obj.message || {};
					this.engine.lease(JSON.stringify(paths || []), ttlMs || 60000);
					return respond({ success: true });
				}
				case 'getAlarms': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					const { tag } = obj.message || {};
					const alarms = JSON.parse(this.engine.getAlarms(tag || ''));
					return respond({ success: true, alarms });
				}
				case 'getStats': {
					if (!this.engine) {
						return respond({ success: false, error: 'engine not loaded' });
					}
					return respond({ success: true, stats: JSON.parse(this.engine.getStats()) });
				}
				case 'getLicenseInfo': {
					// works before the engine is started — the admin UI needs the hardware ID
					const eng = this.engine || load(this.log);
					const key =
						obj.message && typeof obj.message.licenseKey === 'string'
							? obj.message.licenseKey
							: this.config.licenseKey || '';
					return respond({ success: true, ...JSON.parse(eng.getLicenseInfo(key)) });
				}
				case 'saveProjectFile': {
					// Accepts either the whole file ({name, content}) or 1 MB slices
					// ({name, content, seq, total}) — 22 MB L5X exceeds the bus limit in one message.
					const { name, content, seq, total } = obj.message || {};
					const dir = utils.getAbsoluteInstanceDataDir(this);
					fs.mkdirSync(dir, { recursive: true });
					const result = writeProjectChunk(dir, name, content, seq, total);
					if (result.done) {
						this.log.info(`saveProjectFile: stored ${result.path}`);
					}
					return respond({ success: true, path: result.path, done: result.done });
				}
				default:
					return respond({ success: false, error: `unknown command '${obj.command}'` });
			}
		} catch (e) {
			this.log.error(`${obj.command} failed: ${e.message}`);
			respond({ success: false, error: e.message });
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - Callback function
	 */
	onUnload(callback) {
		try {
			if (this.watchdog) {
				this.clearInterval(this.watchdog);
				this.watchdog = null;
			}
			if (this.engine) {
				this.engine.stop();
				this.engine = null;
			}
			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${error.message}`);
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	module.exports = options => new RockwellEthernetip(options);
} else {
	// otherwise start the instance directly
	new RockwellEthernetip();
}
