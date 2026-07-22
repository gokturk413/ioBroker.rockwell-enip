import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import IconButton from '@material-ui/core/IconButton';
import DeleteIcon from '@material-ui/icons/Delete';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import LinearProgress from '@material-ui/core/LinearProgress';
import MenuItem from '@material-ui/core/MenuItem';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import { I18n } from '@iobroker/adapter-react-v5';

/**
 * @type {() => Record<string, import("@material-ui/core/styles/withStyles").CreateCSSProperties>}
 */
const styles = () => ({
	input: {
		marginTop: 0,
		minWidth: 400,
		marginBottom: 10,
	},
	button: {
		marginRight: 10,
		marginTop: 10,
	},
	section: {
		padding: 20,
		marginBottom: 20,
	},
	table: {
		marginTop: 20,
	},
	controlElement: {
		marginBottom: 15,
	},
	treeSection: {
		marginTop: 20,
	},
	treeToolbar: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: 12,
		marginBottom: 10,
	},
	treeStats: {
		display: 'flex',
		gap: 16,
		fontSize: 12,
		color: '#555',
		flexWrap: 'wrap',
	},
	treeContainer: {
		border: '1px solid #e0e0e0',
		borderRadius: 8,
		padding: 12,
		background: '#fdfdfd',
		maxHeight: 320,
		overflow: 'auto',
	},
	treeNode: {
		paddingLeft: 8,
		borderLeft: '1px solid #ececec',
		marginLeft: 12,
	},
	treeNodeRow: {
		display: 'flex',
		alignItems: 'center',
		gap: 8,
	},
	treeLabelBox: {
		display: 'flex',
		flexDirection: 'column',
		gap: 2,
	},
	treeMeta: {
		display: 'flex',
		gap: 6,
		flexWrap: 'wrap',
	},
	chip: {
		fontSize: 11,
		padding: '2px 8px',
		borderRadius: 12,
		background: '#e0e0e0',
		color: '#333',
	},
	chipValue: {
		background: '#d1ecf1',
		color: '#0c5460',
	},
});

/**
 * @typedef {object} SettingsProps
 * @property {Record<string, string>} classes
 * @property {Record<string, any>} native
 * @property {(attr: string, value: any) => void} onChange
 * @property {any} socket
 * @property {string} instance
 */

/**
 * @typedef {object} SettingsState
 * @property {boolean} testingConnection
 * @property {string} connectionStatus
 * @property {boolean} browsingTags
 * @property {any[]} availableTags
 * @property {boolean} showTagBrowser
 * @property {boolean} parsingFile
 * @property {any[]} treeData
 * @property {Record<string, { node: any, parentId: string | null }>} nodeIndex
 * @property {Record<string, boolean>} checkedNodes
 * @property {{ controllerTags?: number, programs?: number, dataTypes?: number } | null} treeStats
 * @property {number} activeTab
 * @property {Record<string, boolean>} expandedNodes
 * @property {any | null} selectedTag
 * @property {string | null} selectedNodeId
 * @property {Record<string, { name: string, type: string }>} checkedRightPanelTags
 * @property {string} treeSearch
 * @property {string} selectedTagsSearch
 */

/**
 * @extends {React.Component<SettingsProps, SettingsState>}
 */
class Settings extends React.Component {
	constructor(props) {
		super(props);
		/** @type {SettingsState} */
		this.state = {
			testingConnection: false,
			connectionStatus: '',
			browsingTags: false,
			availableTags: [],
			showTagBrowser: false,
			parsingFile: false,
			treeData: [],
			nodeIndex: /** @type {Record<string, { node: any, parentId: string | null }>} */ ({}),
			checkedNodes: {},
			treeStats: null,
			activeTab: 0,
			expandedNodes: {},
			selectedTag: null,
			selectedNodeId: null,
			checkedRightPanelTags: {},
			treeSearch: '',
			selectedTagsSearch: '',
			expandedSelectedNodes: {},
			licenseInfo: null,
			checkingLicense: false,
			projectFileName: null,
			uploadingFile: false,
			uploadProgress: 0,
			projectFileError: null,
			buildProgress: 0,
		};

		this.nodeCounter = 0;
	}

	componentDidMount() {
		this.checkLicense(this.props.native.licenseKey || '');
		// live object-build progress published by the adapter (info.buildProgress)
		this.buildProgressId = `rockwell-enip.${this.props.instance}.info.buildProgress`;
		this.onBuildProgress = (id, state) => this.setState({ buildProgress: state ? Number(state.val) || 0 : 0 });
		this.props.socket
			.getState(this.buildProgressId)
			.then(s => this.onBuildProgress(this.buildProgressId, s))
			.catch(() => {});
		this.props.socket.subscribeState(this.buildProgressId, this.onBuildProgress);
	}

	componentWillUnmount() {
		if (this.buildProgressId) {
			this.props.socket.unsubscribeState(this.buildProgressId, this.onBuildProgress);
		}
	}

	checkLicense = async licenseKey => {
		this.setState({ checkingLicense: true });
		try {
			const result = await this.sendCommand('getLicenseInfo', { licenseKey });
			this.setState({ licenseInfo: result && result.hardwareId ? result : null });
		} catch (e) {
			console.error('getLicenseInfo failed:', e);
			this.setState({ licenseInfo: null });
		}
		this.setState({ checkingLicense: false });
	};

	updateTier = (field, value) => {
		const tiers = { fastMs: 250, normalMs: 1000, slowMs: 5000, ...(this.props.native.pollTiers || {}) };
		tiers[field] = parseInt(value) || 0;
		this.props.onChange('pollTiers', tiers);
	};

	testConnection = async () => {
		this.setState({ testingConnection: true, connectionStatus: '' });

		try {
			const result = await this.sendCommand('testConnection', {
				host: this.props.native.plcHost,
				slot: this.props.native.plcSlot,
			});

			if (result && result.success) {
				this.setState({ connectionStatus: 'success' });
			} else {
				this.setState({ connectionStatus: 'error' });
			}
		} catch (error) {
			this.setState({ connectionStatus: 'error' });
		}

		this.setState({ testingConnection: false });
	};

	exportPushProgram = async () => {
		try {
			const hostIp = this.props.native.pushHostIp || window.location.hostname;
			const result = await this.sendCommand('generatePushProgram', { hostIp });
			if (!result || !result.success) {
				this.setState({
					projectFileError: `${I18n.t('Export failed')}: ${(result && result.error) || I18n.t('unknown error')}`,
				});
				return;
			}
			const blob = new Blob([result.l5x], { type: 'application/xml' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = (this.props.native.pushTransport || 'poll') === 'poll' ? 'IOB_PushMap.L5X' : 'IOB_Push.L5X';
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			this.setState({ projectFileError: `${I18n.t('Export failed')}: ${err.message}` });
		}
	};

	browseTags = async () => {
		this.setState({ browsingTags: true, availableTags: [], projectFileError: null });
		try {
			// Live source reads the symbol list from the controller; file sources
			// re-parse the stored project file.
			const command = this.props.native.projectFormat === 'live' ? 'browseController' : 'browseTags';
			const result = await this.sendCommand(command, {});
			if (result && result.success && result.tags) {
				const { treeData, nodeIndex } = this.buildTreeFromTags(result.tags);
				const expandedNodes = {};
				treeData.forEach(root => {
					expandedNodes[root.id] = true;
				});
				this.setState({
					availableTags: result.tags,
					showTagBrowser: true,
					treeData,
					nodeIndex,
					checkedNodes: {},
					expandedNodes,
					treeStats: result.stats || null,
				});
			} else {
				console.error('browseTags failed:', result && result.error);
				this.setState({
					projectFileError: `${I18n.t('Browse failed')}: ${(result && result.error) || I18n.t('unknown error')}`,
				});
			}
		} catch (error) {
			console.error('Error browsing tags:', error);
			this.setState({ projectFileError: `${I18n.t('Browse failed')}: ${error.message}` });
		}
		this.setState({ browsingTags: false });
	};

	sendCommand = async (command, message) => {
		const target = `rockwell-enip.${this.props.instance}`;
		const result = await this.props.socket.sendTo(target, command, message);
		return result;
	};

	removeTag = async index => {
		const tags = [...this.props.native.tags];
		const tag = tags[index];
		tags.splice(index, 1);
		this.props.onChange('tags', tags);
		if (tag) {
			const prefix = `rockwell-enip.${this.props.instance}`;
			try {
				await this.props.socket.delObject(`${prefix}.${tag.name}`);
			} catch (e) {
				/* ignore */
			}
			this.sendCommand('reloadTags', { tags }).catch(() => {});
		}
	};

	removeAllTags = async () => {
		const tags = this.props.native.tags || [];
		// Config first — the UI must react instantly; the backend prunes the
		// object trees recursively (one call per root, not one per object).
		this.props.onChange('tags', []);
		const roots = [...new Set(tags.map(t => t.name.split('.')[0]))];
		this.sendCommand('deleteObjects', { ids: roots }).catch(() => {});
		this.sendCommand('reloadTags', { tags: [] }).catch(() => {});
	};

	updateTag = (index, field, value) => {
		const tags = (this.props.native.tags || []).map((tag, i) => (i === index ? { ...tag, [field]: value } : tag));
		this.props.onChange('tags', tags);
	};

	handleFileUpload = event => {
		const file = event.target.files[0];
		if (!file) return;
		event.target.value = ''; // allow re-selecting the same file
		const reader = new FileReader();
		reader.onload = async e => {
			const result = e.target?.result || '';
			const text = typeof result === 'string' ? result : new TextDecoder('utf-8').decode(result);
			const format = file.name.toLowerCase().endsWith('.l5x') ? 'l5x' : 'l5k';
			this.setState({
				projectFileName: file.name,
				uploadingFile: true,
				uploadProgress: 0,
				projectFileError: null,
			});
			// Persist next to the instance in 1 MB slices — a 22 MB L5X in one
			// sendTo exceeds the message-bus limit and is dropped silently.
			try {
				const CHUNK = 1024 * 1024;
				const total = Math.max(1, Math.ceil(text.length / CHUNK));
				let saved = null;
				for (let seq = 0; seq < total; seq++) {
					saved = await this.sendCommand('saveProjectFile', {
						name: file.name,
						content: text.slice(seq * CHUNK, (seq + 1) * CHUNK),
						seq,
						total,
					});
					if (!saved || !saved.success) {
						throw new Error((saved && saved.error) || `chunk ${seq + 1}/${total} was not stored`);
					}
					this.setState({ uploadProgress: Math.round(((seq + 1) / total) * 100) });
				}
				this.props.onChange('projectFile', saved.path);
				this.props.onChange('projectFormat', format);
				this.setState({ uploadingFile: false });
			} catch (err) {
				console.error('saveProjectFile error:', err);
				this.setState({ uploadingFile: false, projectFileError: `${I18n.t('Upload failed')}: ${err.message}` });
			}
		};
		reader.readAsText(file);
	};

	parseProjectFile = async () => {
		const file = this.props.native.projectFile;
		if (!file) return;
		this.setState({ parsingFile: true, availableTags: [], projectFileError: null });

		try {
			// The stored file's extension decides the parser — the source selector
			// is only intent for the next upload and can point the other way.
			const format = file.toLowerCase().endsWith('.l5x') ? 'l5x' : 'l5k';
			const result = await this.sendCommand('parseProjectPath', { path: file, format });

			if (result && result.success && result.tags) {
				const { treeData, nodeIndex } = this.buildTreeFromTags(result.tags);
				const expandedNodes = {};
				treeData.forEach(root => {
					expandedNodes[root.id] = true;
				});

				this.setState({
					availableTags: result.tags,
					showTagBrowser: true,
					parsingFile: false,
					treeData,
					nodeIndex,
					checkedNodes: {},
					expandedNodes,
					treeStats: result.stats || null,
				});
			} else {
				console.error('Parse failed:', result);
				this.setState({
					parsingFile: false,
					projectFileError: `${I18n.t('Parse failed')}: ${(result && result.error) || I18n.t('unknown error')}`,
				});
			}
		} catch (error) {
			console.error('Error parsing project file:', error);
			this.setState({ parsingFile: false, projectFileError: `${I18n.t('Parse failed')}: ${error.message}` });
		}
	};

	buildTreeFromTags = (tags = []) => {
		this.nodeCounter = 0;
		const nodeIndex = {};

		const createNode = (label, data = {}) => ({
			id: `node-${++this.nodeCounter}`,
			label,
			children: [],
			...data,
		});

		const registerNode = (node, parentId = null) => {
			nodeIndex[node.id] = { node, parentId };
			(node.children || []).forEach(child => registerNode(child, node.id));
		};

		const controllerTags = [];
		const programGroups = {};
		const localSlots = {};
		const otherGroups = {};

		tags.forEach(tag => {
			if (tag.group && tag.group.startsWith('Program: ')) {
				const programName = tag.group.replace('Program: ', '').trim() || 'Program';
				if (!programGroups[programName]) {
					programGroups[programName] = [];
				}
				programGroups[programName].push(tag);
			} else if (tag.group === 'Local I/O' && tag.slot) {
				const slotKey = `${tag.slot}`;
				if (!localSlots[slotKey]) {
					localSlots[slotKey] = [];
				}
				localSlots[slotKey].push(tag);
			} else if (tag.group && tag.group !== 'Controller Tags') {
				if (!otherGroups[tag.group]) {
					otherGroups[tag.group] = [];
				}
				otherGroups[tag.group].push(tag);
			} else {
				controllerTags.push(tag);
			}
		});

		const roots = [];

		// Generate all index combinations for multi-dim arrays e.g. "4,1" → [[0,0],[1,0],[2,0],[3,0]]
		const getArrayIndices = dimsStr => {
			const dims = dimsStr.split(',').map(d => parseInt(d.trim()));
			const result = [];
			const gen = (remaining, current) => {
				if (remaining.length === 0) {
					result.push([...current]);
					return;
				}
				for (let i = 0; i < remaining[0]; i++) {
					current.push(i);
					gen(remaining.slice(1), current);
					current.pop();
				}
			};
			gen(dims, []);
			return result;
		};

		// Create leaf children for plain (non-UDT) arrays: [0], [1]... each a leaf node
		const createPlainArrayNodes = (baseTag, parentPath) => {
			const baseType = (baseTag.type || 'DINT').replace('[]', '');
			const indices = getArrayIndices(baseTag.dimensions);
			return indices.map(idx => {
				const idxStr = `[${idx.join(',')}]`;
				const elemPath = `${parentPath}${idxStr}`;
				const elemTag = { name: elemPath, type: baseType };
				return createNode(idxStr, { tag: elemTag, isLeaf: true });
			});
		};

		// Create children for array-of-UDT: [0,0], [1,0]... each with UDT members
		const createArrayOfUDTNodes = (baseTag, parentPath) => {
			const indices = getArrayIndices(baseTag.dimensions);
			return indices.map(idx => {
				const idxStr = `[${idx.join(',')}]`;
				const elemPath = `${parentPath}${idxStr}`;
				const elemTag = { name: elemPath, type: baseTag.type };
				const elemNode = createNode(idxStr, { tag: elemTag, isLeaf: false });
				elemNode.children = createMemberNodes(baseTag.members, elemPath);
				return elemNode;
			});
		};

		// EP nodes are file metadata, not readable PLC paths: they render as
		// info-only children (no checkbox) and never affect a member's leaf-ness.
		const createEpNode = (ep, parentPath) =>
			createNode(ep.name, {
				ep: true,
				isLeaf: true,
				tag: { name: `${parentPath}.${ep.name}`, type: 'EP', defaultValue: ep.defaultValue },
			});

		// Recursive function to create member nodes, with optional per-member defaultValues.
		// Optix ordering: extended properties first, then @Alarms/@AlarmSet, then members A→Z.
		const memberRank = m => (m.name === '@Alarms' || m.name === '@AlarmSet' ? 0 : 1);
		const createMemberNodes = (allMembers, parentPath, parentDefaultValues = []) => {
			if (!allMembers || allMembers.length === 0) return [];

			const epNodes = allMembers.filter(m => m.type === 'EP').map(m => createEpNode(m, parentPath));
			const members = allMembers.filter(m => m.type !== 'EP');

			return [
				...epNodes,
				...[...members]
					.sort((a, b) => memberRank(a) - memberRank(b) || a.name.localeCompare(b.name))
					.map((member, index) => {
						const memberPath = `${parentPath}.${member.name}`;
						// Decorated L5X members carry their own exported value; positional
						// mapping remains the fallback for L5K TIMER/COUNTER-style defaults.
						const memberDefaultValue =
							member.defaultValue !== undefined ? member.defaultValue : parentDefaultValues[index];
						const memberTag = {
							name: memberPath,
							type: member.type,
							dimensions: member.dimensions,
							// hidden AOI internals (Wrk_* timers): never auto-selected, default tier "none"
							...(member.hidden ? { hidden: true } : {}),
							...(memberDefaultValue !== undefined ? { defaultValue: memberDefaultValue } : {}),
						};

						// EP children are info-only: a member whose only children are EPs
						// stays a selectable leaf (Optix: Inp_PVData keeps its Navigation child).
						const structuralKids = (member.members || []).filter(mm => mm.type !== 'EP');
						const hasChildren = structuralKids.length > 0;
						const hasEpKids = (member.members || []).length > structuralKids.length;
						const hasDimensions = !!member.dimensions;

						const hiddenExtra = member.hidden ? { hidden: true } : {};
						if (hasDimensions && hasChildren) {
							// Array-of-UDT member: create [0],[1],... each with sub-members
							const memberNode = createNode(member.name, {
								tag: memberTag,
								isLeaf: false,
								...hiddenExtra,
							});
							memberNode.children = createArrayOfUDTNodes(member, memberPath);
							return memberNode;
						} else if (hasDimensions && !hasChildren) {
							// Plain array member: create [0],[1],... as leaves
							const memberNode = createNode(member.name, {
								tag: memberTag,
								isLeaf: false,
								...hiddenExtra,
							});
							memberNode.children = createPlainArrayNodes(member, memberPath);
							return memberNode;
						} else {
							const memberNode = createNode(member.name, {
								tag: memberTag,
								isLeaf: !hasChildren,
								...hiddenExtra,
							});
							if (hasChildren || hasEpKids) {
								const subDefaults = this.getMemberDefaultValues(
									member.type,
									memberDefaultValue,
									structuralKids,
								);
								memberNode.children = createMemberNodes(member.members, memberPath, subDefaults);
							}
							return memberNode;
						}
					}),
			];
		};

		// EP entries are info metadata — a scalar tag whose only "members" are EPs
		// (program parameters, plain tags with Description/Navigation) must stay a
		// selectable LEAF, otherwise only its EP children ever get added as states.
		const createTagNode = tag => {
			const allMembers = tag.members || [];
			const structural = allMembers.filter(m => m.type !== 'EP');
			const hasStructural = structural.length > 0;
			const hasArrayDims = !!tag.dimensions;
			const tagNode = createNode(tag.name, { tag, isLeaf: !hasStructural && !hasArrayDims });

			if (hasStructural && hasArrayDims) {
				tagNode.children = createArrayOfUDTNodes(tag, tag.name);
			} else if (hasArrayDims) {
				tagNode.children = createPlainArrayNodes(tag, tag.name);
			} else if (allMembers.length > 0) {
				const memberDefaults = this.getMemberDefaultValues(tag.type, tag.defaultValue, structural);
				tagNode.children = createMemberNodes(allMembers, tag.name, memberDefaults);
			}
			return tagNode;
		};

		if (controllerTags.length) {
			const controllerRoot = createNode(I18n.t('Controller Tags'), { type: 'group' });
			controllerRoot.children = [...controllerTags]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map(createTagNode);
			roots.push(controllerRoot);
		}

		const programNames = Object.keys(programGroups);
		if (programNames.length) {
			const programsRoot = createNode(I18n.t('Programs'), { type: 'group' });
			programsRoot.children = programNames.sort().map(programName => {
				const programNode = createNode(programName, { type: 'program' });
				programNode.children = [...programGroups[programName]]
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(createTagNode);
				return programNode;
			});
			roots.push(programsRoot);
		}

		const slotNumbers = Object.keys(localSlots);
		if (slotNumbers.length) {
			const localRoot = createNode(I18n.t('Local I/O'), { type: 'group' });
			localRoot.children = slotNumbers
				.sort((a, b) => Number(a) - Number(b))
				.map(slot => {
					const sample = localSlots[slot][0];
					const label = `${I18n.t('Slot')} ${slot} - ${sample.catalogNumber || I18n.t('Module')}`;
					const slotNode = createNode(label, { type: 'slot', meta: { slot } });
					slotNode.children = localSlots[slot].map(tag => createNode(tag.name, { tag, isLeaf: true }));
					return slotNode;
				});
			roots.push(localRoot);
		}

		Object.keys(otherGroups).forEach(groupName => {
			const groupNode = createNode(groupName, { type: 'group' });
			groupNode.children = [...otherGroups[groupName]]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map(tag => {
					const hasMembers = tag.members && tag.members.length > 0;
					const hasArrayDims = !!tag.dimensions;
					const isArrayOfUDT = hasMembers && hasArrayDims;
					const isPlainArray = !hasMembers && hasArrayDims;
					const tagNode = createNode(tag.name, { tag, isLeaf: !hasMembers && !hasArrayDims });
					if (isArrayOfUDT) {
						tagNode.children = createArrayOfUDTNodes(tag, tag.name);
					} else if (isPlainArray) {
						tagNode.children = createPlainArrayNodes(tag, tag.name);
					} else if (hasMembers) {
						const memberDefaults = this.getMemberDefaultValues(tag.type, tag.defaultValue, tag.members);
						tagNode.children = createMemberNodes(tag.members, tag.name, memberDefaults);
					}
					return tagNode;
				});
			roots.push(groupNode);
		});

		roots.forEach(root => registerNode(root));

		return { treeData: roots, nodeIndex };
	};

	handleNodeToggle = (nodeId, checked) => {
		const { nodeIndex } = this.state;
		if (!nodeIndex[nodeId]) {
			return;
		}
		const checkedNodes = { ...this.state.checkedNodes };
		this.setNodeCheckedRecursive(nodeId, checked, checkedNodes, nodeIndex);
		this.updateParentState(nodeId, checkedNodes, nodeIndex);
		this.setState({ checkedNodes });
	};

	setNodeCheckedRecursive = (nodeId, checked, checkedNodes, nodeIndex, direct = true) => {
		const node = nodeIndex[nodeId]?.node;
		// Hidden AOI internals (Wrk_* timers) never join a group selection — they
		// only get checked by clicking them directly ("just in case" access).
		if (!direct && checked && node && node.hidden) {
			return;
		}
		checkedNodes[nodeId] = checked;
		if (node && node.children && node.children.length) {
			node.children.forEach(child =>
				this.setNodeCheckedRecursive(child.id, checked, checkedNodes, nodeIndex, false),
			);
		}
	};

	updateParentState = (nodeId, checkedNodes, nodeIndex) => {
		const parentId = nodeIndex[nodeId]?.parentId;
		if (!parentId) {
			return;
		}
		const parentNode = nodeIndex[parentId]?.node;
		if (!parentNode) {
			return;
		}
		const allChildrenChecked = (parentNode.children || []).every(child => checkedNodes[child.id]);
		checkedNodes[parentId] = allChildrenChecked;
		this.updateParentState(parentId, checkedNodes, nodeIndex);
	};

	collectSelectedLeafTags = (node, checkedNodes, result) => {
		const isChecked = !!checkedNodes[node.id];
		if (node.isLeaf && node.tag && isChecked) {
			result.push(node.tag);
		}
		(node.children || []).forEach(child => this.collectSelectedLeafTags(child, checkedNodes, result));
	};

	getSelectedLeafTags = () => {
		const selected = [];
		(this.state.treeData || []).forEach(root =>
			this.collectSelectedLeafTags(root, this.state.checkedNodes, selected),
		);
		return selected;
	};

	toggleNodeExpand = nodeId => {
		this.setState(prevState => ({
			expandedNodes: {
				...prevState.expandedNodes,
				[nodeId]: !prevState.expandedNodes[nodeId],
			},
		}));
	};

	toggleSelectedNodeExpand = (path, defaultOpen) => {
		this.setState(prevState => {
			const cur =
				prevState.expandedSelectedNodes[path] !== undefined
					? prevState.expandedSelectedNodes[path]
					: defaultOpen;
			return { expandedSelectedNodes: { ...prevState.expandedSelectedNodes, [path]: !cur } };
		});
	};

	handleTagClick = (tag, nodeId) => {
		this.setState({ selectedTag: tag, selectedNodeId: nodeId || null });
	};

	getTypeColor = type => {
		if (!type) return '#9e9e9e';
		const t = type.toUpperCase();
		if (t === 'BOOL') return '#43a047';
		if (t === 'TIMER') return '#f57c00';
		if (t === 'COUNTER') return '#8e24aa';
		if (t === 'REAL' || t === 'LREAL') return '#00897b';
		if (
			t === 'SINT' ||
			t === 'INT' ||
			t === 'DINT' ||
			t === 'LINT' ||
			t === 'USINT' ||
			t === 'UINT' ||
			t === 'UDINT' ||
			t === 'ULINT'
		)
			return '#1976d2';
		if (t === 'STRING') return '#c62828';
		// UDT or unknown
		return '#546e7a';
	};

	/**
	 * Split a comma-separated list respecting nested brackets.
	 * e.g. "[a,[b,c],d]" inner → ['a', '[b,c]', 'd']
	 */
	splitTopLevelValues = inner => {
		const result = [];
		let depth = 0;
		let current = '';
		for (const ch of inner) {
			if (ch === '[') {
				depth++;
				current += ch;
			} else if (ch === ']') {
				depth--;
				current += ch;
			} else if (ch === ',' && depth === 0) {
				result.push(current.trim());
				current = '';
			} else {
				current += ch;
			}
		}
		if (current.trim()) result.push(current.trim());
		return result;
	};

	/** Extract top-level array values from a defaultValue string like "[a,b,c]" */
	getDefaultValues = defaultValue => {
		if (!defaultValue) return [];
		const s = defaultValue.trim();
		if (s.startsWith('[') && s.endsWith(']')) {
			return this.splitTopLevelValues(s.slice(1, -1));
		}
		return [s];
	};

	/**
	 * Map top-level stored values to member-level defaultValues.
	 * TIMER stores [StatusBits, PRE, ACC] for members [DN, EN, TT, PRE, ACC].
	 * COUNTER stores [StatusBits, PRE, ACC] for members [CD, CU, DN, OV, UN, PRE, ACC].
	 * For other types, index-based mapping is used when count matches.
	 */
	getMemberDefaultValues = (tagType, tagDefaultValue, members) => {
		const values = this.getDefaultValues(tagDefaultValue);
		if (!values.length) return [];
		if (tagType === 'TIMER') {
			// Stored: [StatusBits, PRE, ACC] — members: DN, EN, TT, PRE, ACC
			return [values[0], values[0], values[0], values[1], values[2]];
		}
		if (tagType === 'COUNTER') {
			// Stored: [StatusBits, PRE, ACC] — members: CD, CU, DN, OV, UN, PRE, ACC
			return [values[0], values[0], values[0], values[0], values[0], values[1], values[2]];
		}
		// General UDT: index-based (best-effort)
		return values;
	};

	sanitizeStateName = rawName => {
		// Convert [N,M] brackets -> .N.M  and  : -> .  for valid ioBroker state IDs
		// e.g. Program:MainProgram1.Motor_Start -> Program.MainProgram1.Motor_Start
		// e.g. VFT_TOT[0] -> ControllerTags.VFT_TOT.0
		const sanitized = rawName
			.replace(/\[(\d+(?:,\d+)*)\]/g, (_, dims) => '.' + dims.replace(/,/g, '.'))
			.replace(/:/g, '.');
		if (!rawName.startsWith('Program:')) {
			return 'ControllerTags.' + sanitized;
		}
		return sanitized;
	};

	getIoBrokerType = tagType => {
		if (!tagType) return 'mixed';
		const t = tagType.toUpperCase().replace('[]', '');
		if (t === 'BOOL') return 'boolean';
		if (['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL'].includes(t))
			return 'number';
		if (t === 'STRING' || t === 'EP') return 'string';
		return 'mixed';
	};

	createObjectsImmediately = async _tags => {
		// Backend (reloadTags) artıq bütün obyektləri arxa planda yaradır.
		// Frontend-də sequential socket.setObject çağırışları brauzeri donduran
		// əsas problem idi — bu funksiya artıq heç nə etmir.
	};

	handleAddSelectedTags = () => {
		const selectedTags = this.getSelectedLeafTags();
		Object.entries(this.state.checkedRightPanelTags).forEach(([, tag]) => {
			if (!selectedTags.find(x => x.name === tag.name)) selectedTags.push(tag);
		});
		if (!selectedTags.length) return;

		const existing = [...(this.props.native.tags || [])];

		// Web Worker vasitəsilə collectLeaves əməliyyatını arxa planda icra et
		const workerCode = `
self.onmessage = function(e) {
	const { selectedTags, existing } = e.data;
	const toAdd = [];
	const existingNames = new Set(existing.map(x => x.name));
	const toAddNames = new Set();

	const sanitize = (rawName) => {
		const sanitized = rawName
			.replace(/\\[(\\d+(?:,\\d+)*)\\]/g, (_, dims) => '.' + dims.replace(/,/g, '.'))
			.replace(/:/g, '.');
		if (!rawName.startsWith('Program:')) {
			return 'ControllerTags.' + sanitized;
		}
		return sanitized;
	};

	const collectLeaves = (node) => {
		// EP entries are file metadata: expanding a tag must not replace its VALUE
		// with EP children (they are only added when checked individually).
		const structural = (node.members || []).filter(m => m.type !== 'EP');
		if (structural.length > 0) {
			structural.forEach(member => collectLeaves({
				name: node.name + '.' + member.name,
				type: member.type || 'DINT',
				members: member.members,
				hidden: node.hidden || member.hidden,
			}));
		} else {
			const address = node.name;
			const stateName = sanitize(address);
			if (!existingNames.has(stateName) && !toAddNames.has(stateName)) {
				toAddNames.add(stateName);
				// hidden AOI internals default to tier "none": state exists, no polling, no push
				toAdd.push({ name: stateName, address: address, type: node.type || 'DINT', unit: '', tier: node.hidden ? 'none' : 'normal', write: true });
			}
		}
	};

	selectedTags.forEach(tag => collectLeaves(tag));
	self.postMessage({ toAdd });
};
`;
		const blob = new Blob([workerCode], { type: 'application/javascript' });
		const workerUrl = URL.createObjectURL(blob);
		const worker = new Worker(workerUrl);

		worker.onmessage = e => {
			worker.terminate();
			URL.revokeObjectURL(workerUrl);
			const { toAdd } = e.data;
			if (toAdd.length > 0) {
				const allTags = [...existing, ...toAdd];
				this.props.onChange('tags', allTags);
				this.sendCommand('reloadTags', { tags: allTags }).catch(e2 => console.error('reloadTags error:', e2));
			}
		};

		worker.onerror = err => {
			console.error('Worker error:', err);
			worker.terminate();
			URL.revokeObjectURL(workerUrl);
		};

		worker.postMessage({ selectedTags, existing });
	};

	addTag = tag => {
		const address = tag && tag.name ? tag.name : String(tag);
		const stateName = this.sanitizeStateName(address);
		const existing = [...(this.props.native.tags || [])];
		if (!existing.find(x => x.name === stateName)) {
			this.props.onChange('tags', [
				...existing,
				{
					name: stateName,
					address: address,
					type: (tag && tag.type) || 'DINT',
					unit: '',
					tier: 'normal',
					write: true,
				},
			]);
		}
	};

	hasCheckedLeaves = () =>
		this.getSelectedLeafTags().length > 0 || Object.keys(this.state.checkedRightPanelTags).length > 0;

	renderMemberRows = (members, parentPath, level = 0) => {
		if (!members || members.length === 0) return null;

		const rows = [];
		members.forEach((member, index) => {
			const fullPath = `${parentPath}.${member.name}`;
			const indent = '\u00A0\u00A0'.repeat(level * 2); // Non-breaking spaces for indentation
			const isChecked = this.state.checkedNodes[fullPath] || false;

			rows.push(
				<TableRow
					key={`${parentPath}-${member.name}-${index}`}
					style={{
						background: level % 2 === 0 ? '#fff' : '#f9f9f9',
						cursor: 'pointer',
					}}
					hover
				>
					<TableCell padding="checkbox">
						<Checkbox
							color="primary"
							style={{ color: '#1976d2' }}
							checked={isChecked}
							onChange={() => {
								const newChecked = !isChecked;
								const newRightPanel = { ...this.state.checkedRightPanelTags };
								if (newChecked) {
									newRightPanel[fullPath] = { name: fullPath, type: member.type };
								} else {
									delete newRightPanel[fullPath];
								}
								this.setState({
									checkedNodes: { ...this.state.checkedNodes, [fullPath]: newChecked },
									checkedRightPanelTags: newRightPanel,
								});
							}}
							size="small"
						/>
					</TableCell>
					<TableCell style={{ color: '#333' }}>
						{indent}
						{member.name}
					</TableCell>
					<TableCell style={{ color: '#1565c0' }}>{member.type}</TableCell>
					<TableCell style={{ fontSize: 11, color: '#666' }}>{fullPath}</TableCell>
				</TableRow>,
			);

			// Recursively render nested members
			if (member.members && member.members.length > 0) {
				rows.push(...this.renderMemberRows(member.members, fullPath, level + 1));
			}
		});

		return rows;
	};

	filterTreeNodes = (nodes, filter) => {
		if (!filter) return nodes;
		const lf = filter.toLowerCase();
		const filtered = [];
		for (const node of nodes) {
			const labelMatch = node.label && node.label.toLowerCase().includes(lf);
			const typeMatch = node.tag && node.tag.type && node.tag.type.toLowerCase().includes(lf);
			if (labelMatch || typeMatch) {
				// the node itself matched — keep its whole subtree browsable
				filtered.push(node);
				continue;
			}
			const filteredChildren = this.filterTreeNodes(node.children || [], filter);
			if (filteredChildren.length > 0) {
				// ancestor on the path to a match — auto-opened so the match is visible
				filtered.push({ ...node, children: filteredChildren, _forceOpen: true });
			}
		}
		return filtered;
	};

	/**
	 * Aggregate check-display info over the tree. A leaf is "covered" when it is
	 * already among the configured tags OR user-checked; folders show a full check
	 * when every descendant leaf is covered and an indeterminate mark when only
	 * some are. "pure" nodes consist solely of already-configured leaves (purple).
	 */
	computeCheckInfo = () => {
		const { checkedNodes, treeData } = this.state;
		const configured = new Set((this.props.native.tags || []).map(t => t.name));
		const full = new Set();
		const partial = new Set();
		const pure = new Set();
		const walk = node => {
			let total = 0,
				covered = 0,
				cfg = 0;
			(node.children || []).forEach(child => {
				const r = walk(child);
				total += r.total;
				covered += r.covered;
				cfg += r.cfg;
			});
			// a selectable node counts as its own leaf even when it carries EP
			// children (Inp_PVData stays checkable next to its Navigation child)
			if (node.isLeaf && node.tag) {
				const san = node._san || (node._san = this.sanitizeStateName(node.tag.name));
				const isCfg = configured.has(san);
				const selfCovered = isCfg || !!checkedNodes[node.id];
				total += 1;
				if (selfCovered) covered += 1;
				if (isCfg) cfg += 1;
				if (!node.children || node.children.length === 0) {
					if (isCfg) pure.add(node.id);
					if (selfCovered) full.add(node.id);
					return { total, covered, cfg };
				}
			}
			if (total > 0 && covered === total) full.add(node.id);
			else if (covered > 0) partial.add(node.id);
			if (total > 0 && cfg === total) pure.add(node.id);
			return { total, covered, cfg };
		};
		(treeData || []).forEach(walk);
		return { full, partial, pure };
	};

	renderTreeNodes = (nodes, level = 0) => {
		const { expandedNodes, selectedNodeId } = this.state;

		if (!nodes || nodes.length === 0) {
			return null;
		}

		if (level === 0) {
			this._checkInfo = this.computeCheckInfo();
		}
		const checkInfo = this._checkInfo || { full: new Set(), partial: new Set(), pure: new Set() };

		return nodes.map(node => {
			const hasChildren = node.children && node.children.length > 0;
			const isExpanded = node._forceOpen || expandedNodes[node.id];
			const isSelected = selectedNodeId === node.id;
			const typeColor = node.tag ? this.getTypeColor(node.tag.type) : '#9e9e9e';

			return (
				<div key={node.id}>
					{/* Row */}
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							borderRadius: 4,
							padding: '1px 4px 1px 0',
							background: isSelected ? '#e3f2fd' : 'transparent',
							cursor: 'pointer',
							transition: 'background 0.12s',
						}}
						onMouseEnter={e => {
							if (!isSelected) e.currentTarget.style.background = '#f5f5f5';
						}}
						onMouseLeave={e => {
							e.currentTarget.style.background = isSelected ? '#e3f2fd' : 'transparent';
						}}
						onClick={() => {
							if (hasChildren) {
								this.toggleNodeExpand(node.id);
							}
							if (node.tag) {
								this.handleTagClick(node.tag, node.id);
							}
						}}
					>
						{/* Expand/Collapse icon */}
						<div
							style={{
								width: 22,
								height: 22,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								flexShrink: 0,
							}}
						>
							{hasChildren ? (
								<IconButton
									size="small"
									onClick={e => {
										e.stopPropagation();
										this.toggleNodeExpand(node.id);
									}}
									style={{ padding: 2 }}
								>
									{isExpanded ? (
										<ExpandMoreIcon style={{ fontSize: 16, color: '#666' }} />
									) : (
										<ChevronRightIcon style={{ fontSize: 16, color: '#666' }} />
									)}
								</IconButton>
							) : (
								<span style={{ width: 22 }} />
							)}
						</div>

						{/* Checkbox: full when every descendant is configured/checked, indeterminate when only some */}
						{(() => {
							const isFull = checkInfo.full.has(node.id);
							const isPartial = !isFull && checkInfo.partial.has(node.id);
							const isPure = checkInfo.pure.has(node.id);
							return (
								<Checkbox
									color="primary"
									size="small"
									checked={isFull}
									indeterminate={isPartial}
									onChange={e => {
										e.stopPropagation();
										if (!isPure) this.handleNodeToggle(node.id, e.target.checked);
									}}
									style={{ padding: 3, color: isPure ? '#9c27b0' : '#1976d2', flexShrink: 0 }}
									title={isPure ? 'Already configured' : undefined}
								/>
							);
						})()}

						{/* Type color dot */}
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: typeColor,
								flexShrink: 0,
								marginRight: 4,
							}}
						/>

						{/* Name */}
						<span
							style={{
								fontSize: 13,
								fontWeight: hasChildren ? 600 : 400,
								color: isSelected ? '#1565c0' : '#1a1a1a',
								opacity: node.hidden ? 0.45 : 1,
								flex: 1,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{node.label}
						</span>

						{/* Hidden AOI internal marker */}
						{node.hidden && (
							<span
								title={I18n.t(
									'Hidden AOI internal — excluded from group selection, tier defaults to none',
								)}
								style={{
									fontSize: 9,
									padding: '1px 5px',
									borderRadius: 8,
									background: '#eceff1',
									color: '#90a4ae',
									border: '1px dashed #b0bec5',
									flexShrink: 0,
									marginLeft: 4,
								}}
							>
								{I18n.t('internal')}
							</span>
						)}

						{/* Type badge */}
						{node.tag && (
							<span
								style={{
									fontSize: 10,
									padding: '1px 6px',
									borderRadius: 10,
									background: typeColor + '22',
									color: typeColor,
									fontWeight: 600,
									flexShrink: 0,
									marginLeft: 4,
									border: `1px solid ${typeColor}44`,
								}}
							>
								{node.tag.type || 'DINT'}
							</span>
						)}

						{/* Default value badge */}
						{node.tag && node.tag.defaultValue && (
							<span
								title={node.tag.defaultValue}
								style={{
									fontSize: 10,
									padding: '1px 5px',
									borderRadius: 10,
									background: '#e8f5e9',
									color: '#2e7d32',
									fontWeight: 500,
									flexShrink: 0,
									marginLeft: 4,
									maxWidth: 100,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									display: 'inline-block',
								}}
							>
								=
								{node.tag.defaultValue.length > 14
									? node.tag.defaultValue.substring(0, 14) + '…'
									: node.tag.defaultValue}
							</span>
						)}
					</div>

					{/* Children with connecting line */}
					{hasChildren && isExpanded && (
						<div
							style={{
								marginLeft: 30,
								borderLeft: '1px solid #dde',
								paddingLeft: 6,
								marginTop: 1,
							}}
						>
							{this.renderTreeNodes(node.children, level + 1)}
						</div>
					)}
				</div>
			);
		});
	};

	renderSelectedTagsTree = (filter = '') => {
		const allTags = this.props.native.tags || [];
		const lf = filter.toLowerCase();
		const { expandedSelectedNodes } = this.state;

		const scrollbarCss = `.tag-tree-scroll::-webkit-scrollbar{width:12px}.tag-tree-scroll::-webkit-scrollbar-track{background:#e0e0e0;border-radius:6px}.tag-tree-scroll::-webkit-scrollbar-thumb{background:#9e9e9e;border-radius:6px;border:2px solid #e0e0e0}.tag-tree-scroll::-webkit-scrollbar-thumb:hover{background:#757575}`;

		// Build tree: node = { _: leafTag|null, c: { key: node } }
		const buildTree = () => {
			const root = {};
			allTags.forEach((tag, idx) => {
				const parts = tag.name.split('.');
				let cur = root;
				for (let i = 0; i < parts.length; i++) {
					const k = parts[i];
					if (!cur[k]) cur[k] = { _: null, c: {} };
					if (i === parts.length - 1) cur[k]._ = { ...tag, _idx: idx };
					else cur = cur[k].c;
				}
			});
			return root;
		};

		const tree = buildTree();

		// Count leaf tags matching filter in a subtree
		const countLeaves = nodeMap => {
			let n = 0;
			for (const nd of Object.values(nodeMap)) {
				if (
					nd._ &&
					(!lf ||
						nd._.name.toLowerCase().includes(lf) ||
						(nd._.address || '').toLowerCase().includes(lf) ||
						(nd._.type || '').toLowerCase().includes(lf))
				)
					n++;
				n += countLeaves(nd.c);
			}
			return n;
		};

		// Collect all leaf tags from a subtree (including the node's own leaf)
		const collectLeaves = nd => {
			const out = [];
			if (nd._) out.push(nd._);
			for (const child of Object.values(nd.c)) out.push(...collectLeaves(child));
			return out;
		};

		// Cascade a tier to every descendant tag (EP states are file-served — tier is meaningless there)
		const setTierForLeaves = (leaves, tier) => {
			const indices = new Set(leaves.filter(t => (t.type || '') !== 'EP').map(t => t._idx));
			if (!indices.size) return;
			const newTags = allTags.map((t, i) => (indices.has(i) ? { ...t, tier } : t));
			this.props.onChange('tags', newTags);
		};

		// Common tier of a subtree ('' when mixed) for the group-level select
		const commonTier = leaves => {
			const tiers = [...new Set(leaves.filter(t => (t.type || '') !== 'EP').map(t => t.tier || 'normal'))];
			return tiers.length === 1 ? tiers[0] : '';
		};

		// Delete a subtree from config + ioBroker objects. Config first (instant UI),
		// then ONE recursive backend delete of the subtree root — the old per-object
		// socket loop took minutes on a 600-tag group and looked frozen.
		const deleteLeaves = async (leavesToDel, rootPath) => {
			const names = new Set(leavesToDel.map(t => t.name));
			const newTags = allTags.filter(t => !names.has(t.name));
			this.props.onChange('tags', newTags);
			this.sendCommand('deleteObjects', { ids: [rootPath] }).catch(() => {});
			this.sendCommand('reloadTags', { tags: newTags }).catch(() => {});
		};

		const renderNodes = (nodeMap, nodePath, level) => {
			return Object.entries(nodeMap).map(([key, node]) => {
				const fullPath = nodePath ? `${nodePath}.${key}` : key;
				const tag = node._;
				const hasChildren = Object.keys(node.c).length > 0;

				const matchCount =
					countLeaves(node.c) +
					(tag &&
					(!lf ||
						tag.name.toLowerCase().includes(lf) ||
						(tag.address || '').toLowerCase().includes(lf) ||
						(tag.type || '').toLowerCase().includes(lf))
						? 1
						: 0);

				if (matchCount === 0) return null;

				// Default: level 0 open, deeper collapsed
				const defaultOpen = level === 0;
				const isExpanded = lf
					? true
					: expandedSelectedNodes[fullPath] !== undefined
						? expandedSelectedNodes[fullPath]
						: defaultOpen;

				// ── LEAF ──────────────────────────────────────────────────
				if (!hasChildren) {
					if (!tag) return null;
					if (
						lf &&
						!tag.name.toLowerCase().includes(lf) &&
						!(tag.address || '').toLowerCase().includes(lf) &&
						!(tag.type || '').toLowerCase().includes(lf)
					)
						return null;
					const tc = this.getTypeColor(tag.type);
					return (
						<div
							key={fullPath}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								padding: '3px 6px',
								borderRadius: 3,
								minWidth: 0,
							}}
							onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
							onMouseLeave={e => (e.currentTarget.style.background = '')}
						>
							<span style={{ width: 20, flexShrink: 0 }} />
							<span style={{ width: 8, height: 8, borderRadius: '50%', background: tc, flexShrink: 0 }} />
							<span
								style={{
									flex: 1,
									fontFamily: 'monospace',
									fontSize: 13,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									minWidth: 0,
								}}
							>
								{key}
							</span>
							<span
								style={{
									flex: '0 0 38%',
									fontFamily: 'monospace',
									fontSize: 11,
									color: '#888',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									padding: '0 12px 0 0',
								}}
							>
								{tag.address || tag.name}
							</span>
							<span
								style={{
									fontSize: 11,
									color: tc,
									background: tc + '22',
									border: `1px solid ${tc}44`,
									padding: '1px 6px',
									borderRadius: 10,
									fontWeight: 700,
									flexShrink: 0,
								}}
							>
								{tag.type || 'DINT'}
							</span>
							<input
								value={tag.unit || ''}
								onChange={e => this.updateTag(tag._idx, 'unit', e.target.value)}
								placeholder="unit"
								style={{
									width: 54,
									flexShrink: 0,
									fontSize: 11,
									padding: '2px 5px',
									border: '1px solid #ccc',
									borderRadius: 3,
								}}
							/>
							<select
								value={tag.tier || 'normal'}
								onChange={e => this.updateTag(tag._idx, 'tier', e.target.value)}
								title={I18n.t('Tier')}
								style={{
									flexShrink: 0,
									fontSize: 11,
									padding: '2px 3px',
									border: '1px solid #ccc',
									borderRadius: 3,
								}}
							>
								<option value="fast">fast</option>
								<option value="normal">normal</option>
								<option value="slow">slow</option>
								<option value="push">push</option>
								<option value="none">none</option>
							</select>
							<IconButton
								size="small"
								style={{ padding: 2, flexShrink: 0 }}
								onClick={() => this.removeTag(tag._idx)}
							>
								<DeleteIcon style={{ fontSize: 15 }} />
							</IconButton>
						</div>
					);
				}

				// ── BRANCH ────────────────────────────────────────────────
				const bg = level === 0 ? '#e8eaf6' : level === 1 ? '#f0f2fa' : '#f7f8fc';
				const bl = level === 0 ? '4px solid #1976d2' : level === 1 ? '3px solid #5c6bc0' : '2px solid #b0bec5';
				const color = level === 0 ? '#1565c0' : level === 1 ? '#283593' : '#37474f';
				const fs = level === 0 ? 16 : level === 1 ? 14 : 13;
				const fw = level === 0 ? 700 : level === 1 ? 600 : 500;
				const py = level === 0 ? '6px' : level === 1 ? '4px' : '3px';
				const iconSz = level === 0 ? 20 : 18;

				return (
					<div
						key={fullPath}
						style={{ marginBottom: level === 0 ? 8 : level === 1 ? 2 : 0 }}
					>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 4,
								padding: `${py} 6px`,
								cursor: 'pointer',
								background: bg,
								borderLeft: bl,
								borderRadius: 3,
								marginBottom: 1,
							}}
							onClick={() => this.toggleSelectedNodeExpand(fullPath, defaultOpen)}
						>
							<IconButton
								size="small"
								style={{ padding: 1, flexShrink: 0 }}
								onClick={e => {
									e.stopPropagation();
									this.toggleSelectedNodeExpand(fullPath, defaultOpen);
								}}
							>
								{isExpanded ? (
									<ExpandMoreIcon style={{ fontSize: iconSz, color }} />
								) : (
									<ChevronRightIcon style={{ fontSize: iconSz, color }} />
								)}
							</IconButton>
							<span
								style={{
									flex: 1,
									fontWeight: fw,
									fontSize: fs,
									color,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									letterSpacing: level === 0 ? 0.3 : 0,
								}}
							>
								{key}
							</span>
							<span
								style={{
									fontSize: 11,
									fontWeight: 600,
									background: '#1976d2',
									color: '#fff',
									borderRadius: 10,
									padding: '1px 8px',
									flexShrink: 0,
								}}
							>
								{matchCount}
							</span>
							{(() => {
								const leaves = collectLeaves(node);
								const tier = commonTier(leaves);
								return (
									<select
										value={tier}
										onClick={e => e.stopPropagation()}
										onChange={e => {
											e.stopPropagation();
											if (e.target.value) setTierForLeaves(leaves, e.target.value);
										}}
										title={I18n.t('Set tier for all tags in this group')}
										style={{
											flexShrink: 0,
											fontSize: 11,
											padding: '2px 3px',
											border: '1px solid #ccc',
											borderRadius: 3,
											background: tier === 'push' ? '#e8f5e9' : '#fff',
										}}
									>
										{tier === '' && <option value="">{I18n.t('mixed')}</option>}
										<option value="fast">fast</option>
										<option value="normal">normal</option>
										<option value="slow">slow</option>
										<option value="push">push</option>
										<option value="none">none</option>
									</select>
								);
							})()}
							<IconButton
								size="small"
								style={{ padding: 2, flexShrink: 0 }}
								onClick={async e => {
									e.stopPropagation();
									await deleteLeaves(collectLeaves(node), fullPath);
								}}
							>
								<DeleteIcon style={{ fontSize: 15 }} />
							</IconButton>
						</div>
						{isExpanded && (
							<div
								style={{
									marginLeft: level === 0 ? 20 : 14,
									borderLeft: '1px solid #d0d0d0',
									paddingLeft: 6,
								}}
							>
								{renderNodes(node.c, fullPath, level + 1)}
							</div>
						)}
					</div>
				);
			});
		};

		if (!allTags.length) return null;

		const total = countLeaves(tree);
		if (lf && total === 0) {
			return [
				<style key="css">{scrollbarCss}</style>,
				<Typography
					key="no-match"
					variant="body2"
					style={{ color: '#888', padding: '12px 0' }}
				>
					{I18n.t('No matching states found')}
				</Typography>,
			];
		}

		return [<style key="css">{scrollbarCss}</style>, ...renderNodes(tree, '', 0)];
	};

	handleTabChange = (event, newValue) => {
		this.setState({ activeTab: newValue });
	};

	/**
	 * Instructions tab: full usage guide + downloadable Add-On Instructions.
	 * The L5X files are served from admin/aoi/ (static, ships with the adapter);
	 * IOB_PushAgent is source-protected — its logic is not readable in Studio.
	 */
	renderInstructions = classes => {
		const H = ({ children }) => (
			<Typography
				variant="h6"
				style={{ marginTop: 24, marginBottom: 8, color: '#1565c0' }}
			>
				{children}
			</Typography>
		);
		const P = ({ children }) => (
			<Typography
				variant="body2"
				style={{ marginBottom: 8, lineHeight: 1.7 }}
			>
				{children}
			</Typography>
		);
		const Step = ({ n, children }) => (
			<div style={{ display: 'flex', gap: 10, marginBottottom: 6, marginBottom: 6, alignItems: 'flex-start' }}>
				<span
					style={{
						background: '#1976d2',
						color: '#fff',
						borderRadius: '50%',
						width: 22,
						height: 22,
						fontSize: 12,
						fontWeight: 700,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
						marginTop: 2,
					}}
				>
					{n}
				</span>
				<Typography
					variant="body2"
					style={{ lineHeight: 1.7 }}
				>
					{children}
				</Typography>
			</div>
		);
		const Code = ({ children }) => (
			<code
				style={{
					background: '#eceff1',
					color: '#263238', // fixed dark text — the admin dark theme otherwise leaves white-on-white
					padding: '1px 6px',
					borderRadius: 4,
					fontSize: 12.5,
					fontFamily: 'monospace',
				}}
			>
				{children}
			</code>
		);
		const Dl = ({ file, label }) => (
			<Button
				variant="contained"
				size="small"
				style={{ marginRight: 12, marginBottom: 8 }}
				component="a"
				href={`aoi/${file}`}
				download={file}
			>
				⬇ {label}
			</Button>
		);

		return (
			<Paper
				className={classes.section}
				style={{
					maxWidth: 980,
					// long guide: own scrollbar — the admin iframe does not always scroll the page body
					maxHeight: 'calc(100vh - 200px)',
					overflowY: 'auto',
					paddingRight: 12,
				}}
			>
				<Typography
					variant="h5"
					gutterBottom
				>
					{I18n.t('Instructions')}
				</Typography>
				<P>
					Rockwell EtherNet/IP adapter for CompactLogix / ControlLogix (incl. PlantPAx v4/v5). Two ways to get
					data: <b>polling</b> (tiered scan classes) and <b>PLC push</b> (change-driven — the controller tells
					the adapter what changed).
				</P>

				<div
					style={{
						border: '2px solid #d32f2f',
						background: '#d32f2f18',
						borderRadius: 6,
						padding: '10px 14px',
						margin: '14px 0',
					}}
				>
					<Typography
						variant="body2"
						style={{ fontWeight: 700, lineHeight: 1.7, letterSpacing: 0.2 }}
					>
						⚠️ DISCLAIMER: THIS SOFTWARE COMMUNICATES WITH — AND CAN WRITE TO — INDUSTRIAL CONTROL
						EQUIPMENT. IT IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND. THE AUTHOR ACCEPTS NO
						RESPONSIBILITY OR LIABILITY FOR ANY DAMAGE TO EQUIPMENT, LOSS OF PRODUCTION, DATA LOSS, INJURY
						OR DEATH ARISING FROM ITS USE. IT IS NOT DESIGNED OR CERTIFIED FOR SAFETY-CRITICAL APPLICATIONS
						AND MUST NEVER BE PART OF A SAFETY FUNCTION. YOU USE IT ENTIRELY AT YOUR OWN RISK — VALIDATE
						EVERYTHING ON A NON-PRODUCTION CONTROLLER BEFORE CONNECTING TO A LIVE PLANT.
					</Typography>
				</div>

				<H>1. Quick start</H>
				<Step n={1}>
					<b>Connection tab</b>: enter the PLC IP (gateway), slot, choose the mode (Standard / PlantPAx v5)
					and paste your license key. <i>Check License</i> shows this machine&apos;s hardware id — send it to
					obtain a key.
				</Step>
				<Step n={2}>
					Choose the tag source: upload an <Code>.L5X</Code>/<Code>.L5K</Code> project export (recommended —
					enables extended properties, alarm definitions and hidden-member detection) or use{' '}
					<i>Live controller</i> browse.
				</Step>
				<Step n={3}>
					<b>Tag Configuration tab</b>: browse the tree, tick tags or whole groups, then{' '}
					<i>Add Selected Tags</i>. States appear under <Code>rockwell-enip.X.ControllerTags…</Code>
				</Step>
				<Step n={4}>
					<b>Selected Tags tab</b>: assign scan tiers — per tag or per group (the dropdown on a group row
					cascades to all its members). <b>Save</b> restarts the instance with the new set.
				</Step>

				<H>2. Scan tiers</H>
				<P>
					<Code>fast</Code> ≈ 250 ms, <Code>normal</Code> ≈ 1 s, <Code>slow</Code> ≈ 5 s (configurable on the
					Connection tab), <Code>push</Code> = change-driven via the PLC program (below), <Code>none</Code> =
					the state exists but is neither polled nor pushed. Members marked <i>internal</i> (hidden AOI
					working data such as <Code>Wrk_*</Code> timers) are excluded from group selection automatically and
					default to <Code>none</Code> — they change every scan and carry no operator value.
				</P>

				<H>3. PLC push — change flags (default transport, works on FactoryTalk Logix Echo too)</H>
				<P>
					The controller runs a small generated routine: it copies each selected instance into a buffer, a
					generic <Code>IOB_DirtyCheck</Code> Add-On Instruction compares only the members you selected and
					raises a flag when something changed. The adapter polls the flag array (one tiny read), fetches only
					the flagged instances and updates the states — typically within 250 ms, with near-zero idle traffic.
				</P>
				<div style={{ margin: '12px 0' }}>
					<Dl
						file="IOB_DirtyCheck.L5X"
						label="IOB_DirtyCheck.L5X (AOI, source-protected)"
					/>
				</div>
				<Step n={1}>
					Studio 5000: <i>Add-On Instructions → Import Add-On Instruction…</i> → select the downloaded{' '}
					<Code>IOB_DirtyCheck.L5X</Code>.
				</Step>
				<Step n={2}>
					Here in the admin: enable <b>PLC push mode</b> (Connection tab), keep transport ={' '}
					<i>Change flags</i>. In <b>Selected Tags</b> set tier <Code>push</Code> on the groups/tags you want
					change-driven, then <b>Save</b>.
				</Step>
				<Step n={3}>
					Click <b>Export PLC push program (L5X)</b> → you get <Code>IOB_PushMap.L5X</Code> generated for YOUR
					selection (member addresses are resolved live from the controller).
				</Step>
				<Step n={4}>
					Studio 5000: right-click your program&apos;s <i>Routines → Import Routine…</i> → select{' '}
					<Code>IOB_PushMap.L5X</Code> → accept all tags as <i>Create</i>. Add a <Code>JSR IOB_PushMap</Code>{' '}
					call to a ~100 ms periodic task. Verify → Download.
				</Step>
				<Step n={5}>
					Done. The adapter fills the watch lists over the network at start and re-fills them automatically
					after every Studio download — no re-import needed unless you change WHICH instances are pushed.
				</Step>
				<P>
					Log shows <Code>push: N group(s) … tags watched</Code> at start and a <Code>push: ok/DOWN</Code>{' '}
					health section in the periodic statistics line; set the instance log level to <i>debug</i> to see
					every pushed value with a millisecond timestamp.
				</P>

				<H>4. PLC push — TCP stream (physical controllers only)</H>
				<P>
					Alternative transport for real hardware: the source-protected <Code>IOB_PushAgent</Code> AOI streams
					changes to the adapter over a TCP socket (Logix Socket Object — not available in the Logix Echo
					emulator). Use it when you want the PLC to initiate traffic instead of being polled for flags.
				</P>
				<div style={{ margin: '12px 0' }}>
					<Dl
						file="IOB_PushAgent.L5X"
						label="IOB_PushAgent.L5X (AOI, source-protected)"
					/>
				</div>
				<Step n={1}>Import the AOI, set transport = TCP stream + port on the Connection tab, Save.</Step>
				<Step n={2}>
					Export the push program and import it as in section 3; additionally create three MESSAGE tags and
					configure the Socket Object MSGs (CIP Generic, class <Code>342</Code>: Socket Create / Open
					Connection / Write Socket) on the AOI&apos;s message parameters. Destination string:{' '}
					<Code>&lt;ioBroker-IP&gt;?port=&lt;push port&gt;</Code>, via the UNCONNECTED path when the
					controller&apos;s embedded Ethernet port is used.
				</Step>
				<Step n={3}>
					Open the push port in the ioBroker host firewall. The stats line shows <Code>push: ok</Code> once
					frames arrive.
				</Step>

				<H>5. Alarms &amp; extended properties</H>
				<P>
					<Code>@Alarms</Code> conditions (48 attributes each) and <Code>@AlarmSet</Code> summaries are read
					through the Logix alarm interface and stay on polling even when selected as push —{' '}
					<Code>Sts_*</Code> alarm bits inside the instance ARE pushable. Extended properties (Description,
					Label, EngineeringUnit…) are served from the uploaded project file as static states — no PLC reads.
				</P>

				<H>6. Licensing</H>
				<P>
					<b>Free tier</b> (no key): all features including push, up to <b>1000</b> tags, adapter instance{' '}
					<Code>0</Code> only — ideal for evaluation and small systems. Paid editions (the key is bound to the
					machine and shared by its instances): <b>Standard</b> — instances <Code>0..1</Code>, up to 3000 tags
					each; <b>Professional</b> — instances <Code>0..2</Code>, up to 10000 tags each; <b>Unlimited</b> —
					unlimited instances and tags. A license is issued for a <b>physical machine</b> or a{' '}
					<b>virtual machine (VM)</b>; running the adapter inside a VM requires a VM license (priced
					separately), so mention your setup when ordering. Click <i>Check License</i> on the Connection tab
					to see this machine&apos;s <b>Hardware ID</b> and send it with your order.
				</P>

				<H>7. Troubleshooting</H>
				<P>
					• <i>Invalid size of array</i> on Verify → a controller tag (e.g. <Code>IOB_DC_WL_x</Code>) has an
					old dimension; set its data type exactly as the AOI parameter (offline), or delete the old{' '}
					<Code>IOB_DC_*</Code> tags and re-import the routine.
					<br />• <i>push: DOWN</i> in the stats → the flag reads are failing: controller unreachable or the
					program is not running (check the JSR).
					<br />• After a Studio <b>download</b> the adapter detects the wiped watch lists and rewrites them
					within a few seconds — if you also changed the pushed instance set, do a fresh Export/Import.
					<br />• Windows upgrade: stop the instance, <Code>npm i</Code>, then{' '}
					<Code>iobroker upload rockwell-enip</Code> (the browser caches the admin bundle), then start.
				</P>
			</Paper>
		);
	};

	render() {
		const { classes, native } = this.props;
		const { testingConnection, connectionStatus, browsingTags, showTagBrowser, treeData, treeStats, activeTab } =
			this.state;

		return (
			<div>
				<Paper style={{ marginBottom: 16 }}>
					<Tabs
						value={activeTab}
						onChange={this.handleTabChange}
						indicatorColor="primary"
						textColor="primary"
					>
						<Tab label={I18n.t('Connection')} />
						<Tab label={I18n.t('Tag Configuration')} />
						<Tab label={I18n.t('Selected Tags')} />
						<Tab label={I18n.t('Instructions')} />
					</Tabs>
				</Paper>

				{this.state.buildProgress > 0 && this.state.buildProgress < 100 && (
					<Paper style={{ marginBottom: 16, padding: 12 }}>
						<Typography variant="body2" style={{ marginBottom: 6 }}>
							{I18n.t('Building objects')}: {this.state.buildProgress}%
						</Typography>
						<LinearProgress variant="determinate" value={this.state.buildProgress} />
					</Paper>
				)}

				{activeTab === 0 && (
					<Paper className={classes.section}>
						<Typography
							variant="h6"
							gutterBottom
						>
							{I18n.t('PLC Connection')}
						</Typography>

						<TextField
							label={I18n.t('PLC Host/IP')}
							className={classes.input}
							value={native.plcHost || ''}
							onChange={e => this.props.onChange('plcHost', e.target.value)}
							margin="normal"
							fullWidth
						/>

						<TextField
							label={I18n.t('PLC Slot')}
							className={classes.input}
							value={native.plcSlot || 0}
							type="number"
							onChange={e => this.props.onChange('plcSlot', parseInt(e.target.value))}
							margin="normal"
							fullWidth
						/>

						<TextField
							select
							label={I18n.t('Driver Mode')}
							className={classes.input}
							value={native.mode || 'standard'}
							onChange={e => this.props.onChange('mode', e.target.value)}
							margin="normal"
							fullWidth
						>
							<MenuItem value="standard">Standard</MenuItem>
							<MenuItem value="plantpax_v4">PlantPAx v4</MenuItem>
							<MenuItem value="plantpax_v5">PlantPAx v5</MenuItem>
						</TextField>

						<div style={{ display: 'flex', gap: 12 }}>
							<TextField
								label={I18n.t('Poll fast (ms)')}
								value={(native.pollTiers && native.pollTiers.fastMs) || 250}
								type="number"
								onChange={e => this.updateTier('fastMs', e.target.value)}
								margin="normal"
							/>
							<TextField
								label={I18n.t('Poll normal (ms)')}
								value={(native.pollTiers && native.pollTiers.normalMs) || 1000}
								type="number"
								onChange={e => this.updateTier('normalMs', e.target.value)}
								margin="normal"
							/>
							<TextField
								label={I18n.t('Poll slow (ms)')}
								value={(native.pollTiers && native.pollTiers.slowMs) || 5000}
								type="number"
								onChange={e => this.updateTier('slowMs', e.target.value)}
								margin="normal"
							/>
						</div>

						<TextField
							select
							label={I18n.t('CIP Payload')}
							className={classes.input}
							value={native.cipPayload || 0}
							onChange={e => this.props.onChange('cipPayload', parseInt(e.target.value))}
							margin="normal"
							fullWidth
						>
							<MenuItem value={0}>{I18n.t('Auto')}</MenuItem>
							<MenuItem value={508}>508 (standard)</MenuItem>
							<MenuItem value={4002}>4002 (Large Forward Open)</MenuItem>
						</TextField>

						<TextField
							select
							label={I18n.t('Parallel connections')}
							className={classes.input}
							value={native.parallelConnections || 1}
							onChange={e => this.props.onChange('parallelConnections', parseInt(e.target.value))}
							margin="normal"
							fullWidth
							helperText={I18n.t(
								'More CIP connections multiply read throughput (4 is a good maximum for L8x)',
							)}
						>
							<MenuItem value={1}>1</MenuItem>
							<MenuItem value={2}>2</MenuItem>
							<MenuItem value={4}>4</MenuItem>
							<MenuItem value={8}>8</MenuItem>
						</TextField>

						<div className={classes.controlElement}>
							<label>
								<Checkbox
									checked={!!native.pushMode}
									onChange={e => this.props.onChange('pushMode', e.target.checked)}
								/>
								{I18n.t('PLC push mode (change-driven, needs the generated program)')}
							</label>
						</div>

						<TextField
							select
							label={I18n.t('Push transport')}
							className={classes.input}
							value={native.pushTransport || 'poll'}
							onChange={e => this.props.onChange('pushTransport', e.target.value)}
							margin="normal"
							fullWidth
							helperText={I18n.t(
								'Change flags work everywhere (incl. Logix Echo); TCP stream needs a physical controller',
							)}
						>
							<MenuItem value="poll">{I18n.t('Change flags (polled — any controller)')}</MenuItem>
							<MenuItem value="socket">
								{I18n.t('TCP stream (Socket Object — physical PLC only)')}
							</MenuItem>
						</TextField>

						{(native.pushTransport || 'poll') === 'socket' && (
							<TextField
								label={I18n.t('Push port')}
								className={classes.input}
								value={native.pushPort || 44819}
								type="number"
								onChange={e => this.props.onChange('pushPort', parseInt(e.target.value))}
								margin="normal"
								fullWidth
							/>
						)}

						<Button
							variant="contained"
							className={classes.button}
							onClick={this.exportPushProgram}
							disabled={!(native.tags || []).length}
						>
							{I18n.t('Export PLC push program (L5X)')}
						</Button>

						<TextField
							label={I18n.t('Connection Timeout')}
							className={classes.input}
							value={native.connectionTimeout || 5000}
							type="number"
							onChange={e => this.props.onChange('connectionTimeout', parseInt(e.target.value))}
							margin="normal"
							fullWidth
						/>

						<TextField
							label={I18n.t('License Key')}
							className={classes.input}
							value={native.licenseKey || ''}
							onChange={e => this.props.onChange('licenseKey', e.target.value)}
							margin="normal"
							fullWidth
							helperText={I18n.t(
								'Empty = free tier: all features, up to 1000 tags, adapter instance 0 only. A license raises the tag limit and unlocks additional instances.',
							)}
							multiline
							rows={2}
						/>
						<div>
							<Button
								variant="outlined"
								className={classes.button}
								onClick={() => this.checkLicense(native.licenseKey || '')}
								disabled={this.state.checkingLicense}
							>
								{I18n.t('Check License')}
							</Button>
							{this.state.licenseInfo && (
								<Typography
									variant="body2"
									style={{ color: this.state.licenseInfo.valid ? 'green' : '#c62828', marginTop: 6 }}
								>
									{this.state.licenseInfo.message}
								</Typography>
							)}
							{this.state.licenseInfo && (
								<Typography
									variant="body2"
									style={{ marginTop: 4, wordBreak: 'break-all' }}
								>
									{I18n.t('Hardware ID')}: <code>{this.state.licenseInfo.hardwareId}</code>
								</Typography>
							)}
						</div>

						<div>
							<Button
								variant="contained"
								color="primary"
								className={classes.button}
								onClick={this.testConnection}
								disabled={testingConnection || !native.plcHost}
							>
								{I18n.t('Test Connection')}
							</Button>

							<Button
								variant="contained"
								className={classes.button}
								onClick={this.browseTags}
								disabled={browsingTags || (native.projectFormat !== 'live' && !native.projectFile)}
							>
								{native.projectFormat === 'live' ? I18n.t('Browse controller') : I18n.t('Browse Tags')}
							</Button>

							<TextField
								select
								label={I18n.t('Project source')}
								className={classes.input}
								style={{ minWidth: 220, marginRight: 10 }}
								value={native.projectFormat || 'l5k'}
								onChange={e => this.props.onChange('projectFormat', e.target.value)}
							>
								<MenuItem value="l5k">{I18n.t('L5K file')}</MenuItem>
								<MenuItem value="l5x">{I18n.t('L5X file')}</MenuItem>
								<MenuItem value="live">{I18n.t('Live controller')}</MenuItem>
							</TextField>

							{native.projectFormat !== 'live' && (
								<>
									<input
										accept={(native.projectFormat || 'l5k') === 'l5x' ? '.l5x,.L5X' : '.l5k,.L5K'}
										style={{ display: 'none' }}
										id="l5k-file-upload"
										type="file"
										onChange={this.handleFileUpload}
									/>
									<label htmlFor="l5k-file-upload">
										<Button
											variant="contained"
											component="span"
											className={classes.button}
											disabled={this.state.uploadingFile}
										>
											{this.state.uploadingFile
												? `${I18n.t('Uploading')} ${this.state.uploadProgress}%`
												: I18n.t('Upload Project File (L5K/L5X)')}
										</Button>
									</label>

									{native.projectFile && (
										<Button
											variant="contained"
											color="secondary"
											className={classes.button}
											onClick={this.parseProjectFile}
											disabled={this.state.parsingFile || this.state.uploadingFile}
										>
											{I18n.t('Parse File')}
										</Button>
									)}
								</>
							)}

							<Typography
								variant="body2"
								style={{ color: '#777', marginTop: 8, wordBreak: 'break-all' }}
							>
								{native.projectFormat === 'live'
									? I18n.t(
											'Live browse shows structure only — extended properties and alarms come from a project file',
										)
									: `${I18n.t('Project file')}: ${native.projectFile || I18n.t('none — upload one to enable Browse')}`}
							</Typography>

							{this.state.projectFileError && (
								<Typography
									variant="body2"
									style={{ color: 'red', marginTop: 6, wordBreak: 'break-all' }}
								>
									{this.state.projectFileError}
								</Typography>
							)}

							{connectionStatus === 'success' && (
								<Typography
									variant="body2"
									style={{ color: 'green', marginTop: 10 }}
								>
									{I18n.t('Connection successful')}
								</Typography>
							)}

							{connectionStatus === 'error' && (
								<Typography
									variant="body2"
									style={{ color: 'red', marginTop: 10 }}
								>
									{I18n.t('Connection failed')}
								</Typography>
							)}
						</div>
					</Paper>
				)}

				{activeTab === 1 && (
					<Paper className={classes.section}>
						<Typography
							variant="h6"
							gutterBottom
						>
							{I18n.t('Tag Configuration')}
						</Typography>

						{showTagBrowser && treeData.length > 0 && (
							<div>
								<div className={classes.treeToolbar}>
									<div>
										<Typography variant="subtitle1">{I18n.t('Parsed Tag Tree')}</Typography>
										{treeStats && (
											<div className={classes.treeStats}>
												<span>
													{I18n.t('Controller Tags')}: {treeStats.controllerTags ?? 0}
												</span>
												<span>
													{I18n.t('Programs')}: {treeStats.programs ?? 0}
												</span>
												<span>
													{I18n.t('Data Types')}: {treeStats.dataTypes ?? 0}
												</span>
											</div>
										)}
									</div>
									<Button
										variant="contained"
										color="primary"
										onClick={this.handleAddSelectedTags}
										disabled={!this.hasCheckedLeaves()}
									>
										{I18n.t('Add Selected Tags')}
									</Button>
								</div>

								{/* Tree View */}
								<div style={{ marginTop: 16 }}>
									<div
										style={{
											border: '1px solid #ddd',
											borderRadius: 4,
											padding: 8,
											display: 'flex',
											flexDirection: 'column',
											maxHeight: 600,
											background: '#fff',
										}}
									>
										<TextField
											placeholder={I18n.t('Search tags...')}
											value={this.state.treeSearch}
											onChange={e => this.setState({ treeSearch: e.target.value })}
											size="small"
											fullWidth
											style={{ marginBottom: 6, flexShrink: 0 }}
											inputProps={{
												style: {
													fontSize: 12,
													padding: '5px 8px',
													color: '#1a1a1a',
													caretColor: '#1a1a1a',
												},
											}}
										/>
										<div style={{ overflowY: 'auto', flex: 1 }}>
											{this.renderTreeNodes(
												this.filterTreeNodes(treeData, this.state.treeSearch),
											)}
										</div>
									</div>
								</div>
							</div>
						)}
					</Paper>
				)}

				{activeTab === 2 && (
					<Paper className={classes.section}>
						<div
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								marginBottom: 16,
							}}
						>
							<div>
								<Typography
									variant="h6"
									style={{ color: '#1a1a1a' }}
								>
									{I18n.t('Selected Tags')}
									<span
										style={{
											marginLeft: 10,
											fontSize: 13,
											background: '#1976d2',
											color: '#fff',
											borderRadius: 12,
											padding: '2px 10px',
											verticalAlign: 'middle',
										}}
									>
										{(native.tags || []).length}
									</span>
								</Typography>
								<Typography
									variant="body2"
									style={{ color: '#777', marginTop: 4 }}
								>
									{I18n.t('These states will be created in ioBroker and polled from the PLC')}
								</Typography>
							</div>
							{(native.tags || []).length > 0 && (
								<Button
									variant="outlined"
									color="secondary"
									size="small"
									onClick={this.removeAllTags}
								>
									{I18n.t('Remove All')}
								</Button>
							)}
						</div>
						{(native.tags || []).length > 0 && (
							<TextField
								placeholder={I18n.t('Search states...')}
								value={this.state.selectedTagsSearch}
								onChange={e => this.setState({ selectedTagsSearch: e.target.value })}
								size="small"
								fullWidth
								style={{ marginBottom: 12 }}
								inputProps={{ style: { fontSize: 13, padding: '6px 10px' } }}
							/>
						)}
						<div
							className="tag-tree-scroll"
							style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}
						>
							{(native.tags || []).length > 0 ? (
								this.renderSelectedTagsTree(this.state.selectedTagsSearch)
							) : (
								<Typography
									variant="body2"
									style={{ color: '#888', padding: '24px 0', textAlign: 'center' }}
								>
									{I18n.t(
										'No tags selected. Use the Tag Configuration tab to browse and select tags.',
									)}
								</Typography>
							)}
						</div>
					</Paper>
				)}

				{activeTab === 3 && this.renderInstructions(classes)}
			</div>
		);
	}
}

export default withStyles(styles)(Settings);
