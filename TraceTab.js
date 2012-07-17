/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
	'use strict';

	var ScriptAgent = brackets.getModule("LiveDevelopment/Agents/ScriptAgent");

	var Debugger = require("Debugger");
	var Panel    = require("Panel");

	var tabId = "jdiehl-debugger-traces";
	
	var $tab, $events, $tree;

	var _tree = [{
		data: "Root 1",
		state: "closed",
		children: [{
			data: "Child 1",
			children: []
		}, {
			data: "Child 2",
			children: []
		}]
	}, {
		data: "Root 2",
		state: "closed",
		children: []
	}];

	function onPaused(event, pause) {
		var breakpoints = pause.breakpoints;
		for (var i = 0; i < breakpoints.length; i++) {
			var breakpoint = breakpoints[i];
			if (! breakpoint.trace) { continue; }
			var trace = breakpoint.trace[breakpoint.trace.length - 1];
			// Todo: update tree if one of trace's parents is shown
		}
	}

	var eventTraces = [];

	function _twoDigits(number) {
		return String(100 + number).slice(-2);
	}

	function _formatTime(time) {
		return [time.getHours(), time.getMinutes(), time.getSeconds()].map(_twoDigits).join(":");
	}

	function onEventTrace(e, trace) {
		console.log("onEventTrace", trace.id, trace);
		
		eventTraces.push(trace);
		
		var eventType = trace.event.data.eventName.replace(/^listener:/, '');
		var frame = trace.callFrames[0];
		var scriptId = frame.location.scriptId;
		var url = ScriptAgent.scriptWithId(scriptId).url;
		var file = url.replace(/^.*\//, '');
		var fn = frame.functionName;

		$('<div>')
			.append($('<div class="time">').text(_formatTime(trace.date)))
			.append($('<div class="type">').text(eventType))
			.append($('<div class="file">').text(file))
			.append($('<div class="function">').text(fn))
			.click(function () {
				console.log(trace);
			})
			.appendTo($events);
	}

	function _treeDataProvider(treeNode, callback) {
		var prefix;
		if (treeNode === -1) {
			prefix = "";
		} else {
			prefix = treeNode.data("prefix");
		}
		
		var children = [];
		for (var i = 0; i < 26; i++) {
			var letter = String.fromCharCode(65 + i);
			children.push({ data: prefix + letter, state: "closed", children: [], metadata: { prefix: prefix + letter } });
		}
		callback(children);
	}
	
	function setupTree($tree) {
		// Mostly taken from Brackets' ProjectManager.js
		$tree.jstree({
			core : { animation: 0 },
			plugins : ["ui", "themes", "json_data"],
			json_data : { data: _treeDataProvider, correct_state: false },
			themes : { theme: "brackets", url: "styles/jsTreeTheme.css", dots: false, icons: false },
		})
		.bind(
			"before.jstree",
			function (event, data) {
				//console.log("before.jstree");
				return;
				if (data.func === "toggle_node") {
					// jstree will automaticaly select parent node when the parent is closed
					// and any descendant is selected. Prevent the select_node handler from
					// immediately toggling open again in this case.
					suppressToggleOpen = _projectTree.jstree("is_open", data.args[0]);
				}
			}
		)
		.bind(
			"select_node.jstree",
			function (event, data) {
				console.log("select_node.jstree");
				return;
				var entry = data.rslt.obj.data("entry");
				if (entry.isFile) {
					var openResult = FileViewController.openAndSelectDocument(entry.fullPath, FileViewController.PROJECT_MANAGER);
				
					openResult.done(function () {
						// update when tree display state changes
						_redraw(true);
						_lastSelected = data.rslt.obj;
					}).fail(function () {
						if (_lastSelected) {
							// revert this new selection and restore previous selection
							_forceSelection(data.rslt.obj, _lastSelected);
						} else {
							_projectTree.jstree("deselect_all");
							_lastSelected = null;
						}
					});
				} else {
					// show selection marker on folders
					_redraw(true);
					
					// toggle folder open/closed
					// suppress if this selection was triggered by clicking the disclousre triangle
					if (!suppressToggleOpen) {
						_projectTree.jstree("toggle_node", data.rslt.obj);
					}
				}
				
				suppressToggleOpen = false;
			}
		)
		.bind(
			"reopen.jstree",
			function (event, data) {
				console.log("reopen.jstree");
				return;
				// This handler fires for the initial load and subsequent
				// reload_nodes events. For each depth level of the tree, we open
				// the saved nodes by a fullPath lookup.
				if (_projectInitialLoad.previous.length > 0) {
					// load previously open nodes by increasing depth
					var toOpenPaths = _projectInitialLoad.previous.shift(),
						toOpenIds   = [],
						node        = null;
	
					// use path to lookup ID
					$.each(toOpenPaths, function (index, value) {
						node = _projectInitialLoad.fullPathToIdMap[value];
						
						if (node) {
							toOpenIds.push(node);
						}
					});
	
					// specify nodes to open and load
					data.inst.data.core.to_open = toOpenIds;
					_projectTree.jstree("reload_nodes", false);
				}
				if (_projectInitialLoad.previous.length === 0) {
					// resolve after all paths are opened
					result.resolve();
				}
			}
		)
		.bind(
			"scroll.jstree",
			function (e) {
				console.log("scroll.jstree");
				return;
				// close all dropdowns on scroll
				Menus.closeAll();
			}
		)
		.bind(
			"loaded.jstree open_node.jstree close_node.jstree",
			function (event, data) {
				console.log("loaded.jstree open_node.jstree close_node.jstree", event.type);
				return;
				if (event.type === "open_node") {
					// select the current document if it becomes visible when this folder is opened
					var curDoc = DocumentManager.getCurrentDocument();
					
					if (_hasFileSelectionFocus() && curDoc) {
						var entry = data.rslt.obj.data("entry");
						
						if (curDoc.file.fullPath.indexOf(entry.fullPath) === 0) {
							_forceSelection(data.rslt.obj, _lastSelected);
						} else {
							_redraw(true, false);
						}
					}
				} else if (event.type === "close_node") {
					// always update selection marker position when collapsing a node
					_redraw(true, false);
				} else {
					_redraw(false);
				}
				
				_savePreferences();
			}
		)
		.bind(
			"mousedown.jstree",
			function (event) {
				console.log("mousedown.jstree");
				return;
				// select tree node on right-click
				if (event.which === 3) {
					var treenode = $(event.target).closest("li");
					if (treenode) {
						var saveSuppressToggleOpen = suppressToggleOpen;
						
						// don't toggle open folders (just select)
						suppressToggleOpen = true;
						_projectTree.jstree("deselect_all");
						_projectTree.jstree("select_node", treenode, false);
						suppressToggleOpen = saveSuppressToggleOpen;
					}
				}
			}
		);

		// jstree has a default event handler for dblclick that attempts to clear the
		// global window selection (presumably because it doesn't want text within the tree
		// to be selected). This ends up messing up CodeMirror, and we don't need this anyway
		// since we've turned off user selection of UI text globally. So we just unbind it,
		// and add our own double-click handler here.
		// Filed this bug against jstree at https://github.com/vakata/jstree/issues/163
		$tree.bind("init.jstree", function () {
			console.log("init.jstree");
			return;
			// install scroller shadows
			ViewUtils.addScrollerShadow(_projectTree.get(0));
			
			_projectTree
				.unbind("dblclick.jstree")
				.bind("dblclick.jstree", function (event) {
					var entry = $(event.target).closest("li").data("entry");
					if (entry && entry.isFile) {
						FileViewController.addToWorkingSetAndSelect(entry.fullPath);
					}
				});

			// fire selection changed events for sidebar-selection
			$projectTreeList = $projectTreeContainer.find("ul");
			ViewUtils.sidebarList($projectTreeContainer, "jstree-clicked", "jstree-leaf");
			$projectTreeContainer.show();
		});
	}

	// init
	function init() {
		// configure tab content
		$tab = $('<div class="table-container">').attr('id', tabId);
		$events = $('<div class="events">').appendTo($tab);
		$tree = $('<div class="tree">').appendTo($tab).html('<ul><li><a href="#">Root</a><ul><li><a href="#">Child 1</a></li><li><a href="#">Child 2</a></li></ul></li><li><a href="#">Single entry</a></li></ul>');
		Panel.addTab(tabId, "Traces", $tab);

		setupTree($tree);

		$(Debugger).on("paused", onPaused);
		$(Debugger).on("eventTrace", onEventTrace);
	}

	function unload() {
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
});
