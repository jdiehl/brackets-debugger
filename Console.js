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

	var Inspector = brackets.getModule("LiveDevelopment/Inspector/Inspector");
	var EditorManager = brackets.getModule("editor/EditorManager");

	var Debugger = require("Debugger");

	var $panel, $panelToolbar;
	var $consoleContainer, $consoleOut, $consolePrompt;
	var $btnPause, $btnStep, $btnContinue;
	var $tabConsole, $tabTraces;
	var $tracesTree;
	var _lastMessage;

	// add a message
	function _add(level, message, wasThrown) {
		var $msg = $("<div>");
		$msg.addClass(level);
		if (wasThrown) $msg.addClass("error");

		switch (level) {

		// command
		case "out":
			$msg.text(message);
			break;

		// response
		case "in":
			if (message.text) {
				$msg.text(message.text);
			} else if (message.description) {
				$msg.text(message.description);
			} else {
				if (message.type === "undefined" || message.type === "null") {
					$msg.text(message.type);
					$msg.addClass("null");
				} else {
					$msg.text("[" + message.type + "]");
				}
			}
			break;

		// log message
		default:
			$msg.text(message.text);
		}

		$consoleOut.append($msg);
		$consoleOut.scrollTop($msg.offset().top);
	}

	// on prompt keypress
	var _history = [];
	var _curHistory;
	function _onPromptKeypress(e) {

		switch (e.keyCode) {
		case 13: // return
			_curHistory = undefined;
			var command = $consolePrompt.val();
			$consolePrompt.val("");
			_add("out", command);
			_history.push(command);
			Debugger.evaluate(command, function (res) {
				_add("in", res.result, res.wasThrown);
			});
			break;

		case 38: // up
			if (_curHistory !== undefined || $consolePrompt.val().length === 0) {
				_curHistory = _curHistory === undefined ? _history.length - 1 : _curHistory - 1;
				if (_curHistory < 0) {
					_curHistory = 0;
				} else {
					$consolePrompt.val(_history[_curHistory]);
				}
			}
			break;

		case 40: // down
			if (_curHistory !== undefined) {
				_curHistory++;
				if (_curHistory > _history.length - 1) {
					_curHistory = _history.length - 1;
				} else {
					$consolePrompt.val(_history[_curHistory]);
				}
			}
			break;

		default:
			_curHistory = undefined;
		}
	}

	function _onTabClicked(event) {
		var $tab = $(event.target).closest('li');
		var $content = $("#" + $tab.attr('data-id'));

		$tab.addClass('active').siblings().removeClass('active');
		$content.addClass('active').siblings('.table-container').removeClass('active');
	}

	// WebInspector Event: Console.messageAdded
	function _onMessageAdded(res) {
		// res = {message}
		_lastMessage = res.message;
		_add(_lastMessage.level, _lastMessage);
	}

	// WebInspector Event: Console.messageRepeatCountUpdated
	function _onMessageRepeatCountUpdated(res) {
		// res = {count}
		if (_lastMessage) {
			_add(_lastMessage.level, _lastMessage);
		}
	}

	function _onConnect() {
		Inspector.Console.enable();
		toggle(true);
		setupTree($tracesTree);
	}

	function _onDisconnect() {
		toggle(false);
	}

	// init
	function init() {
		// configure the console
		$panel = $('<div id="jdiehl-debugger-panel" class="bottom-panel">');

		// configure the toolbar
		$panelToolbar = $('<div class="toolbar simple-toolbar-layout">');
		$btnPause = $('<button class="pause">').appendTo($panelToolbar).on("click", Debugger.pause);
		$btnContinue = $('<button class="resume">').appendTo($panelToolbar).on("click", Debugger.resume);
		$btnStep = $('<button class="stepOver">').appendTo($panelToolbar).on("click", Debugger.stepOver);
		$btnStep = $('<button class="stepInto">').appendTo($panelToolbar).on("click", Debugger.stepInto);
		$btnStep = $('<button class="stepOut">').appendTo($panelToolbar).on("click", Debugger.stepOut);
		var $tabs = $('<ul class="toolbar-tabs">').appendTo($panelToolbar).on('click', 'li', _onTabClicked);
		$tabConsole = $('<li data-id="jdiehl-debugger-console">Console</a>').appendTo($tabs);
		$tabTraces  = $('<li data-id="jdiehl-debugger-traces" class="active">Traces</a>').appendTo($tabs);
		$panelToolbar.append('<a href="#" class="close">&times;</a>');
		$panel.append($panelToolbar);

		// configure the container
		$consoleContainer = $('<div class="table-container" id="jdiehl-debugger-console">').appendTo($panel);
		$consoleOut = $('<div class="output">').appendTo($consoleContainer);
		$consolePrompt = $('<input class="prompt">').on("keyup", _onPromptKeypress).appendTo($consoleContainer);

		var $tracesContainer = $('<div class="table-container active" id="jdiehl-debugger-traces">').appendTo($panel);
		var $traces = $('<div class="traces">').appendTo($tracesContainer);
		var $tracesEvents = $('<div class="events">').appendTo($traces).html("line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>line<br>");
		$tracesTree = $('<div class="tree">').appendTo($traces).html('<ul><li><a href="#">Root</a><ul><li><a href="#">Child 1</a></li><li><a href="#">Child 2</a></li></ul></li><li><a href="#">Single entry</a></li></ul>');

		// attach the console to the main view's content
		$(".main-view .content").append($panel);

		Inspector.on("connect", _onConnect);
		Inspector.on("disconnect", _onDisconnect);
		Inspector.on("Console.messageAdded", _onMessageAdded);
		Inspector.on("Console.messageRepeatCountUpdated", _onMessageRepeatCountUpdated);

		if (Inspector.connected()) _onConnect();
	}

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
				console.log("before.jstree");
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

	function unload() {
		Inspector.off("connect", _onConnect);
		Inspector.off("disconnect", _onDisconnect);
		Inspector.off("Console.messageAdded", _onMessageAdded);
		Inspector.off("Console.messageRepeatCountUpdated", _onMessageRepeatCountUpdated);
		$panel.remove();
		EditorManager.resizeEditor();
	}

	// toggle the display of the console
	function toggle(show) {
		$panel.toggle(show);
		EditorManager.resizeEditor();
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
	exports.toggle = toggle;
});
